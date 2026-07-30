# UnderLeaf

A small, invite-only collaborative LaTeX studio for people and software agents. The browser editor is hosted on GitHub Pages; projects, accounts, compilation, and history stay on the local machine behind a rotating Cloudflare Quick Tunnel.

UnderLeaf is independent and unaffiliated with Underleaf.ai or Overleaf.

## Features

- Multi-file CodeMirror LaTeX editor with Yjs/WebSocket collaboration and presence
- Cached, pre-warmed Tectonic compilation in a restricted Docker worker
- Live compile status, logs, PDF updates, and direct agent edits
- PDF.js preview that preserves exact scroll coordinates, page, and zoom after recompilation
- One-click PDF-only focus mode; `Escape` returns to the editor
- Templates, uploads, ZIP import/export, revisions, restore, owner/editor/viewer sharing
- Invite-only username/password accounts; no email or 2FA
- Project-scoped, revocable agent passwords with revision-safe REST access and OpenAPI
- SQLite persistence and daily three-snapshot SSD backups
- Responsive light/dark/system interface

## Architecture

```text
GitHub Pages frontend
        │ reads api.json
        ▼
Cloudflare Quick Tunnel ──► local Fastify server
                              ├─ SQLite + revisions
                              ├─ Yjs WebSockets
                              └─ warm Docker/Tectonic worker
```

All project source is stored in `data/underleaf.sqlite3`. Generated PDFs are cached by a hash of every project file. `data/` and `.env` are intentionally ignored by Git.

## Requirements

- Node.js 24+
- pnpm 10.27+
- Docker Desktop
- `cloudflared`
- Git and GitHub CLI for publishing

The required tools are already installed on the intended macOS host.

## First run

```bash
pnpm install
pnpm admin:create
pnpm start:tunnel
```

`admin:create` asks for the first username and password. The administrator creates single-use invitation links from the dashboard. `start:tunnel` builds the app, starts the backend and Quick Tunnel, writes the live endpoint to `docs/api.json`, and pushes the Pages update. Stopping it marks the discovery document offline.

For local development without Pages:

```bash
pnpm dev
```

Open `http://localhost:5173`. The development frontend uses `http://127.0.0.1:4317` directly.

## Agent access

A project owner opens **Agents**, creates a credential, and gives the agent:

1. the stable discovery link,
2. the project hash,
3. the one-time project password.

The stable guide is at `https://debeltoni.github.io/UnderLeaf/agent-guide.md`; the machine-readable API is served at `/api/v1/openapi.json`. Agent mutations require the latest file revision in `If-Match`, so a collaborator cannot be overwritten silently.

## Compilation

The first real compile builds `underleaf-tectonic:0.16.9` if needed and starts `underleaf-tectonic-worker`. The container runs as an unprivileged user with dropped capabilities, a read-only root filesystem, PID/CPU/memory limits, Tectonic `--untrusted`, and a timeout. Its package cache persists in the `underleaf-tectonic-cache` Docker volume. Identical project states reuse the prior PDF immediately.

## Backups

```bash
pnpm backup
```

The default destination is `/Volumes/SSD/backups/UnderLeaf/`. Each snapshot contains an online SQLite backup, its integrity result, and the PDF cache; `.env` and plaintext credentials are excluded. Only the latest three daily snapshots remain.

The installed cron wrapper is `~/Documents/cron/underleaf-backup.sh` and runs at 03:00. Restore by stopping UnderLeaf and replacing `data/underleaf.sqlite3` with a snapshot database.

## Quality checks

```bash
pnpm check
```

This runs linting, strict TypeScript checks, API/frontend tests, and production builds. CI repeats the same checks and CodeQL scans JavaScript/TypeScript changes.

## Security model

This deployment is intended for a small trusted group. Passwords use scrypt; session, invite, and agent secrets are hashed at rest. Persistent bearer secrets never appear in WebSocket URLs. Project paths and ZIP imports are constrained, CORS is allowlisted, and compilation is isolated from the host. A Quick Tunnel is not an availability guarantee; when the host sleeps, the Pages app reports the server offline.

## License

GNU Affero General Public License v3.0 only. See [LICENSE](LICENSE).
