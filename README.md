<p align="center">
  <img src="docs/screenshots/providers-light.png" alt="CLIProxyAPI Dashboard" width="800">
</p>

<h1 align="center">CLIProxyAPI Dashboard</h1>

<p align="center">
  <strong>Use Claude Code, Gemini CLI, and Codex as OpenAI-compatible APIs — managed through a modern web dashboard.</strong>
</p>

<p align="center">
  <a href="https://github.com/gkrtjd99/cliproxyapi-dashboard/releases"><img src="https://img.shields.io/github/v/release/gkrtjd99/cliproxyapi-dashboard" alt="Release"></a>
  <a href="https://github.com/gkrtjd99/cliproxyapi-dashboard/actions/workflows/release.yml"><img src="https://github.com/gkrtjd99/cliproxyapi-dashboard/actions/workflows/release.yml/badge.svg" alt="Build"></a>
  <a href="https://github.com/gkrtjd99/cliproxyapi-dashboard/pkgs/container/cliproxyapi-dashboard%2Fdashboard"><img src="https://img.shields.io/badge/Docker-GHCR-blue?logo=docker" alt="Docker"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License: MIT"></a>
  <a href="https://discord.gg/7SrXxNueGA"><img src="https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white" alt="Discord"></a>
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16">
  <img src="https://img.shields.io/badge/React-19-blue?logo=react" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" alt="TypeScript">
</p>

---

<p align="center">
  <a href="https://discord.gg/7SrXxNueGA">
    <img src="https://img.shields.io/badge/Discord%20Community-%235865F2.svg?style=for-the-badge&logo=discord&logoColor=white" alt="Discord">
  </a>
</p>
<p align="center">
  We have a Discord server — installation help, release announcements, and community chat.<br>
  <strong><a href="https://discord.gg/7SrXxNueGA">discord.gg/7SrXxNueGA</a></strong>
</p>

---

> **Using the sanitized Desktop bundle?** Start with [README-LOCAL.md](README-LOCAL.md). It contains the Docker Desktop setup steps and explains which runtime files must stay private.

## What is this?

[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) wraps OAuth-based CLI tools (Claude Code, Gemini CLI, Codex, GitHub Copilot, Kiro, Antigravity, Kimi, Qwen) into **OpenAI-compatible APIs**. This dashboard gives you a web UI to manage everything — providers, API keys, configs, logs, and updates — without touching YAML files.

## Quick Start

> **Local use (macOS/Windows/Linux)**: Only Docker Desktop required.

```bash
git clone https://github.com/gkrtjd99/cliproxyapi-dashboard.git
cd cliproxyapi-dashboard
./setup-local.sh          # macOS/Linux
# .\setup-local.ps1       # Windows
```

The local setup scripts start Docker Compose with a local dashboard build (`--build`) so your current source changes are used.

Open **http://localhost:3000** → create admin account → done.

### Local maintenance

The local stack keeps CLIProxyAPI pinned to the version in `.env` and builds
both CLIProxyAPI and Dashboard from the checked-out source. Use the wrapper for
safe maintenance:

```bash
./cliproxyapi-stack.sh backup
./cliproxyapi-stack.sh update
./cliproxyapi-stack.sh update --api-version 7.2.138
```

`update` backs up the CLIProxyAPI state and PostgreSQL database, fast-forwards
the Dashboard source when it does not overlap local changes, pulls upstream
support images, rebuilds the local images, and runs health checks. It never
deletes Docker volumes or OAuth data. Review the upstream release before
changing `--api-version`.

In local mode, the Dashboard's built-in CLIProxyAPI image updater is disabled
because it targets the upstream `eceasy/cli-proxy-api` image directly. Use the
wrapper above so the pinned local build and Compose ownership are preserved.

For a normal start/stop cycle use `./cliproxyapi-stack.sh up` and
`./cliproxyapi-stack.sh down`; do not use `down -v` unless you intentionally
want to remove the Dashboard database.

### Local configuration and API access

The local setup script creates the runtime configuration automatically. Run
`./setup-local.sh` (or `./setup-local.sh --prepare-only` to create files without
starting the stack) to generate:

- `.env` — fresh JWT, management, PostgreSQL, collector, and backup-scheduler secrets
- `config.local.yaml` — the local proxy port, management secret, initial API key,
  retry policy, quota switching, and routing defaults

These files contain installation-specific secrets and are ignored by Git. Do
not copy them into an issue, commit, or shared bundle.

After connecting an OAuth account in the Dashboard, create an API key from the
Dashboard's API key management page for client requests. The local
OpenAI-compatible endpoint is `http://localhost:11451/v1`; port `8317` is the
CLIProxyAPI management endpoint used by the Dashboard.

