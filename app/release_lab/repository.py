# SPDX-License-Identifier: AGPL-3.0-or-later
"""Exclusive artifact writes and bounded, path-safe evidence verification."""

import hashlib
import json
from pathlib import Path

from app.release_lab.contracts import Artifact, ReleaseReport

MAX_ARTIFACT_BYTES = 2_000_000


def safe_child(root: Path, relative: str) -> Path:
    path = Path(relative)
    if path.is_absolute() or any(part in ("..", "data", "local", ".env", ".ssh") for part in path.parts):
        raise ValueError("Evidence must use a safe relative path")
    candidate = root.joinpath(path)
    if not candidate.resolve().is_relative_to(root.resolve()) or candidate.is_symlink():
        raise ValueError("Evidence escaped the report directory")
    return candidate


def artifact(root: Path, artifact_id: str, relative: str, kind: str, content: bytes) -> Artifact:
    if len(content) > MAX_ARTIFACT_BYTES:
        raise ValueError("Artifact budget exceeded")
    target = safe_child(root, relative)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("xb") as stream:
        stream.write(content)
    return Artifact.model_validate({"id": artifact_id, "path": relative, "kind": kind,
                                    "size": len(content), "sha256": hashlib.sha256(content).hexdigest()})


def verify_artifact(root: Path, item: Artifact) -> bytes:
    path = safe_child(root, item.path)
    if path.stat().st_size != item.size or item.size > MAX_ARTIFACT_BYTES:
        raise ValueError("Evidence size mismatch")
    with path.open("rb") as stream:
        content = stream.read(MAX_ARTIFACT_BYTES + 1)
    if hashlib.sha256(content).hexdigest() != item.sha256:
        raise ValueError("Evidence hash mismatch")
    return content


def write_report(root: Path, report: ReleaseReport) -> Path:
    target = root / "report.json"
    with target.open("x", encoding="utf-8") as stream:
        json.dump(report.model_dump(), stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    with (root / "report.sha256").open("x", encoding="ascii") as stream:
        stream.write(hashlib.sha256(target.read_bytes()).hexdigest() + "\n")
    return target


def read_report(root: Path) -> ReleaseReport:
    if any(part in ("data", "local", ".env", ".ssh") for part in root.resolve().parts):
        raise ValueError("Cannot inspect private application storage")
    path = safe_child(root, "report.json")
    if path.stat().st_size > MAX_ARTIFACT_BYTES:
        raise ValueError("Report budget exceeded")
    return ReleaseReport.model_validate_json(path.read_bytes())
