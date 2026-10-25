"""API permissions must match Supabase RLS and cannot trust hidden UI controls."""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth import get_current_user
from app.db import Base, get_db
from app.main import app
from app.models import Batch, User


@pytest.fixture
def workspace():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.execute(
            text(
                "CREATE TABLE evaluator_access(owner_id integer, evaluator_email text)"
            )
        )
        operator = User(
            google_subject="one",
            email="owner@example.test",
            display_name="Owner",
            role="operator",
            is_active=True,
        )
        evaluator = User(
            google_subject="two",
            email="review@example.test",
            display_name="Review",
            role="evaluator",
            is_active=True,
        )
        other = User(
            google_subject="three",
            email="other@example.test",
            display_name="Other",
            role="operator",
            is_active=True,
        )
        db.add_all([operator, evaluator, other])
        db.commit()
        batch = Batch(
            owner_id=operator.id,
            code="TEST-1",
            seed_type="Mung beans",
            stage="soaking",
            status="active",
            started_at=datetime.now(UTC),
        )
        db.add(batch)
        db.commit()
        app.dependency_overrides[get_db] = lambda: db
        with TestClient(app) as client:
            yield client, db, operator, evaluator, other, batch
        app.dependency_overrides.clear()
    engine.dispose()


def test_evaluator_cannot_mutate_batches(workspace):
    client, db, _operator, evaluator, _other, batch = workspace
    app.dependency_overrides[get_current_user] = lambda: evaluator
    assert (
        client.post(
            "/api/v1/batches",
            json={"code": "FORBIDDEN", "started_at": "2026-10-26T00:00:00Z"},
        ).status_code
        == 403
    )
    assert (
        client.patch(
            f"/api/v1/batches/{batch.id}", json={"stage": "harvested"}
        ).status_code
        == 403
    )
    assert client.post(f"/api/v1/batches/{batch.id}/archive").status_code == 403
    db.refresh(batch)
    assert batch.stage == "soaking" and batch.status == "active"


def test_evaluator_only_sees_granted_records(workspace):
    client, db, operator, evaluator, _other, batch = workspace
    app.dependency_overrides[get_current_user] = lambda: evaluator
    assert client.get("/api/v1/batches").json() == []
    db.execute(
        text("INSERT INTO evaluator_access VALUES (:owner, :email)"),
        {"owner": operator.id, "email": evaluator.email},
    )
    db.commit()
    assert [b["id"] for b in client.get("/api/v1/batches").json()] == [batch.id]


def test_operator_cannot_modify_another_operators_batch(workspace):
    client, _db, operator, _evaluator, other, batch = workspace
    app.dependency_overrides[get_current_user] = lambda: other
    assert (
        client.patch(f"/api/v1/batches/{batch.id}", json={"stage": "ready"}).status_code
        == 404
    )
    app.dependency_overrides[get_current_user] = lambda: operator
    assert (
        client.patch(f"/api/v1/batches/{batch.id}", json={"stage": "ready"}).status_code
        == 200
    )
