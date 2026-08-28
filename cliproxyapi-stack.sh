#!/usr/bin/env bash

# One-command lifecycle wrapper for the local CLIProxyAPI + dashboard stack.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.local.yml"
BACKUP_ROOT="${SCRIPT_DIR}/backups"

if [[ ! -f "${SCRIPT_DIR}/.env" || ! -f "${SCRIPT_DIR}/config.local.yaml" ]]; then
  echo "Local environment is not prepared. Run: ./setup-local.sh --prepare-only" >&2
  exit 1
fi

compose() {
  docker compose -f "${COMPOSE_FILE}" "$@"
}

require_docker() {
  command -v docker >/dev/null 2>&1 || {
    echo "Docker is not installed or not on PATH." >&2
    exit 1
  }
  docker info >/dev/null 2>&1 || {
    echo "Docker Desktop is not running." >&2
    exit 1
  }
}

ensure_api_container() {
  local project service
  if ! docker inspect cliproxyapi >/dev/null 2>&1; then
    return 0
  fi

  project="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' cliproxyapi 2>/dev/null || true)"
  service="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' cliproxyapi 2>/dev/null || true)"
  if [[ "${project}" != "cliproxyapi-dashboard" || "${service}" != "cliproxyapi" ]]; then
    echo "Replacing unmanaged cliproxyapi container; bind-mounted data will be preserved."
    docker rm -f cliproxyapi >/dev/null
  fi
}

create_backup() {
  local timestamp backup_dir
  timestamp="$(date +%Y%m%d-%H%M%S)"
  backup_dir="${BACKUP_ROOT}/upgrade-${timestamp}"

  mkdir -p "${backup_dir}"
  chmod 700 "${backup_dir}"

  tar -czf "${backup_dir}/cliproxyapi-state.tgz" \
    -C "${SCRIPT_DIR}" \
    config.local.yaml data/cliproxyapi data/cliproxyapi-logs

  compose up -d postgres >/dev/null
  local deadline health
  deadline=$((SECONDS + 60))
  while (( SECONDS < deadline )); do
    health="$(docker inspect --format '{{.State.Health.Status}}' cliproxyapi-postgres 2>/dev/null || true)"
    [[ "${health}" == "healthy" ]] && break
    sleep 2
  done

  if [[ "${health:-}" != "healthy" ]]; then
    echo "PostgreSQL did not become healthy; database backup was not created." >&2
    exit 1
  fi

  compose exec -T postgres sh -c \
    'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U cliproxyapi -d cliproxyapi' \
    > "${backup_dir}/dashboard-postgres.sql"

  chmod 600 "${backup_dir}/dashboard-postgres.sql" "${backup_dir}/cliproxyapi-state.tgz"
  echo "Backup created: ${backup_dir}"
}

update_api_version() {
  local version="$1" tmp_file
  if [[ ! "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
    echo "Invalid CLIProxyAPI version: ${version}" >&2
    echo "Example: ./cliproxyapi-stack.sh update --api-version 7.2.138" >&2
    exit 2
  fi

  tmp_file="$(mktemp "${SCRIPT_DIR}/.env.update.XXXXXX")"
  awk -v version="${version}" '
    BEGIN { updated = 0 }
    /^CLIPROXYAPI_VERSION=/ {
      print "CLIPROXYAPI_VERSION=" version
      updated = 1
      next
    }
    { print }
    END {
      if (!updated) print "CLIPROXYAPI_VERSION=" version
    }
  ' "${SCRIPT_DIR}/.env" > "${tmp_file}"
  mv "${tmp_file}" "${SCRIPT_DIR}/.env"
  chmod 600 "${SCRIPT_DIR}/.env"
  echo "CLIProxyAPI version set to ${version}"
}

update_dashboard_source() {
  local dirty_files incoming_files path conflict=0

  git -C "${SCRIPT_DIR}" fetch origin main --prune
  dirty_files="$(git -C "${SCRIPT_DIR}" status --porcelain=v1 --untracked-files=all | sed -E 's/^.. //')"
  incoming_files="$(git -C "${SCRIPT_DIR}" diff --name-only HEAD origin/main)"

  while IFS= read -r path; do
    [[ -z "${path}" ]] && continue
    if printf '%s\n' "${incoming_files}" | grep -Fxq "${path}"; then
      echo "Dashboard update overlaps with local file: ${path}" >&2
      conflict=1
    fi
  done <<< "${dirty_files}"

  if (( conflict )); then
    echo "Dashboard source was not updated. Commit/stash the local change, then retry." >&2
    exit 1
  fi

  git -C "${SCRIPT_DIR}" merge --ff-only origin/main
}

check_health() {
  local failed=0
  compose ps

  if ! curl --fail --silent --show-error --max-time 15 http://127.0.0.1:8317/ >/dev/null; then
    echo "CLIProxyAPI health check failed." >&2
    failed=1
  fi
  if ! curl --fail --silent --show-error --max-time 15 http://127.0.0.1:3000/api/health >/dev/null; then
    echo "Dashboard health check failed." >&2
    failed=1
  fi

  (( failed == 0 )) || exit 1
  echo "Health checks passed."
}

run_update() {
  local api_version=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --api-version)
        [[ -n "${2:-}" ]] || { echo "--api-version requires a value." >&2; exit 2; }
        api_version="$2"
        shift 2
        ;;
      *)
        echo "Unknown update option: $1" >&2
        exit 2
        ;;
    esac
  done

  require_docker
  create_backup
  update_dashboard_source
  [[ -z "${api_version}" ]] || update_api_version "${api_version}"
  ensure_api_container

  # These services use upstream images. CLIProxyAPI and Dashboard are built
  # locally so the pinned API version and checked-out Dashboard source remain
  # explicit and reproducible.
  compose pull postgres docker-proxy usage-collector backup-scheduler
  compose up -d --build --remove-orphans
  check_health
}

case "${1:-}" in
  up|start)
    require_docker
    ensure_api_container
    compose up -d --build
    ;;
  down|stop)
    docker compose -f "${COMPOSE_FILE}" down
    ;;
  restart)
    compose restart
    ;;
  status)
    compose ps
    ;;
  backup)
    require_docker
    create_backup
    ;;
  update)
    shift
    run_update "$@"
    ;;
  logs)
    if [[ -n "${2:-}" ]]; then
      compose logs -f "${2}"
    else
      compose logs -f
    fi
    ;;
  *)
    echo "Usage: $0 {up|down|restart|status|backup|update [--api-version VERSION]|logs [service]}" >&2
    exit 2
    ;;
esac
