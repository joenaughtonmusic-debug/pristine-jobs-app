#!/usr/bin/env bash
set -euo pipefail
PSQL="/opt/homebrew/opt/libpq/bin/psql"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${STAGING_DB_URL:-}" && -f "$DIR/../.env.staging" ]]; then
  STAGING_DB_URL="$(grep -E '^STAGING_DB_URL=' "$DIR/../.env.staging" | head -1 | cut -d= -f2- | tr -d '"'"'"'')"
fi
if [[ -z "${STAGING_DB_URL:-}" ]]; then
  echo "ERROR: set STAGING_DB_URL, or add a STAGING_DB_URL=... line to .env.staging" >&2
  exit 1
fi
run() { "$PSQL" "$STAGING_DB_URL" -v ON_ERROR_STOP=1 "$@"; }
run -f "$DIR/085_quote_document_label.sql"
run -c "select column_name, data_type from information_schema.columns where table_schema='public' and table_name='quote_drafts' and column_name='document_label';"
run -c "notify pgrst, 'reload schema';"
echo "OK: 085 applied to staging."
