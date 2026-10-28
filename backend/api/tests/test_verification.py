"""Unit tests for multi-attempt email verification and cooldown logic."""

import hashlib
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth import get_current_user
from app.config import settings
from app.db import Base, get_db
from app.main import app
from app.models import User


@pytest.fixture
def auth_test_env():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        unverified_user = User(
            google_subject="test-unverified-subject",
            email="newuser@example.test",
            display_name="New User",
            role="evaluator",
            is_active=True,
            registration_provider="email",
            onboarding_email_verified_at=None,
        )
        db.add(unverified_user)
        db.commit()
        db.refresh(unverified_user)

        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_user] = lambda: unverified_user

        with TestClient(app) as client:
            yield client, db, unverified_user

        app.dependency_overrides.clear()
    engine.dispose()


def test_send_verification_and_cooldown(auth_test_env):
    client, db, user = auth_test_env

    with patch("app.main.send_verification_email") as mock_email:
        # First send
        res1 = client.post("/api/v1/auth/verify/send")
        assert res1.status_code == 200
        data1 = res1.json()
        assert data1["status"] == "sent"
        assert data1["email"] == user.email
        assert mock_email.call_count == 1

        db.refresh(user)
        assert user.verification_code_hash is not None
        assert user.verification_expires_at is not None
        assert user.verification_attempts == 0

        # Immediate second send hits 60s cooldown
        res2 = client.post("/api/v1/auth/verify/send")
        assert res2.status_code == 200
        data2 = res2.json()
        assert data2["status"] == "cooldown_active"
        assert data2["retry_after_seconds"] <= 60
        # No extra email dispatched during cooldown
        assert mock_email.call_count == 1


def test_missing_smtp_is_unavailable_without_false_sent_or_cooldown(auth_test_env, monkeypatch):
    client, db, user = auth_test_env
    monkeypatch.setattr(settings, "google_smtp_email", "")
    monkeypatch.setattr(settings, "google_app_password", "")
    response = client.post("/api/v1/auth/verify/send")
    assert response.status_code == 503
    assert "not configured" in response.json()["detail"]
    db.refresh(user)
    assert user.verification_last_sent_at is None
    assert user.verification_code_hash is None


def test_multi_attempt_verification_and_lockout(auth_test_env):
    client, db, user = auth_test_env

    correct_otp = "842195"
    user.verification_code_hash = hashlib.sha256(correct_otp.encode()).hexdigest()
    user.verification_expires_at = datetime.now(UTC) + timedelta(minutes=10)
    user.verification_attempts = 0
    db.commit()

    # Attempt 1: wrong code
    res = client.post("/api/v1/auth/verify/confirm", json={"code": "000000"})
    assert res.status_code == 400
    assert "4 attempts remaining" in res.json()["detail"]
    db.refresh(user)
    assert user.verification_attempts == 1

    # Attempt 2: wrong code
    res = client.post("/api/v1/auth/verify/confirm", json={"code": "111111"})
    assert res.status_code == 400
    assert "3 attempts remaining" in res.json()["detail"]

    # Attempt 3: wrong code
    res = client.post("/api/v1/auth/verify/confirm", json={"code": "222222"})
    assert res.status_code == 400
    assert "2 attempts remaining" in res.json()["detail"]

    # Attempt 4: wrong code
    res = client.post("/api/v1/auth/verify/confirm", json={"code": "333333"})
    assert res.status_code == 400
    assert "1 attempt remaining" in res.json()["detail"]

    # Attempt 5: correct code succeeds without sending extra emails
    res = client.post("/api/v1/auth/verify/confirm", json={"code": correct_otp})
    assert res.status_code == 200
    assert res.json()["status"] == "verified"

    db.refresh(user)
    assert user.onboarding_email_verified_at is not None
    assert user.verification_code_hash is None
    assert user.verification_attempts == 0


def test_lockout_after_five_failed_attempts(auth_test_env):
    client, db, user = auth_test_env

    correct_otp = "123456"
    user.verification_code_hash = hashlib.sha256(correct_otp.encode()).hexdigest()
    user.verification_expires_at = datetime.now(UTC) + timedelta(minutes=10)
    user.verification_attempts = 0
    db.commit()

    for _ in range(4):
        res = client.post("/api/v1/auth/verify/confirm", json={"code": "999999"})
        assert res.status_code == 400

    # 5th attempt locks the account
    res5 = client.post("/api/v1/auth/verify/confirm", json={"code": "999999"})
    assert res5.status_code == 429
    assert "locked for 60 seconds" in res5.json()["detail"]

    # 6th attempt while locked returns 429
    res6 = client.post("/api/v1/auth/verify/confirm", json={"code": correct_otp})
    assert res6.status_code == 429
    assert "Verification locked" in res6.json()["detail"]
