# SPDX-License-Identifier: AGPL-3.0-or-later
"""Public response contracts expose useful types, including dynamic extension payloads."""

from importlib.metadata import version

from app.coding.views import CodingRunnerView
from app.main import create_app


def test_runner_contract_preserves_backends_without_an_identifier():
    payload = {"ready": True, "languages": ["python"], "network": False}
    assert CodingRunnerView.model_validate(payload).model_dump(exclude_unset=True) == payload


def test_reviewed_namespaces_have_json_response_contracts(settings, factory, coordinator):
    schema = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator).openapi()
    prefixes = ("/api/learning/assessment", "/api/learning/coding", "/api/addons", "/api/connectors",
                "/api/entities", "/api/jobs", "/api/recovery", "/api/release", "/api/setup")
    missing = []
    for path, operations in schema["paths"].items():
        if not path.startswith(prefixes):
            continue
        for method, operation in operations.items():
            for code, response in operation.get("responses", {}).items():
                if code.startswith("2"):
                    content = response.get("content", {}).get("application/json")
                    if content is not None and content.get("schema") == {}:
                        missing.append(f"{method} {path}")
    assert not missing, missing
    assert schema["info"]["version"] == version("unios")
