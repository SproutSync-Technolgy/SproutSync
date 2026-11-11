"""Self-hosted Swagger workspace; documentation requests never operate hardware."""

from html import escape
import json
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

ASSETS = Path(__file__).with_name("docs_ui")


def install_docs_portal(app: FastAPI) -> None:
    app.mount("/docs/assets", StaticFiles(directory=ASSETS), name="docs-assets")

    @app.get("/docs", include_in_schema=False, response_class=HTMLResponse)
    async def documentation(request: Request):
        prefix = request.scope.get("root_path", "").rstrip("/")
        config = (
            json.dumps(
                {
                    "schemaUrl": prefix + app.openapi_url,
                    "basePath": prefix,
                    "persistAuthorization": False,
                    "displayRequestDuration": True,
                    "validatorUrl": None,
                }
            )
            .replace("<", "\\u003c")
            .replace(">", "\\u003e")
            .replace("&", "\\u0026")
        )
        html = ASSETS.joinpath("index.html").read_text(encoding="utf-8")
        html = html.replace("__ASSETS__", escape(prefix + "/docs/assets", quote=True))
        html = html.replace("__BASE__", escape(prefix, quote=True)).replace(
            "__CONFIG__", config
        )
        return HTMLResponse(
            html,
            headers={
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                "Referrer-Policy": "same-origin",
            },
        )
