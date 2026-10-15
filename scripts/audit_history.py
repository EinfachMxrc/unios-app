# SPDX-License-Identifier: AGPL-3.0-or-later

"""Check reachable source blobs; flag private/large paths without reading their content."""

import argparse
import re
import subprocess
from collections import Counter
from pathlib import Path

PATTERNS = {
    "private_key": re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "github_token": re.compile(rb"\b(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}"),
    "cloud_key": re.compile(rb"\bAKIA[0-9A-Z]{16}\b"),
    "api_key": re.compile(rb"\bsk-[A-Za-z0-9]{32,}\b"),
    "session_url": re.compile(rb"[?&](?:Session|token)=[A-Za-z0-9+/=]{24,}", re.IGNORECASE),
}
PRIVATE_PATH = re.compile(
    r"(^|/)(?:data|local|backup|restore)/|(^|/)\.env(?:$|\.(?!example$))|"
    r"(^|/)(?:\.phase6-[^/]*|phase6tmp2|_tmp_campus_20260929|campus-short2|"
    r"campus-tmp-codex-final|campus-tmp-codex-run|mensa-tmp)(?:/|$)|"
    r"\.(?:zip|sqlite3?|db|pem|key|p12|pfx|pdf)$", re.IGNORECASE,
)
MAX_BLOB_BYTES = 4_000_000


def audit(git_dir: Path) -> tuple[int, int, list[tuple[str, str, str]]]:
    command = ["git", f"--git-dir={git_dir}"]
    objects = subprocess.run(command + ["rev-list", "--objects", "--all"],
                             check=True, capture_output=True).stdout.decode("utf-8", "replace")
    paths: dict[str, set[str]] = {}
    for line in objects.splitlines():
        oid, _, name = line.partition(" ")
        paths.setdefault(oid, set())
        if name:
            paths[oid].add(name)
    findings: list[tuple[str, str, str]] = []
    kinds: Counter[str] = Counter()
    eligible: list[str] = []
    # Metadata first: even a forbidden archive or multi-GB object must never be
    # materialized in memory merely to find its path/size in the report.
    with subprocess.Popen(command + ["cat-file", "--batch-check"], stdin=subprocess.PIPE,
                          stdout=subprocess.PIPE, stderr=subprocess.DEVNULL) as process:
        assert process.stdin is not None and process.stdout is not None
        for oid, names in paths.items():
            process.stdin.write((oid + "\n").encode("ascii"))
            process.stdin.flush()
            header = process.stdout.readline().decode("ascii").split()
            if len(header) != 3:
                raise RuntimeError("Git-Objekt konnte nicht gelesen werden")
            kind, size = header[1], int(header[2])
            kinds[kind] += 1
            if kind != "blob":
                continue
            private = [name for name in names if PRIVATE_PATH.search(name)]
            for name in private:
                findings.append(("private_path_unread", name, oid[:12]))
            if private:
                continue
            if size > MAX_BLOB_BYTES:
                findings.append(("large_blob_unscanned", next(iter(names), "(unbenannt)"), oid[:12]))
                continue
            eligible.append(oid)
        process.stdin.close()
    with subprocess.Popen(command + ["cat-file", "--batch"], stdin=subprocess.PIPE,
                          stdout=subprocess.PIPE, stderr=subprocess.DEVNULL) as process:
        assert process.stdin is not None and process.stdout is not None
        for oid in eligible:
            names = paths[oid]
            process.stdin.write((oid + "\n").encode("ascii"))
            process.stdin.flush()
            header = process.stdout.readline().decode("ascii").split()
            if len(header) != 3 or header[1] != "blob" or int(header[2]) > MAX_BLOB_BYTES:
                raise RuntimeError("Git-Objekt hat unerwartete Metadaten")
            payload = process.stdout.read(int(header[2]))
            process.stdout.read(1)
            for label, expression in PATTERNS.items():
                if expression.search(payload):
                    findings.append((label, next(iter(names), "(unbenannt)"), oid[:12]))
        process.stdin.close()
    return kinds["blob"], len(paths), sorted(set(findings))


def main() -> int:
    parser = argparse.ArgumentParser(description="Vertrauliche Git-Historie ohne Wertausgabe prüfen")
    parser.add_argument("--git-dir", type=Path, default=Path(".git"))
    args = parser.parse_args()
    blobs, objects, findings = audit(args.git_dir.resolve())
    print(f"Geprüft: {objects} Git-Objekte, {blobs} Blobs; Fundstellen: {len(findings)}")
    for label, path, oid in findings:
        print(f"{label}: {path} ({oid})")
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
