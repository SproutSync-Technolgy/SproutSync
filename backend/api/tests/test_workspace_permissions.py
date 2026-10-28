"""API permissions must match Supabase RLS and cannot trust hidden UI controls."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth import get_current_user
from app.db import Base, get_db
from app.main import app
from app.models import Batch, EvaluatorAccess, User


@pytest.fixture
def workspace():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.execute(
            text(
                "CREATE TABLE IF NOT EXISTS evaluator_access(id integer primary key, owner_id integer, evaluator_id integer, evaluator_email text, granted_by integer, granted_at timestamp, created_at timestamp)"
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
        text("INSERT INTO evaluator_access (owner_id, evaluator_id, evaluator_email) VALUES (:owner, :eval_id, :email)"),
        {"owner": operator.id, "eval_id": evaluator.id, "email": evaluator.email},
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


def test_superadmin_can_manage_accounts_and_grants(workspace):
    client, db, operator, evaluator, _other, batch = workspace
    superadmin = User(
        google_subject="super-admin-sub",
        email="superadmin@example.test",
        display_name="Super Admin",
        role="superadmin",
        is_active=True,
    )
    db.add(superadmin)
    db.commit()

    # Evaluator cannot access superadmin accounts endpoint
    app.dependency_overrides[get_current_user] = lambda: evaluator
    assert client.get("/api/v1/superadmin/accounts").status_code == 403

    # Operator cannot access superadmin accounts endpoint
    app.dependency_overrides[get_current_user] = lambda: operator
    assert client.get("/api/v1/superadmin/accounts").status_code == 403

    # Superadmin can view all accounts
    app.dependency_overrides[get_current_user] = lambda: superadmin
    res = client.get("/api/v1/superadmin/accounts")
    assert res.status_code == 200
    accounts = res.json()
    assert len(accounts) >= 3

    # Superadmin can view fleet batches
    assert len(client.get("/api/v1/batches").json()) == 1

    # Superadmin can update an account's name, email, and role
    update_res = client.patch(
        f"/api/v1/superadmin/accounts/{evaluator.id}",
        json={
            "first_name": "Senior",
            "last_name": "Reviewer",
            "email": "senior.reviewer@example.test",
            "role": "evaluator",
            "organization": "Independent QA Lab",
            "phone": "+639123456789",
        },
    )
    assert update_res.status_code == 200
    updated_data = update_res.json()
    assert updated_data["display_name"] == "Senior Reviewer"
    assert updated_data["email"] == "senior.reviewer@example.test"

    # Superadmin can grant a device serial ID to an operator
    grant_res = client.post(
        "/api/v1/superadmin/device-grants",
        json={
            "operator_id": operator.id,
            "serial_number": "SS-CHAMBER-9999",
            "name": "Primary Production Chamber",
        },
    )
    assert grant_res.status_code == 201
    grant_data = grant_res.json()
    assert grant_data["serial_number"] == "SS-CHAMBER-9999"
    assert grant_data["owner_id"] == operator.id


def test_pending_user_sees_zero_data_and_can_request_access(workspace):
    client, db, operator, _evaluator, _other, _batch = workspace
    pending_user = User(
        google_subject="pending-sub-1",
        email="pending@example.test",
        display_name="Pending User",
        role="pending",
        is_active=True,
    )
    db.add(pending_user)
    db.commit()

    app.dependency_overrides[get_current_user] = lambda: pending_user

    # Sees zero batches
    batches_res = client.get("/api/v1/batches")
    assert batches_res.status_code == 200
    assert batches_res.json() == []

    # Forbidden from creating or mutating batches
    assert client.post("/api/v1/batches", json={"code": "TRY"}).status_code == 403

    # Forbidden from operator endpoints
    assert client.get("/api/v1/operator/evaluators").status_code == 403
    assert client.get("/api/v1/operator/access-requests").status_code == 403

    # Can submit access request to an operator
    req_res = client.post(
        "/api/v1/access-requests", json={"operator_email": operator.email}
    )
    assert req_res.status_code == 201
    req_data = req_res.json()
    assert req_data["evaluator_id"] == pending_user.id
    assert req_data["operator_id"] == operator.id
    assert req_data["status"] == "pending"


def test_operator_cannot_edit_another_operators_evaluator_or_change_role(workspace):
    client, db, operator, evaluator, other, _batch = workspace
    # Link evaluator to operator
    grant = EvaluatorAccess(
        owner_id=operator.id,
        evaluator_id=evaluator.id,
        evaluator_email=evaluator.email,
        granted_by=operator.id,
        granted_at=datetime.now(UTC),
    )
    db.add(grant)
    db.commit()

    # Operator 'other' attempts to view and edit operator's evaluator
    app.dependency_overrides[get_current_user] = lambda: other
    assert client.get("/api/v1/operator/evaluators").json() == []

    patch_forbidden = client.patch(
        f"/api/v1/operator/evaluators/{evaluator.id}",
        json={
            "first_name": "Hacked",
            "last_name": "Hacked",
            "email": "hacked@example.test",
        },
    )
    assert patch_forbidden.status_code == 403

    # True operator CAN edit their evaluator's name and email
    app.dependency_overrides[get_current_user] = lambda: operator
    patch_success = client.patch(
        f"/api/v1/operator/evaluators/{evaluator.id}",
        json={
            "first_name": "Audited",
            "last_name": "Reviewer",
            "email": "audited.reviewer@example.test",
        },
    )
    assert patch_success.status_code == 200
    db.refresh(evaluator)
    assert evaluator.first_name == "Audited"
    assert evaluator.last_name == "Reviewer"
    assert evaluator.email == "audited.reviewer@example.test"
    # Role cannot be changed by operator
    assert evaluator.role == "evaluator"

    # Evaluator access row was also kept in sync
    db.refresh(grant)
    assert grant.evaluator_email == "audited.reviewer@example.test"


def test_evaluator_keeps_access_after_email_change(workspace):
    client, db, operator, evaluator, _other, batch = workspace
    # Link evaluator to operator via evaluator_id
    grant = EvaluatorAccess(
        owner_id=operator.id,
        evaluator_id=evaluator.id,
        evaluator_email=evaluator.email,
        granted_by=operator.id,
        granted_at=datetime.now(UTC),
    )
    db.add(grant)
    db.commit()

    # Evaluator initially sees the batch
    app.dependency_overrides[get_current_user] = lambda: evaluator
    assert [b["id"] for b in client.get("/api/v1/batches").json()] == [batch.id]

    # Change evaluator's email directly (e.g. administrative or operator edit)
    evaluator.email = "brand.new.address@example.test"
    db.commit()

    # Evaluator queries batches with updated email - still has access via evaluator_id
    assert [b["id"] for b in client.get("/api/v1/batches").json()] == [batch.id]


def test_cannot_demote_last_superadmin(workspace):
    client, db, _operator, _evaluator, _other, _batch = workspace
    superadmin = User(
        google_subject="super-1",
        email="root@example.test",
        display_name="Root Admin",
        role="superadmin",
        is_active=True,
    )
    db.add(superadmin)
    db.commit()

    app.dependency_overrides[get_current_user] = lambda: superadmin

    # Attempt to demote sole superadmin to operator
    demote_res = client.patch(
        f"/api/v1/superadmin/accounts/{superadmin.id}",
        json={
            "first_name": "Root",
            "last_name": "Admin",
            "email": "root@example.test",
            "role": "operator",
        },
    )
    assert demote_res.status_code == 400
    assert "last superadmin" in demote_res.json()["detail"].lower()

    # Create a second superadmin
    admin2 = User(
        google_subject="super-2",
        email="second.admin@example.test",
        display_name="Second Admin",
        role="superadmin",
        is_active=True,
    )
    db.add(admin2)
    db.commit()

    # Now demoting the first superadmin succeeds
    demote_ok = client.patch(
        f"/api/v1/superadmin/accounts/{superadmin.id}",
        json={
            "first_name": "Root",
            "last_name": "Admin",
            "email": "root@example.test",
            "role": "operator",
        },
    )
    assert demote_ok.status_code == 200
    db.refresh(superadmin)
    assert superadmin.role == "operator"


def test_operator_approve_and_decline_requests(workspace):
    client, db, operator, _evaluator, _other, _batch = workspace
    pending_user = User(
        google_subject="pending-req-1",
        email="applicant@example.test",
        display_name="Applicant",
        role="pending",
        is_active=True,
    )
    db.add(pending_user)
    db.commit()

    # Pending user creates access request
    app.dependency_overrides[get_current_user] = lambda: pending_user
    req_res = client.post(
        "/api/v1/access-requests", json={"operator_email": operator.email}
    )
    assert req_res.status_code == 201
    req_id = req_res.json()["id"]

    # Operator views requests
    app.dependency_overrides[get_current_user] = lambda: operator
    requests_list = client.get("/api/v1/operator/access-requests").json()
    assert any(r["id"] == req_id for r in requests_list)

    # Operator approves request
    app_res = client.post(f"/api/v1/operator/access-requests/{req_id}/approve")
    assert app_res.status_code == 200
    assert app_res.json()["status"] == "approved"

    # Pending user is promoted to evaluator and linked
    db.refresh(pending_user)
    assert pending_user.role == "evaluator"
    grant = db.scalar(
        select(EvaluatorAccess).where(EvaluatorAccess.evaluator_id == pending_user.id)
    )
    assert grant is not None
    assert grant.owner_id == operator.id


def test_superadmin_delete_account_safeguards(workspace):
    client, db, operator, _evaluator, _other, _batch = workspace
    admin = User(
        google_subject="super-del-1",
        email="superdel1@example.test",
        display_name="Super Admin 1",
        role="superadmin",
        is_active=True,
    )
    user_to_delete = User(
        google_subject="todelete-1",
        email="todelete@example.test",
        display_name="To Delete",
        role="operator",
        is_active=True,
    )
    db.add_all([admin, user_to_delete])
    db.commit()

    # Operator cannot delete account
    app.dependency_overrides[get_current_user] = lambda: operator
    assert (
        client.delete(f"/api/v1/superadmin/accounts/{user_to_delete.id}").status_code
        == 403
    )

    # Superadmin logged in
    app.dependency_overrides[get_current_user] = lambda: admin

    # Cannot delete own account
    self_del = client.delete(f"/api/v1/superadmin/accounts/{admin.id}")
    assert self_del.status_code == 400
    assert "own" in self_del.json()["detail"].lower()

    # Create a second superadmin
    admin2 = User(
        google_subject="super-del-2",
        email="superdel2@example.test",
        display_name="Super Admin 2",
        role="superadmin",
        is_active=True,
    )
    db.add(admin2)
    db.commit()

    # admin2 deletes admin -> allowed because admin2 remains
    app.dependency_overrides[get_current_user] = lambda: admin2
    del_admin_res = client.delete(f"/api/v1/superadmin/accounts/{admin.id}")
    assert del_admin_res.status_code == 200

    # Delete regular user
    del_res = client.delete(f"/api/v1/superadmin/accounts/{user_to_delete.id}")
    assert del_res.status_code == 200
    assert del_res.json()["success"] is True
    assert db.scalar(select(User).where(User.id == user_to_delete.id)) is None


@pytest.mark.anyio
async def test_email_edit_survives_relogin():
    from unittest.mock import MagicMock
    from app.config import settings

    settings.supabase_url = "https://example.supabase.co"
    settings.supabase_anon_key = "anon-key"

    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        # User created originally with email="original@example.test"
        user = User(
            google_subject="auth0|user123",
            email="original@example.test",
            display_name="Original Name",
            role="operator",
            is_active=True,
        )
        db.add(user)
        db.commit()

        # Admin corrects email in DB to "corrected@example.test" and display name to "Corrected Name"
        user.email = "corrected@example.test"
        user.display_name = "Corrected Name"
        db.commit()

        # Simulate subsequent login where Supabase Auth token still provides original email
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "auth0|user123",
            "email": "original@example.test",
            "email_confirmed_at": "2026-01-01T00:00:00Z",
            "user_metadata": {"full_name": "Original Name"},
            "app_metadata": {"provider": "google", "providers": ["google"]},
        }
        mock_response.raise_for_status = MagicMock()

        creds = HTTPAuthorizationCredentials(
            scheme="Bearer", credentials="dummy-token"
        )
        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response
            logged_in_user = await get_current_user(credentials=creds, db=db)

        # Assert administrative correction was NOT reverted by token data
        assert logged_in_user.email == "corrected@example.test"
        assert logged_in_user.display_name == "Corrected Name"

        # Verify in DB
        db.refresh(user)
        assert user.email == "corrected@example.test"
        assert user.display_name == "Corrected Name"
    engine.dispose()


