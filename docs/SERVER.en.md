<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# UniOS on your own server

> English translation of [SERVER.md](SERVER.md). The German file is authoritative; if the two
> differ, follow the German one and please open an issue.

**Operating state 03 Oct 2026:** version 0.1.18, schema `ff94af768293`.
Snapshot created and verified through the paired app at Marc's request (16:24);
Marc explicitly confirmed its use before the update.
The image was first checked without network access or real user data, as user
10001 with a read-only file system: health/web 200,
private API without pairing 401. Afterwards only the UniOS container was
updated, through the existing edge connection. Container healthy;
app version, schema, assessment types and a ready coding runner confirmed through the paired
Windows client. Windows app 0.1.18 installed; the old source-code autostart was disabled.
The separate runner uses its own KVM VM and an explicitly approved
private systemd proxy; details in [RUNNER.md](RUNNER.md).
The release uses its own versioned
Compose environment file and does not overwrite existing secret files.

Since 0.1.13 your own VPS can read university sources around the clock and manage the data. The native React/TypeScript/Tauri app stays on Windows, macOS or Linux. In client mode its bundled service is a local HTTPS bridge; it starts neither a second database nor a scheduler nor a host takeover.

## What lives where

| Place | Content |
| --- | --- |
| VPS | SQLite, versioned original files, search, tasks, appointments, notes, university connections, speech recognition |
| Device | Installed app, device key in the OS keychain, local note drafts and the existing offline cache |
| Separate server file | Private master key for the encrypted server keychain |

Offline notes keep their base version. When the device reconnects, the existing three-way merge stays active. A change of server cannot silently reuse the same cache; a separate data transfer is required for that. Existing local installations keep their legacy mode until you explicitly migrate. New installations begin with server pairing.

A server does not mean end-to-end encryption of the whole database against the server operator: your own server can process your study data. In the described setup, HTTPS traffic runs through the already existing Cloudflare tunnel. Credentials are additionally stored encrypted in the server keychain; this does not automatically encrypt the complete material and database store.

## Starting the server

Requirements: your own Linux VPS, Docker/Compose, an existing HTTPS entry point. A single API process is the only writer. The container runs as UID 10001, without additional Linux capabilities, with a read-only root file system and private data volumes. Port 8008 is bound to loopback only. The Docker socket and arbitrary host files are not mounted.

For the alpha, provide the source state `v0.1.19` in a release directory of its own
under `/opt/unios/releases/`, for example `/opt/unios/releases/v0.1.19`.
Deployment needs repository access as long as the repository is private.
`provision.sh` deliberately accepts only this release path, not an arbitrary
checkout. First build the image:

```sh
cd /opt/unios/releases/v0.1.19
docker build -t unios-server:0.1.19 -f deploy/server/Dockerfile .
sudo bash deploy/server/provision.sh "$PWD" https://studium.example.org/unios
docker compose --env-file /opt/unios/deploy.env \
  -f deploy/server/compose.yaml -f deploy/server/compose.edge.yaml up -d --no-build
```

The additional `compose.edge.yaml` assumes an existing external network called `edge`. With a different reverse proxy, use only the base file and attach the loopback port. `provision.sh` does not start a service and creates the master key only for a new data store. Source path, data directory and HTTPS address are kept in `deploy.env`/`server.env`, separate from secrets.

`Caddyfile.fragment` extends an existing HTTPS entry point under `/unios`. Caddy strips the prefix before forwarding, sets the external host/HTTPS headers and disables access logs for this path. API and file responses get `private, no-store`. `install_edge_route.py` is meant solely for the existing site in `/opt/edge/Caddyfile`: validate the candidate, back up the original, write the bind-mounted file in place, reload; on failure, roll back. Configure other Caddy setups separately.

**The prefix access is currently prepared for native clients.** It is not an accepted browser/phone PWA: frontend assets and the browser router still expect a root path. A public URL request also does not replace device pairing. Without pairing, the private API and materials return HTTP 401; the technical health route returns no study data.

## Taking over data from an existing installation

1. Let a running sync finish and close the old app completely.
2. Create a random **32-byte key in binary form** in a privately protected file. On Windows, do not use a text-based file descriptor. Never print the key in chat, Git or logs.
3. Export on the old device, using its OS keychain:

   ```sh
   python -m app.server.migration export --home /path/to/unios-home \
     --package /private/transfer.enc --key-file /private/transfer.key
   ```

