# SPDX-License-Identifier: AGPL-3.0-or-later

"""Optional RFC-3161 trusted timestamp over a submission archive's manifest hash.

Uses rfc3161ng (MIT-licensed, AGPL-compatible) instead of hand-rolling ASN.1 TimeStampReq/
TimeStampResp encoding. A failure here never blocks the archive itself; it is recorded
as a warning next to the manifest so Marc can retry or investigate.
"""

from datetime import UTC, datetime

import rfc3161ng
from pyasn1.codec.der import encoder

from app.files.atomic import write_once


def request_timestamp(tsa_url: str, data: bytes) -> bytes:
    """Return the DER-encoded RFC-3161 TimeStampResp covering the SHA-256 digest of data."""
    timestamper = rfc3161ng.RemoteTimestamper(tsa_url, hashname="sha256")
    response = timestamper(data=data, return_tsr=True)
    return encoder.encode(response)


def timestamp_manifest(settings, folder, manifest_bytes: bytes) -> dict:
    """Best-effort: write manifest.json.tsr next to the manifest, never raise. Caller checks settings.submission_tsa_url first."""
    now = datetime.now(UTC).isoformat()
    try:
        token = request_timestamp(settings.submission_tsa_url, manifest_bytes)
        write_once(folder / "manifest.json.tsr", token)
        return {"status": "ok", "tsa_url": settings.submission_tsa_url, "requested_at": now}
    except Exception as exc:  # noqa: BLE001 - a failed timestamp must not block the archive itself
        return {"status": "failed", "tsa_url": settings.submission_tsa_url, "requested_at": now, "error": str(exc)}
