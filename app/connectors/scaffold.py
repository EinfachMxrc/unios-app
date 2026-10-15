# SPDX-License-Identifier: AGPL-3.0-or-later

"""Generate a network-free API v1 development scaffold, never a granted plug-in."""

import argparse
import json
from pathlib import Path

from app.connectors.manifest import ConnectorManifest

READ_CAPABILITIES = frozenset({"courses.read", "materials.read", "assignments.read",
                               "announcements.read", "calendar.read"})


def create_scaffold(directory: Path, *, connector_id: str, university: str,
                    capabilities: set[str] | None = None) -> Path:
    capabilities = {"courses.read"} if capabilities is None else capabilities
    if not capabilities or not capabilities <= READ_CAPABILITIES:
        raise ValueError("Nur implementierte v1-Lesefähigkeiten sind erlaubt")
    if capabilities & {"materials.read", "assignments.read", "announcements.read"} and "courses.read" not in capabilities:
        raise ValueError("Kursinhalte benötigen courses.read")
    if not university.strip() or len(university) > 100 or any(ord(char) < 32 for char in university):
        raise ValueError("Hochschulname muss 1–100 druckbare Zeichen enthalten")
    manifest = ConnectorManifest.model_validate({
        "id": connector_id, "package": "unios-connector-" + connector_id.replace("_", "-"),
        "package_version": "0.1.0", "api_version": 1,
        "capabilities": sorted(capabilities), "domains": [], "secrets": [],
        "review_status": "reference", "runtime": "trusted_python",
        "maintainer": "Lokale Entwicklung",
    })
    if directory.is_symlink() or directory.exists():
        raise ValueError("Ziel muss ein neuer Ordner sein; bestehende Dateien werden nicht verändert")
    if not directory.parent.is_dir():
        raise ValueError("Der übergeordnete Ordner muss bereits existieren")
    source = '''# SPDX-License-Identifier: AGPL-3.0-or-later
"""Network-free development fixture. No real campus connection."""
import json
from pathlib import Path
from app.connectors.sdk import (ConnectorAuth, ConnectorContext, ConnectorStatus,
                                RemoteCourse, RemoteResource, Snapshot)

class UniversityConnector:
    name = CONNECTOR_ID

    def __init__(self, context: ConnectorContext):
        self.context = context

    def check_auth(self):
        return ConnectorAuth("fictional-student", capabilities=self.context.capabilities)

    def list_courses(self):
        if "courses.read" not in self.context.capabilities:
            return []
        fixture = json.loads((Path(__file__).parent / "fixtures" / "course.json").read_text(encoding="utf-8"))
        return [RemoteCourse(key=fixture["key"], name=fixture["name"])]

    def fetch_changes(self, since: int | None = None):
        return Snapshot(courses=self.list_courses(), assignments_complete=False)

    def download(self, resource: RemoteResource):
        raise ValueError("Diese Vorlage enthält keine herunterladbaren Dateien")

    def health(self):
        return ConnectorStatus("ok", "Erfundene Fixture; keine Hochschulverbindung")

def create_connector(context: ConnectorContext):
    return UniversityConnector(context)
'''.replace("CONNECTOR_ID", repr(connector_id))
    contract = '''# SPDX-License-Identifier: AGPL-3.0-or-later
import importlib.util
import json
from pathlib import Path
import pytest
from app.connectors.manifest import ConnectorManifest
from app.connectors.sdk import PermissionedConnector, RemoteResource, connector_context

def test_generated_contract(monkeypatch):
    root = Path(__file__).resolve().parents[1]
    manifest = ConnectorManifest.model_validate(json.loads((root / "manifest.json").read_text()))
    spec = importlib.util.spec_from_file_location("generated_connector", root / "connector.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    context = connector_context(manifest, "fixture", {}, {})
    monkeypatch.setattr(type(context), "get", lambda *args, **kwargs: pytest.fail("Network access"))
    connector = PermissionedConnector(module.create_connector(context), manifest)
    assert connector.check_auth().capabilities == manifest.capabilities
    snapshot = connector.fetch_changes()
    assert bool(snapshot.courses) == ("courses.read" in manifest.capabilities)
    assert not snapshot.events and not snapshot.assignments_complete
    assert connector.health().status == "ok"
    with pytest.raises(ValueError):
        connector.download(RemoteResource("blocked", "blocked", "https://blocked.invalid/a", "file"))
'''
    # All validation precedes the exclusive mkdir; the generator never edits an existing tree.
    directory.mkdir()
    (directory / "fixtures").mkdir()
    (directory / "tests").mkdir()
    manifest_payload = manifest.model_dump(mode="json")
    for key in ("capabilities", "domains", "secrets"):
        manifest_payload[key] = sorted(manifest_payload[key])
    files = {
        "manifest.json": json.dumps(manifest_payload, ensure_ascii=False, indent=2) + "\n",
        "connector.py": source,
        "fixtures/course.json": json.dumps({"key": "fictional-course-1", "name": "Erfundener Beispielkurs"}, ensure_ascii=False) + "\n",
        "tests/test_contract.py": contract,
        "README.md": "<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->\n\n# " + university + " – Entwicklungsvorlage\n\n"
        "Erfundene Daten, kein Netz, keine Secrets. Manifeststatus reference, keine Freigabe.\n\n"
        "Im UniOS-Repository: `uv run pytest <dieser-Ordner>/tests -q`.\n\n"
        "Für echte Parser lokale Fake-Server ergänzen; exakte Domains erst nach Review deklarieren.\n"
        "Öffentliche Auslieferung benötigt einen isolierten Container mit geprüftem SHA-256-Digest;\n"
        "diese Vorlage registriert und installiert nichts. Siehe docs/ADD_UNIVERSITY.md.\n",
    }
    for relative, content in files.items():
        with (directory / relative).open("x", encoding="utf-8", newline="\n") as stream:
            stream.write(content)
    return directory


def main() -> None:
    parser = argparse.ArgumentParser(description="UniOS Connector API v1: sichere Entwicklungsvorlage")
    parser.add_argument("directory", type=Path)
    parser.add_argument("--id", required=True, dest="connector_id")
    parser.add_argument("--university", required=True)
    parser.add_argument("--capability", action="append", choices=sorted(READ_CAPABILITIES))
    args = parser.parse_args()
    try:
        result = create_scaffold(args.directory, connector_id=args.connector_id,
                                 university=args.university,
                                 capabilities=set(args.capability) if args.capability else None)
    except (ValueError, OSError) as exc:
        parser.error(str(exc))
    print(f"Entwicklungsvorlage erstellt: {result}")


if __name__ == "__main__":
    main()