4. Transfer the package and key only over a trusted channel. The package is protected by AES-GCM in ordered blocks with a final check. The export first creates a verified snapshot; original files are kept. It takes over only defined settings and selected credentials through their respective domain stores, never an OS keychain dump, `.env`, device sessions or logs.
5. Import into a **new** server data store. Provision the master key privately beforehand. Example for the provided image:

   ```sh
   docker run --rm --user 10001:10001 --network none \
     -v /opt/unios/state:/var/lib/unios \
     -v /opt/unios/secrets/unios.key:/run/secrets/unios.key:ro \
     -v /opt/unios/incoming:/incoming:ro \
     -e UNIOS_SERVER_KEY=/run/secrets/unios.key \
     -e DATA_DIR=/var/lib/unios/data -e LOCAL_DIR=/var/lib/unios/local \
     --entrypoint python unios-server:0.1.18 -m app.server.migration import \
     --home /var/lib/unios --package /incoming/transfer.enc --key-file /incoming/transfer.key
   ```

   The input files and directory must be private and readable by UID 10001. The import rejects an existing data store, checks all file hashes and SQLite integrity before publishing, and creates a new server host ID with a higher generation. Old Windows path separators in file, note and audio references are then converted to portable paths in the verified staging store; absolute paths, traversal and missing target files are rejected. The original store remains unchanged. The staging store lives in the same Docker volume so that atomic renames work. Archive links and unsafe paths are rejected; file links are stored as independent files on export.
6. After a successful check, start the server, pair the device and verify its client operation. Keep the original store until acceptance; do not keep running it as a second host. Remove the temporary transfer keys afterwards.

Before schema migrations the service creates a verified snapshot. The live database and the app installation are not synchronised with Syncthing. Old CLI commands that would write directly into the left-behind database in client mode are blocked; REST-based entity/API commands remain usable.

## Pairing the app and using Work

Agent Gateway v2 uses eight core tools and the prepared corpus index.
Contracts, source handles, approvals, budget limits and the optional OAuth service
are described in [AGENT_GATEWAY.md](AGENT_GATEWAY.md). The normal local Work client stays
stdio-based and delegates to the VPS through its existing device pairing. The
separate Compose overlay `compose.mcp.yaml` is only enabled after a deliberate remote setup;
on the VPS it publishes loopback port 8009 only. A new
corpus migration on the real data store again requires Marc's verified snapshot.

Create a one-time code, valid for ten minutes, administratively:

```sh
docker exec unios-server python -m app.server pair
```

Enter the code only in the app. The client exchanges it over verified HTTPS for a revocable device key; that key lives in the OS keychain, not in browser storage. More devices can be paired and revoked under Settings → Devices. The server is the permanent host; laptop takeover surfaces no longer apply.

The existing local Work/MCP connection stays stdio-based. `uniosd mcp` talks to the local companion service; it checks the local MCP approval and uses its server device pairing. Course/area approvals and device revocation still apply. The server MCP key is not copied into the client configuration. Restart an already running Work chat if needed so that it reloads its MCP configuration.

University sign-in and MFA stay in the native university windows on the user's device. The explicitly captured session is stored in the server keychain over the authenticated connection. IP-bound or expired university sessions may require signing in again. The move does not create a Microsoft app registration. As an alternative, set up the forwarding receiver described below.
Anki remains a separate device agent; a VPS does not replace a local Anki installation. Community connectors need their own isolated execution environment; the API container gets no privileged Docker socket for that.

## Operations update of 05 Oct 2026: Moodle and SQLite write conflicts

The following TXT reader package is active as
`unios-server:0.1.19-txt-reader-20261005`, without a schema change.
It adds the PDF view for TXT and the built web interface. An isolated
Linux test with synthetic texts and a source/schema comparison passed;
data volumes and edge configuration were kept. Compatible predecessor:
`unios-server:0.1.19-sqlite-lock-20261005`. Native clients keep using
their installed interface; new course links arrive with the next app package.

The image `unios-server:0.1.19-sqlite-lock-20261005` reserves a SQLite write lock
before the short file savepoint, before metadata is read.
Download and parsing happen beforehand without that lock. Other writers get
a bounded wait of 30 seconds. This way the import avoids the reproduced
conflict with a WAL snapshot that changed in the meantime.
Models and migrations are unchanged and were checked by source manifest comparison;
the update needs no database migration. The previous image remains available as
`unios-server:before-sqlite-lock-20261005`. The normal Moodle sync
after activation was confirmed as successful through the paired client.

## Speech recognition, OCR and backup

For mail without a Microsoft app registration: [forwarding to the VPS](MAIL_FORWARDING.md). The dedicated receiver needs its own DNS-only mail host, a TLS certificate and inbound SMTP in the provider firewall. It is verified separately from the HTTPS tunnel and marked ready only after external acceptance.

The server image contains the speech runtime, Chromium for read-only PRIMUSS certificates and German/English Tesseract language packs. The multilingual Whisper model must be provided under `state/models/whisper-base`; the Compose file mounts this persistent path. Use a fixed model revision for reproducible installations. On the deployed VPS, `Systran/faster-whisper-base` was set up at revision `ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66`. For transcription, recordings leave the device and go to your own server; no cloud AI is needed.

Snapshots on the same VPS protect against failed migrations but are **not an external backup**. Restoring needs the data, the encrypted keychain and the separately backed-up master key. Losing the master key makes the keychain unreadable; there is no plaintext fallback. An automatic backup outside the VPS must be set up separately. macOS/Linux clients and the real two-device sleep/offline test still need separate acceptance after this Windows move.