### Local stack additions

The local stack extends the upstream Compose setup with:

- A source-built CLIProxyAPI image pinned by `CLIPROXYAPI_VERSION` (default `7.2.138`)
- Bind-mounted OAuth/config state under `data/cliproxyapi` and logs under `data/cliproxyapi-logs`
- A five-minute usage collector and scheduled PostgreSQL/dashboard backup service
- A local-stack update guard so the Dashboard cannot replace the Compose-managed API image
- An optional Perplexity sidecar, enabled with `COMPOSE_PROFILES=perplexity`

See [README-LOCAL.md](README-LOCAL.md) for the complete local configuration,
state migration, and troubleshooting notes.

> **Server deployment**: See the full [Installation Guide](docs/INSTALLATION.md).

## Features

- **Visual Configuration** — Manage CLIProxyAPI settings through structured forms, no YAML editing
- **Multi-Provider OAuth** — Connect Claude, Gemini, Codex, Copilot, Kiro, Antigravity, iFlow, Kimi, and Qwen accounts
- **Custom Providers** — Add any OpenAI-compatible endpoint (OpenRouter, Ollama, etc.) with model mappings; admins can mark a provider as **Shared** so all team members see and use it
- **API Key Management** — Create, revoke, and track API keys with per-user ownership
- **Real-time Monitoring** — Live log streaming, container health, and service management
- **Quota Tracking** — Rate limits and usage per provider (Claude, Codex, Kimi, Antigravity)
- **Telegram Quota Alerts** — Automatic notifications when OAuth quota drops below threshold (configurable per-provider, 1-hour cooldown)
- **Usage Analytics** — Request counts, provider breakdown, model stats, error rates
- **Oh-My-Open-Agent Variant Toggle** — Choose between [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) (9 agents + categories) and [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim) (6 agents, lower tokens, fallback chains) with per-agent model/skills configuration
- **Config Sync** — Auto-sync OpenCode configs via the [`opencode-cliproxyapi-sync`](https://github.com/itsmylife44/opencode-cliproxyapi-sync) plugin (includes slim config)
- **Config Sharing** — Share model configs with others via share codes (`XXXX-XXXX`)
- **One-Click Updates** — Update both Dashboard (GHCR) and CLIProxyAPI (Docker Hub) from the admin panel
- **Container Management** — Start, stop, restart containers directly from the UI
- **Automatic TLS** — Let's Encrypt certificates via Caddy, auto-renewed

## Local Providers (Ollama / LM Studio / llama.cpp)

Custom providers pointing at `localhost` or private networks are blocked by default to prevent SSRF from hosted installations. To enable them on self-hosted deployments:

1. Set `ALLOW_LOCAL_PROVIDER_URLS=true` in `infrastructure/.env`.
2. Restart the dashboard container (`docker compose up -d dashboard`).
3. Create a custom provider with the local base URL (e.g. `http://host.docker.internal:11434/v1` for Ollama from within Docker, or `http://localhost:11434/v1` when running the dashboard outside a container). The API key field is optional — leave it empty if the provider doesn't require one.

Cloud instance-metadata addresses (`169.254.169.254`, `100.100.100.200`) stay blocked regardless of this setting.

## Telegram Quota Alerts

Get notified on Telegram when your OAuth provider quota is running low.

**Setup** (Admin → Settings → Telegram Alerts):

1. Create a Telegram bot via [@BotFather](https://t.me/BotFather) and copy the bot token
2. Get your chat ID (send a message to the bot, then check `https://api.telegram.org/bot<TOKEN>/getUpdates`)
3. In the dashboard, go to **Admin → Settings → Telegram** and enter:
   - Bot token
   - Chat ID
   - Quota threshold (e.g. 20% remaining)
   - Which providers to monitor (Claude, Codex, Kimi, Antigravity)
4. Enable alerts — the scheduler checks every 5 minutes with a 1-hour cooldown between notifications

Use the **Test Message** button to verify your configuration before enabling.

## Oh-My-Open-Agent Integration

The dashboard supports two OpenCode orchestration variants. Toggle between them in the **Using with OpenCode** section:

| Variant | Agents | Description |
|---------|--------|-------------|
| **Oh-My-Open-Agent** | 9 agents + 8 categories | Full-featured orchestration with sisyphus, atlas, prometheus, oracle, and more |
| **Oh-My-OpenCode Slim** | 6 agents | Lightweight: orchestrator, oracle, designer, explorer, librarian, fixer. Lower token usage with dedicated fallback chains |

**How it works:**

1. Select your variant in the dashboard -- the plugin in `opencode.json` switches automatically
2. Assign models to agents (auto-assigned by tier, or manually override)
3. Toggle skills per agent (simplify, cartography, agent-browser)
4. Config syncs automatically via the sync plugin

**First-time setup** (run once per variant):

```bash
bunx oh-my-openagent@latest install          # Normal variant
bunx oh-my-opencode-slim@latest install     # Slim variant
```

Each variant has its own config file (`oh-my-openagent.json` / `oh-my-opencode-slim.json`) -- they don't conflict.

## Screenshots

<p align="center">
  <img src="docs/screenshots/setup-wizard.png" alt="Setup Wizard" width="700">
  <br><em>Setup Wizard — guided initial configuration</em>
</p>

<p align="center">
  <img src="docs/screenshots/providers-light.png" alt="Provider Configuration" width="700">
  <br><em>Provider Configuration — manage API keys and OAuth accounts</em>
</p>

<p align="center">
  <img src="docs/screenshots/quota.png" alt="Quota Management" width="700">
  <br><em>Quota Management — track rate limits with Telegram alerts</em>
</p>

<p align="center">
  <img src="docs/screenshots/settings.png" alt="Settings" width="700">
  <br><em>Settings — config sync, system info, and updates</em>
</p>

## Architecture

Six Docker containers, two isolated networks:

<p align="center">
  <img src="docs/code-snippets/architecture.png" alt="Architecture" width="700">
</p>

| Service | Role |
|---------|------|
| **Caddy** | Reverse proxy, automatic TLS, HTTP/3 |
| **Dashboard** | Next.js web app, JWT auth, Docker management via socket proxy |
| **CLIProxyAPI** | AI proxy server, OAuth callbacks, management API |
| **Perplexity Sidecar** | OpenAI-compatible wrapper for Perplexity Pro subscription |
| **Docker Socket Proxy** | Restricted Docker API access (containers/images only) |
| **PostgreSQL** | Database on isolated internal network |

## Project Structure

<p align="center">
  <img src="docs/code-snippets/project-structure.png" alt="Project Structure" width="600">
</p>

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19 |
| Styling | Tailwind CSS v4 |
| Database | PostgreSQL 16 + Prisma 7 |
| Auth | JWT (jose) + bcrypt |
| Container Mgmt | Docker CLI via socket proxy |

## Development

```bash
cd dashboard
./dev-local.sh              # Start dev environment
./dev-local.sh --reset      # Reset database
./dev-local.sh --down       # Stop containers
```

Or manually:

```bash
cd dashboard
npm install
cp .env.example .env.local  # Edit with your DB credentials
npx prisma migrate dev
npm run dev
```

Dashboard at `http://localhost:3000`.

### UI-Only Mode (no database)

To browse the dashboard UI without PostgreSQL or login:

```bash
cd dashboard
SKIP_AUTH=1 npm run dev
```

Opens all routes as a fake admin user — useful for testing themes, layouts, and components.

## Documentation

| Guide | Description |
|-------|-------------|
| **[Installation](docs/INSTALLATION.md)** | Server deployment, local setup, manual installation |
| **[Configuration](docs/CONFIGURATION.md)** | Environment variables, config.yaml, config sync |
| **[Usage Collection](infrastructure/docs/USAGE_COLLECTION.md)** | Usage tracking service, troubleshooting, manual collection |
| **[Troubleshooting](docs/TROUBLESHOOTING.md)** | Common issues and solutions |
| **[Security](docs/SECURITY.md)** | Best practices for production |
| **[Backup & Restore](docs/BACKUP.md)** | Automated and manual backups |
| **[Service Management](docs/SERVICE-MANAGEMENT.md)** | Systemd and Docker Compose commands |

## Contributing

1. Fork → feature branch → PR
2. Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`)
3. Test locally before submitting

Release-Please auto-generates releases from commit messages.

## Contributors

Thanks to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/itsmylife44"><img src="https://avatars.githubusercontent.com/u/34112129?v=4?s=80" width="80px;" alt="itsmylife44"/><br /><sub><b>itsmylife44</b></sub></a><br /><a href="#code-itsmylife44" title="Code">💻</a> <a href="#doc-itsmylife44" title="Documentation">📖</a> <a href="#maintenance-itsmylife44" title="Maintenance">🚧</a> <a href="#infra-itsmylife44" title="Infrastructure">🚇</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/38lunin021189-creator"><img src="https://avatars.githubusercontent.com/u/209580972?v=4?s=80" width="80px;" alt="Rizki Hidayat"/><br /><sub><b>Rizki Hidayat</b></sub></a><br /><a href="#code-38lunin021189-creator" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/dqphong0302"><img src="https://avatars.githubusercontent.com/u/86866408?v=4?s=80" width="80px;" alt="Đặng Quốc Phong"/><br /><sub><b>Đặng Quốc Phong</b></sub></a><br /><a href="#code-dqphong0302" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/smart-tinker"><img src="https://avatars.githubusercontent.com/u/219125940?v=4?s=80" width="80px;" alt="smart-tinker"/><br /><sub><b>smart-tinker</b></sub></a><br /><a href="#code-smart-tinker" title="Code">💻</a> <a href="#bug-smart-tinker" title="Bug reports">🐛</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/islee23520"><img src="https://avatars.githubusercontent.com/u/218665556?v=4?s=80" width="80px;" alt="islee"/><br /><sub><b>islee</b></sub></a><br /><a href="#code-islee23520" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/deftdawg"><img src="https://avatars.githubusercontent.com/u/1253316?v=4?s=80" width="80px;" alt="deftdawg"/><br /><sub><b>deftdawg</b></sub></a><br /><a href="#code-deftdawg" title="Code">💻</a> <a href="#bug-deftdawg" title="Bug reports">🐛</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/clcc2019"><img src="https://avatars.githubusercontent.com/u/46099295?v=4?s=80" width="80px;" alt="dslife2025"/><br /><sub><b>dslife2025</b></sub></a><br /><a href="#code-clcc2019" title="Code">💻</a></td>
    </tr>
  </tbody>
</table>
<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->
<!-- ALL-CONTRIBUTORS-LIST:END -->

## Adding a Language

The dashboard supports multi-language UI. Currently, we offer **English (en)** and **German (de)**. We welcome community contributions for additional languages!

### How to contribute a new language

1. **Copy the English template**:
   ```bash
   cp dashboard/messages/en.json dashboard/messages/{locale}.json
   ```
   Replace `{locale}` with the language code (e.g., `fr` for French, `es` for Spanish, `ja` for Japanese).

2. **Translate all strings**:
   - Open the new file in your editor
   - Translate every value (keep all keys unchanged)
   - Example:
     ```json
     {
       "common": {
         "loading": "Wird geladen...",  // Keep this structure
         "cancel": "Abbrechen"
       }
     }
     ```

3. **Register the new locale**:
   - Edit `dashboard/src/i18n/config.ts`
   - Add your locale to the `supportedLocales` array:
     ```ts
     export const supportedLocales = ["en", "de", "fr"] as const;
     ```
   - Add the display name to `localeNames`:
     ```ts
     export const localeNames: Record<Locale, string> = {
       en: "English",
       de: "Deutsch",
       fr: "Français",  // Add this
     };
     ```

4. **Test locally**:
   - Run `npm run dev` in `dashboard/`
   - Log in to the dashboard
   - Open the User Panel (top right)
   - Select your language from the Language dropdown
   - Verify all UI strings display correctly in your language

5. **Submit a PR**:
   - Title: `feat(i18n): add {language} translation`
   - Include the three files: `messages/{locale}.json`, and changes to `src/i18n/config.ts`
   - PR description: Link to any external translation resources or notes

### Translation Quality Guidelines

- Keep translations concise and match the tone of the English version
- Use formal/business-appropriate language
- Test that UI elements don't overflow or break with your translations
- Plurals and gender (where applicable) should follow target language conventions
- Date/time formatting handled by `next-intl` — no need to change
- Currency codes are kept in English (e.g., `USD`, `EUR`)

### Supported locales

| Code | Language | Status |
|------|----------|--------|
| `en` | English | ✓ Complete |
| `de` | German | ✓ Complete |

Add more by following the steps above!

## Support

- **[Discord](https://discord.gg/7SrXxNueGA)** — Community chat, installation help, announcements
- **[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)** — Core proxy documentation
- **[Issues](https://github.com/gkrtjd99/cliproxyapi-dashboard/issues)** — Bug reports and feature requests
- **[Discussions](https://github.com/gkrtjd99/cliproxyapi-dashboard/discussions)** — Questions and community

## Star History

<a href="https://star-history.com/#gkrtjd99/cliproxyapi-dashboard&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=gkrtjd99/cliproxyapi-dashboard&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=gkrtjd99/cliproxyapi-dashboard&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=gkrtjd99/cliproxyapi-dashboard&type=Date" />
  </picture>
</a>

## License

[MIT](LICENSE)

---

<p align="center">
  Built with ❤️ using Next.js, React, and Tailwind CSS
</p>
