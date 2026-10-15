# SPDX-License-Identifier: AGPL-3.0-or-later
"""Versioned, bounded contracts; a missing test is never a successful test."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Persona(Contract):
    id: str = Field(pattern=r"^[a-z][a-z0-9-]{0,63}$")
    description: str = Field(min_length=1, max_length=2000)
    platform: Literal["windows", "macos", "linux", "any"]
    experience: Literal["beginner", "experienced", "chaotic"]


class Mission(Contract):
    id: str = Field(pattern=r"^[a-z][a-z0-9-]{0,63}$")
    persona: str = Field(min_length=1, max_length=64)
    goal: str = Field(min_length=1, max_length=2000)
    gate: str = Field(min_length=1, max_length=64)
    budget_seconds: int = Field(default=600, ge=30, le=1800)
    budget_actions: int = Field(default=100, ge=1, le=300)
    requires_real_device: bool = False


class Artifact(Contract):
    id: str = Field(pattern=r"^[a-z][a-z0-9-]{0,63}$")
    path: str = Field(min_length=1, max_length=250)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    size: int = Field(ge=0, le=2_000_000)
    kind: Literal["junit", "command_log", "retrieval_metrics", "fixture_manifest"]


class GateResult(Contract):
    id: str
    status: Literal["passed", "failed", "blocked", "not_run"]
    exit_code: int | None = None
    duration_seconds: float = Field(default=0.0, ge=0)
    tests: int = Field(default=0, ge=0)
    failures: int = Field(default=0, ge=0)
    skipped: int = Field(default=0, ge=0)
    evidence: list[str] = Field(default_factory=list, max_length=4)
    reason: str = Field(default="", max_length=500)


class AgentObservation(Contract):
    """An external model's claim, not an execution proof or deterministic grade."""

    mission_id: str = Field(min_length=1, max_length=64)
    role: Literal["tester", "verifier", "ux_reviewer"]
    agent_id: str = Field(min_length=1, max_length=100)
    model: str = Field(min_length=1, max_length=100)
    conclusion: Literal["passed", "failed", "blocked"]
    summary: str = Field(min_length=1, max_length=4000)
    evidence: list[str] = Field(min_length=1, max_length=12)
    elapsed_seconds: float = Field(ge=0, le=1800)
    actions: int = Field(ge=0, le=300)


class FixtureBudget(Contract):
    semesters: int = Field(default=4, ge=1, le=12)
    courses: int = Field(default=12, ge=1, le=120)
    documents: int = Field(default=100, ge=20, le=50_000)
    pages_per_document: int = Field(default=2, ge=1, le=10)
    max_bytes: int = Field(default=20_000_000, ge=100_000, le=200_000_000)


class ReleaseReport(Contract):
    schema_version: Literal[1] = 1
    run_id: str
    created_at: str
    revision: str
    execution: Literal["deterministic_synthetic"] = "deterministic_synthetic"
    gates: list[GateResult]
    artifacts: list[Artifact]
    observations: list[AgentObservation] = Field(default_factory=list, max_length=100)
    manual_gates: list[str]
    limitations: list[str]
