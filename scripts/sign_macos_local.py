# SPDX-License-Identifier: AGPL-3.0-or-later
"""Keep the keychain identity of private macOS builds stable across updates.

This is a local development certificate, not Developer ID or notarization.
Only its dedicated build keychain is opened; application credentials are untouched.
"""

from __future__ import annotations

import argparse
import os
import re
import secrets
import shlex
import stat
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path

IDENTITY = "UniOS Local Builds"


def run(*args: str) -> str:
    try:
        result = subprocess.run(args, capture_output=True, text=True, check=False, timeout=90)
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"{Path(args[0]).name}: lokaler Signierschritt hat das Zeitlimit erreicht") from None
    if result.returncode:
        # security arguments can contain the build-keychain password. Never echo them.
        reason = ""
        if Path(args[0]).name == "codesign":
            for marker in ("errSecInternalComponent", "no identity found", "unable to build chain", "invalid signature", "resource fork", "not signed at all"):
                if marker in result.stderr:
                    reason = f" ({marker})"
                    break
        raise RuntimeError(f"{Path(args[0]).name}: lokaler Signierschritt fehlgeschlagen{reason}")
    return result.stdout


def private_path(path: Path, *, directory: bool = False) -> None:
    info = path.lstat()
    expected = stat.S_ISDIR if directory else stat.S_ISREG
    getuid = getattr(os, "getuid", None)
    if getuid is None or not expected(info.st_mode) or info.st_uid != getuid() or info.st_mode & 0o077:
        raise PermissionError("Lokale Signierdateien müssen privat sein und dir gehören")


def prepare_identity(root: Path) -> Path:
    """Create once; never silently replace a lost or damaged signing identity."""
    new_identity = not root.exists()
    if new_identity:
        root.mkdir(parents=True, mode=0o700)
    private_path(root, directory=True)
    keychain = root / "build.keychain-db"
    password_file = root / "password"
    if not new_identity and not (keychain.exists() or password_file.exists()):
        raise RuntimeError("Bestehende lokale Signieridentität fehlt; nicht automatisch ersetzen")
    if keychain.exists() or password_file.exists():
        private_path(keychain)
        private_path(password_file)
        password = password_file.read_text(encoding="ascii").strip()
        if len(password) != 64 or any(char not in "0123456789abcdef" for char in password):
            raise RuntimeError("Lokale Signieridentität ist unvollständig")
    else:
        password = secrets.token_hex(32)
        # This is a NEW build credential, never a Moodle token or login password.
        descriptor = os.open(password_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w", encoding="ascii") as stream:
            stream.write(password)
        with tempfile.TemporaryDirectory(prefix="unios-signing-") as directory:
            scratch = Path(directory)
            key, certificate, archive = (scratch / name for name in ("key.pem", "cert.pem", "cert.p12"))
            run("/usr/bin/openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
                "-keyout", str(key), "-out", str(certificate), "-days", "3650",
                "-subj", f"/CN={IDENTITY}/", "-addext", "extendedKeyUsage=codeSigning",
                "-addext", "keyUsage=digitalSignature", "-addext", "basicConstraints=critical,CA:FALSE")
            key.chmod(0o600)
            run("/usr/bin/openssl", "pkcs12", "-export", "-inkey", str(key), "-in", str(certificate),
                "-out", str(archive), "-passout", f"pass:{password}")
            run("/usr/bin/security", "create-keychain", "-p", password, str(keychain))
            keychain.chmod(0o600)
            run("/usr/bin/security", "import", str(archive), "-k", str(keychain), "-P", password,
                "-T", "/usr/bin/codesign")
            run("/usr/bin/security", "set-key-partition-list", "-S", "apple-tool:,apple:",
                "-s", "-k", password, str(keychain))
            # Private key and export are removed with scratch; no system trust roots change.
    run("/usr/bin/security", "unlock-keychain", "-p", password, str(keychain))
    return keychain


@contextmanager
def signing_search_path(keychain: Path):
    # codesign also requires its dedicated chain on the user search list.
    # Read only chain names, never any application credentials. Preserve all
    # other chains and restore the list after this build operation.
    existing = shlex.split(run("/usr/bin/security", "list-keychains", "-d", "user"))
    path = str(keychain)
    added = path not in existing
    if added:
        run("/usr/bin/security", "list-keychains", "-d", "user", "-s", *existing, path)
    try:
        yield
    finally:
        if added:
            current = shlex.split(run("/usr/bin/security", "list-keychains", "-d", "user"))
            run("/usr/bin/security", "list-keychains", "-d", "user", "-s", *(item for item in current if item != path))


def sign(target: Path, keychain: Path, identifier: str) -> None:
    identities = run("/usr/bin/security", "find-identity", "-p", "codesigning", str(keychain))
    matches = sorted(set(re.findall(r'^\s*\d+\)\s+([A-Fa-f0-9]{40}) "UniOS Local Builds"', identities, re.MULTILINE)))
    if len(matches) != 1:
        raise RuntimeError("Lokale Signieridentität nicht eindeutig verfügbar")
    # Pin the certificate itself. Name-based codesign lookup can exclude an
    # otherwise usable local self-signed identity on a fresh build machine.
    with signing_search_path(keychain):
        run("/usr/bin/codesign", "--force", "--sign", matches[0], "--keychain", str(keychain),
            "--identifier", identifier, "--timestamp=none", "--preserve-metadata=entitlements,flags,runtime",
            str(target))
    run("/usr/bin/codesign", "--verify", "--strict", str(target))


def sign_app(app: Path, identity_dir: Path) -> None:
    if sys.platform != "darwin":
        raise RuntimeError("Lokale Mac-Signaturen benötigen macOS")
    if app.is_symlink() or not app.is_dir() or app.suffix != ".app":
        raise ValueError("Eine vorhandene, lokal gebaute .app angeben")
    keychain = prepare_identity(identity_dir)
    # Sign nested code before the container. The identifier stays fixed even
    # when the Python archive changes, while the certificate proves its origin.
    for name, identifier in (("uniosd", "app.unios.desktop.service"),
                             ("unios-desktop", "app.unios.desktop")):
        executable = app / "Contents" / "MacOS" / name
        if executable.is_symlink() or not executable.is_file():
            raise ValueError("UniOS-Paket enthält nicht die erwarteten Programme")
        sign(executable, keychain, identifier)
    sign(app, keychain, "app.unios.desktop")
    run("/usr/bin/codesign", "--verify", "--deep", "--strict", str(app))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("app", type=Path)
    parser.add_argument("--identity-dir", type=Path,
                        default=Path.home() / "Library" / "Application Support" / "UniOS Build Signing")
    args = parser.parse_args()
    sign_app(args.app.absolute(), args.identity_dir.absolute())
    print("Lokales UniOS-Paket mit dauerhafter Programmidentität signiert.")


if __name__ == "__main__":
    main()
