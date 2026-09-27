#!/usr/bin/env bash
# Integração com banco/RLS: Postgres vazio + migrations reais + cenários S/T/C.
# Uso: bash tests/db/run.sh   (requer initdb/pg_ctl/psql no PATH)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$(mktemp -d)"; PORT="${PGTEST_PORT:-55432}"
# Postgres recusa rodar como root: em root, usa um UID sem privilégios (65534).
if [ "$(id -u)" = "0" ]; then chown -R 65534:65534 "$DIR"; chmod 755 "$DIR"
  run() { setpriv --reuid=65534 --regid=65534 --clear-groups env HOME="$DIR" bash -c "$*"; }
else run() { bash -c "$*"; }; fi
run "initdb -D $DIR/data -U postgres -A trust >/dev/null"
run "pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log start -w >/dev/null"
trap 'run "pg_ctl -D $DIR/data stop -m fast >/dev/null" || true; rm -rf "$DIR"' EXIT
P="psql -X -q -v ON_ERROR_STOP=1 -h $DIR -p $PORT -U postgres -d postgres"
$P -f "$ROOT/tests/db/bootstrap.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do $P -f "$f" >/dev/null; done
OUT="$($P -A -F ' | ' -f "$ROOT/tests/db/cenarios.sql")"
# T07/T05: concorrência real com sessões paralelas
$P -f "$ROOT/tests/db/concorrencia.sql"
C=0; for k in a b; do ($P -v chave="c7-$k" -f "$ROOT/tests/db/receber7.sql" >/dev/null 2>&1 && echo ok || echo negado) > "$DIR/r-$k" & done; wait
OKS=$(cat "$DIR"/r-a "$DIR"/r-b | grep -c '^ok$' || true)
SALDO=$($P -At -c "select trim_scale(quantidade-quantidade_recebida) from ordem_compra_itens where id='29000000-0000-0000-0000-000000000002'")
T7=$([ "$OKS" = 1 ] && [ "$SALDO" = 3 ] && echo PASSOU || echo FALHOU)
OUT="$OUT
T07 duas sessões recebem 7 de 10 | 1 confirmação, saldo 3 | $T7 | $OKS confirmação(ões), saldo $SALDO"
for k in 1 2 3 4 5 6 7 8 9 10; do ($P -v chave="dup" -f "$ROOT/tests/db/receber7.sql" >/dev/null 2>&1 || true) & done; wait
N=$($P -At -c "select count(*) from recebimentos where chave='dup'")
T5=$([ "$N" -le 1 ] && echo PASSOU || echo FALHOU)
OUT="$OUT
T05 dez chamadas simultâneas mesma chave | no máximo 1 efeito | $T5 | $N movimento(s)"
echo "$OUT"
if echo "$OUT" | grep -q "FALHOU"; then echo "RESULTADO: FALHAS"; exit 1; fi
echo "RESULTADO: TODOS PASSARAM"
