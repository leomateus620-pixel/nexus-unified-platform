#!/usr/bin/env bash
# Integração com banco/RLS: Postgres vazio + migrations reais + cenários S/T/C.
# Uso: bash tests/db/run.sh   (requer initdb/pg_ctl/psql no PATH)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$(mktemp -d)"; PORT="${PGTEST_PORT:-55432}"
RUNAS=""; [ "$(id -u)" = "0" ] && { id pgtest >/dev/null 2>&1 || useradd -M pgtest; chown -R pgtest "$DIR"; RUNAS="su pgtest -c"; }
run() { if [ -n "$RUNAS" ]; then $RUNAS "$*"; else bash -c "$*"; fi; }
run "initdb -D $DIR/data -U postgres -A trust >/dev/null"
run "pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log start -w >/dev/null"
trap 'run "pg_ctl -D $DIR/data stop -m fast >/dev/null" || true; rm -rf "$DIR"' EXIT
P="psql -X -q -v ON_ERROR_STOP=1 -h $DIR -p $PORT -U postgres -d postgres"
$P -f "$ROOT/tests/db/bootstrap.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do $P -f "$f" >/dev/null; done
OUT="$($P -A -F ' | ' -f "$ROOT/tests/db/cenarios.sql")"
echo "$OUT"
if echo "$OUT" | grep -q "FALHOU"; then echo "RESULTADO: FALHAS"; exit 1; fi
echo "RESULTADO: TODOS PASSARAM"
