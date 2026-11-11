"""The published contract must cover actual routes, auth and response payloads."""

from fastapi.testclient import TestClient

from app.devices import ConnectRequest, IssueRequest, NearbyRequest
from app.main import BatchCreateRequest, app


def test_swagger_and_canonical_openapi_contract():
    client = TestClient(app)
    response = client.get("/docs")
    assert response.status_code == 200
    assert '"persistAuthorization": false' in response.text
    assert '"displayRequestDuration": true' in response.text
    assert '"validatorUrl": null' in response.text
    assert "SwaggerUIBundle" in response.text
    assert client.get("/redoc").status_code == 200
    schema = client.get("/openapi.json").json()
    assert schema["info"]["version"] == "0.3.0"
    assert "/health" not in schema["paths"]
    assert "/superadmin/accounts" not in schema["paths"]
    assert client.get("/health").status_code == 200
    assert client.get("/").status_code == 200
    operation_ids = []
    for path, methods in schema["paths"].items():
        assert path.startswith("/api/v1/")
        for operation in methods.values():
            operation_ids.append(operation["operationId"])
            assert len(operation["description"]) > 120, path
            if path in ("/api/v1/health", "/api/v1/ready"):
                assert not operation.get("security")
            else:
                assert operation["security"] == [{"SupabaseSession": []}]
                assert {"401", "403", "503"}.issubset(operation["responses"])
    assert len(operation_ids) == len(set(operation_ids))
    assert schema["paths"]["/api/v1/devices/live"]["get"]["responses"]["200"][
        "content"
    ]["application/json"]["schema"] == {"$ref": "#/components/schemas/LiveResponse"}
    assert "410" in schema["paths"]["/api/v1/devices/nearby"]["post"]["responses"]
    assert (
        "409"
        in schema["paths"]["/api/v1/superadmin/accounts/{user_id}"]["delete"][
            "responses"
        ]
    )
    assert "503" in schema["paths"]["/api/v1/ready"]["get"]["responses"]


def test_documented_request_examples_are_valid():
    for model in (BatchCreateRequest, ConnectRequest, NearbyRequest, IssueRequest):
        for example in model.model_json_schema()["examples"]:
            model.model_validate(example)


def test_schema_contains_no_environment_credentials():
    from app.config import settings

    schema = TestClient(app).get("/openapi.json").text
    for secret in (
        settings.database_url,
        settings.supabase_service_role_key,
        settings.mqtt_password,
        settings.google_app_password,
    ):
        if len(secret) >= 10:
            assert secret not in schema
