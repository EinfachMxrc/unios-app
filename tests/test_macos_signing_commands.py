# SPDX-License-Identifier: AGPL-3.0-or-later
"""Portable checks of command bounds; the real ACL test still needs macOS."""

import subprocess
from pathlib import Path

import pytest

from scripts import sign_macos_local as signing


def test_timeout_does_not_expose_command_arguments(monkeypatch):
    def timed_out(args, **options):
        assert options["timeout"] == 90
        raise subprocess.TimeoutExpired(args, 90, stderr="private fixture detail")

    monkeypatch.setattr(signing.subprocess, "run", timed_out)
    with pytest.raises(RuntimeError, match="Zeitlimit erreicht") as caught:
        signing.run("security", "-p", "invented-private-password")
    assert "password" not in str(caught.value)
    assert "private fixture detail" not in str(caught.value)


def test_same_certificate_in_matching_and_valid_sections_is_one_identity(monkeypatch):
    fingerprint = "A" * 40
    calls = []
    chains = ['original-fixture-chain']

    def fixture_run(*args):
        calls.append(args)
        if "find-identity" in args:
            return f'  1) {fingerprint} "UniOS Local Builds"\n  1) {fingerprint} "UniOS Local Builds"\n'
        if "list-keychains" in args:
            if "-s" in args:
                chains[:] = args[args.index("-s") + 1:]
                return ""
            return '\n'.join(f'"{chain}"' for chain in chains)
        return ""

    monkeypatch.setattr(signing, "run", fixture_run)
    signing.sign(Path("fixture-app"), Path("fixture-build-chain"), "fixture.identifier")
    signed = next(call for call in calls if "--sign" in call)
    assert signed[signed.index("--sign") + 1] == fingerprint
    assert "--verify" in calls[-1]
    assert chains == ['original-fixture-chain']


def test_distinct_certificates_are_never_selected_arbitrarily(monkeypatch):
    monkeypatch.setattr(signing, "run", lambda *args: '\n'.join(
        f'  1) {value * 40} "UniOS Local Builds"' for value in ("A", "B")))
    with pytest.raises(RuntimeError, match="nicht eindeutig"):
        signing.sign(Path("fixture-app"), Path("fixture-build-chain"), "fixture.identifier")
