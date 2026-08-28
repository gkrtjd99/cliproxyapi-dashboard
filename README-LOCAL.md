# Desktop local bundle

This folder is a sanitized copy of the CLIProxyAPI + Dashboard Docker stack.
It contains source code, Dockerfiles, Compose configuration, and setup scripts,
but **does not contain the previous installation's `.env`, proxy configuration,
OAuth files, provider API keys, logs, backups, database, or `.git` history**.

## Requirements

- Docker Desktop with Docker Compose
- Internet access for the first build (the API image clones the pinned
  CLIProxyAPI release and the Dashboard image installs npm dependencies)

## What is included

This bundle contains the current Dashboard source, the local Compose stack, and
an API image build pinned to CLIProxyAPI `7.2.138`. The Live Logs page uses
bounded, timestamp-based polling so a large historical log cannot cause a 502 or
consume excessive Dashboard memory.

The setup scripts generate fresh local secrets for each installation, including
JWT, management API, PostgreSQL, usage collector, and backup scheduler keys.
No provider tokens, OAuth accounts, database contents, runtime state, or logs
from the source installation are included.

## First start (macOS / Linux)

```bash
cd ~/Desktop/cliproxyapi-dashboard
./setup-local.sh
```

Answer `n` to the optional Perplexity prompt unless you are intentionally
configuring that integration. The script creates fresh local-only secrets in
`.env` and a fresh `config.local.yaml`; those files are ignored by Git and must
not be copied when sharing this bundle.

Open:

- Dashboard: <http://localhost:3000>
- CLIProxyAPI endpoint: <http://localhost:11451>
- Management/API port: <http://localhost:8317>

## Configuration and API access

For the standard local stack, no manual secret configuration is required.
`./setup-local.sh` creates the following files before starting Compose:

- `.env` — fresh JWT, management, PostgreSQL, usage-collector, and
  backup-scheduler secrets, plus the pinned CLIProxyAPI version
- `config.local.yaml` — proxy and management settings, an initial API key,
  retry policy, quota switching, and round-robin routing defaults

Use `./setup-local.sh --prepare-only` if you want to generate the files without
starting the containers. Both files are installation-specific and ignored by
Git; never commit or share them.

After connecting an OAuth provider in the Dashboard, create an API key from the
Dashboard's API key management page for client requests. Use the
OpenAI-compatible endpoint as:

```text
http://localhost:11451/v1
```

Port `8317` is the CLIProxyAPI management endpoint used internally by the
Dashboard. It is not the normal base URL for OpenAI-compatible clients.

## What this local stack adds

Compared with the upstream Compose setup, this local stack includes:

- A source-built CLIProxyAPI image pinned to `7.2.138`
- Bind-mounted OAuth/config state in `data/cliproxyapi` and logs in
  `data/cliproxyapi-logs`
- Five-minute usage collection and scheduled PostgreSQL/dashboard backups
- Database-side usage aggregation with bounded request-event and latency-series
  responses
- `cliproxyapi-stack.sh` commands for lifecycle management, backups, updates,
  logs, and health checks
- A local-stack update guard that prevents the Dashboard from replacing the
  Compose-managed CLIProxyAPI image

## Windows PowerShell

```powershell
cd "$HOME\Desktop\cliproxyapi-dashboard"
.\setup-local.ps1
```

## Stop, reset, and inspect

```bash
./setup-local.sh --down       # stop containers, keep data volumes
./setup-local.sh --reset      # remove containers, volumes, and generated secrets
./cliproxyapi-stack.sh status
./cliproxyapi-stack.sh logs
```

`--reset` deletes the local PostgreSQL/Dashboard data volumes. Use it only when
you want a completely fresh installation.

A directory copied from this sanitized bundle does not contain `.git` history,
so the wrapper's Git-based `update` command cannot run there. A normal checkout
of the published fork does retain Git history and can use
`./cliproxyapi-stack.sh update`; that command updates the checked-out fork
source and rebuilds the local images.

## Existing named-volume migration

This Compose file uses bind mounts for CLIProxyAPI state, while the upstream
local stack used Docker named volumes. If an existing installation has OAuth
accounts or provider state in `cliproxyapi_auths` or `cliproxyapi_logs`, do not
start this stack and assume the data will be discovered automatically. Stop the
old stack, create a backup, inspect the actual volume names, and copy the data
into `data/cliproxyapi` and `data/cliproxyapi-logs` before the first start.

Do not use `docker compose down -v` during migration: it removes volumes and
can destroy the state you are trying to preserve. A fresh installation with no
previous named volumes needs no migration.

## Add provider credentials

Add OAuth accounts and provider API keys through the Dashboard after the first
login. They are runtime state, not part of this bundle. Do not commit or share
these generated/runtime files:

- `.env`
- `config.local.yaml`
- `data/`
- `backups/`
- `*.log`

The example files (`.env.local.example` and `config.local.yaml.example`) contain
placeholders only.

## Existing local stack warning

The Compose file intentionally preserves the existing local ports and container
names so the Dashboard can manage the same services. It cannot run at the same
time as another copy of this stack on the same Docker Desktop. Stop the old
stack first, or use one installation at a time.

## Optional settings

- Set `ALLOW_LOCAL_PROVIDER_URLS=true` in `.env` only when you intentionally
  need Ollama/LM Studio/other private-network providers.
- To enable the Perplexity sidecar, add `COMPOSE_PROFILES=perplexity` and
  configure its secret/cookies in `.env`; never place those values in the
  shareable example files.
- The API release is pinned to `7.2.138` to match the copied local setup. Change
  `CLIPROXYAPI_VERSION` in `.env` only after reviewing compatibility.
- Keep the generated `.env`, `config.local.yaml`, `data/`, `backups/`, and log
  files local. Remove them before sending this directory to someone else.
