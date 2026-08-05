#!/bin/zsh

set -u

repo_root=${OBSERVATORY_REPO_ROOT:-}
registry_path=${OBSERVATORY_REGISTRY_PATH:-}
workspace_root=${OBSERVATORY_WORKSPACE_ROOT:-}
vault_root=${OBSERVATORY_VAULT_ROOT:-}
config_path=${OPENCLAW_CONFIG_PATH:-}

if [[ -z $repo_root || -z $registry_path || -z $workspace_root || -z $vault_root || -z $config_path ]]; then
  print -r -- "OBSERVATORY_REFRESH_UNEXPECTED_FAILURE"
  exit 0
fi

cd "$repo_root" || {
  print -r -- "OBSERVATORY_REFRESH_UNEXPECTED_FAILURE"
  exit 0
}

set -a
source .env.local >/dev/null 2>&1
source_status=$?
set +a

if [[ $source_status -ne 0 || -z ${NEXT_PUBLIC_SUPABASE_URL:-} || -z ${SUPABASE_SECRET_KEY:-} ]]; then
  print -r -- "OBSERVATORY_REFRESH_UNEXPECTED_FAILURE"
  exit 0
fi

export SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL"
export SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SECRET_KEY"

snapshot_path="$repo_root/.observatory/observatory-snapshot.json"
diagnostic_directory="$repo_root/.observatory/refresh-errors"
snapshot_mtime_before=$(stat -f '%m' "$snapshot_path" 2>/dev/null || print -r -- "missing")
refresh_output=$(npm run observatory:refresh -- \
  "$registry_path" \
  "$workspace_root" \
  "$vault_root" \
  "$config_path" 2>&1)
refresh_status=$?
snapshot_mtime_after=$(stat -f '%m' "$snapshot_path" 2>/dev/null || print -r -- "missing")

# Keep the most recent wrapper-level failure for compatibility. Detailed,
# redacted, per-run diagnostics live in refresh-errors and are retained by the
# TypeScript refresh orchestrator.
diagnostic_path="$repo_root/.observatory/last-refresh-error.log"
umask 077
if [[ $refresh_status -ne 0 ]]; then
  mkdir -p "$diagnostic_directory"
  chmod 700 "$diagnostic_directory"
  print -r -- "$refresh_output" > "$diagnostic_path"
fi

safe_codes=$(print -r -- "$refresh_output" | grep -Eo \
  'OBSERVATORY_REFRESH_(OK|SKIPPED_LOCKED|FAILURE|STALE|RECOVERY)' | sort -u)

if [[ -n $safe_codes ]]; then
  print -r -- "$safe_codes"
fi

if [[ $refresh_status -eq 0 && -n $safe_codes ]]; then
  retention_output=$(npm run observatory:retention -- 30 2>&1)
  retention_status=$?
  if [[ $retention_status -eq 0 && $retention_output == *OBSERVATORY_RETENTION_OK* ]]; then
    print -r -- "OBSERVATORY_RETENTION_OK"
  else
    print -r -- "OBSERVATORY_REFRESH_UNEXPECTED_FAILURE"
  fi
elif [[ $refresh_status -eq 0 ]]; then
  print -r -- "OBSERVATORY_REFRESH_UNEXPECTED_FAILURE"
else
  print -r -- "OBSERVATORY_REFRESH_FAILURE"
  if [[ $snapshot_mtime_after == $snapshot_mtime_before ]]; then
    print -r -- "OBSERVATORY_REFRESH_COLLECT_FAILURE"
  else
    print -r -- "OBSERVATORY_REFRESH_PUBLISH_FAILURE"
  fi
fi

exit 0
