from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="SproutSync API", version="0.1.0")


class HealthResponse(BaseModel):
    status: str
    service: str


@app.get("/api/v1/health", response_model=HealthResponse, tags=["health"])
def health() -> HealthResponse:
    """Process liveness only; database and MQTT readiness are not implemented."""
    return HealthResponse(status="ok", service="sproutsync-api")
