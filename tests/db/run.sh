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
for f in "$ROOT"/supabase/migrations/*.sql "$ROOT"/drizzle/migrations/*.sql; do $P -f "$f" >/dev/null; done
OUT="$($P -A -F ' | ' -f "$ROOT/tests/db/cenarios.sql")"
# T07/T05: concorrência real com sessões paralelas
$P -f "$ROOT/tests/db/concorrencia.sql"
C=0; for k in a b; do ($P -v chave="c7-$k" -v item=29000000-0000-0000-0000-000000000002 -v qtd=7 -f "$ROOT/tests/db/receber7.sql" >/dev/null 2>&1 && echo ok || echo negado) > "$DIR/r-$k" & done; wait
OKS=$(cat "$DIR"/r-a "$DIR"/r-b | grep -c '^ok$' || true)
SALDO=$($P -At -c "select trim_scale(quantidade-quantidade_recebida) from ordem_compra_itens where id='29000000-0000-0000-0000-000000000002'")
T7=$([ "$OKS" = 1 ] && [ "$SALDO" = 3 ] && echo PASSOU || echo FALHOU)
OUT="$OUT
T07 duas sessões recebem 7 de 10 | 1 confirmação, saldo 3 | $T7 | $OKS confirmação(ões), saldo $SALDO"
for k in 1 2 3 4 5 6 7 8 9 10; do ($P -v chave="dup" -v item=29000000-0000-0000-0000-000000000001 -v qtd=1 -f "$ROOT/tests/db/receber7.sql" >/dev/null 2>&1 || true) & done; wait
N=$($P -At -c "select count(*) from recebimentos where chave='dup'")
T5=$([ "$N" = 1 ] && echo PASSOU || echo FALHOU)
OUT="$OUT
T05 dez chamadas simultâneas mesma chave | exatamente 1 efeito | $T5 | $N movimento(s)"
GOUT="$($P -f "$ROOT/tests/db/ordens.sql")"
# G08: duas sessões simultâneas com chaves diferentes cobrem o saldo uma única vez
for k in a b; do ($P -At -c "set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000e',false); select gerar_ordens('42000000-0000-0000-0000-000000000001','par-$k-xxxx')" >/dev/null 2>&1 || true) & done; wait
GQ=$($P -At -c "select trim_scale(sum(quantidade)) from ordem_compra_itens where demanda_id='44000000-0000-0000-0000-000000000001'")
G8=$([ "$GQ" = 30 ] && echo PASSOU || echo FALHOU)
OUT="$OUT
$GOUT
G08 duas sessões, chaves diferentes | $G8 | comprometido $GQ (esperado 30)"
# C01: edição técnica da proposta em curso durante a geração -> geração espera a trava e recusa o plano antigo.
AUTH="set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000e',false);"
$P -c "update demandas set quantidade_planejada=35 where id='44000000-0000-0000-0000-000000000001'" >/dev/null
($P -c "begin; update revisao_componentes set quantidade_avulsa=quantidade_avulsa+1 where id='43000000-0000-0000-0000-000000000002'; select pg_sleep(2); commit;" >/dev/null 2>&1) &
sleep 0.7
C1ERR=$($P -At -c "$AUTH select gerar_ordens('42000000-0000-0000-0000-000000000001','c1-xxxxxxxx')" 2>&1 >/dev/null || true); wait
C1Q=$($P -At -c "select trim_scale(sum(quantidade)) from ordem_compra_itens where demanda_id='44000000-0000-0000-0000-000000000001'")
C1=$([ "$C1Q" = 30 ] && echo "$C1ERR" | grep -Eq "mudou|Recalcule" && echo PASSOU || echo FALHOU)
$P -c "update revisao_componentes set quantidade_avulsa=quantidade_avulsa-1 where id='43000000-0000-0000-0000-000000000002'; update proposta_revisoes set desatualizada=false where id='42000000-0000-0000-0000-000000000001';" >/dev/null
# C02: atualização da demanda (aplicar_demanda) em curso durante a geração -> geração usa o planejamento confirmado, sem duplicar.
LIN='[{"revisao_componente_id":"43000000-0000-0000-0000-000000000001","modalidade":"comprar","quantidade_necessaria":40,"quantidade_planejada":40,"quantidade_tecnica":40,"origem":{}}]'
($P -c "$AUTH begin; select aplicar_demanda('42000000-0000-0000-0000-000000000001', hash_tecnico('42000000-0000-0000-0000-000000000001'), '$LIN', '{}'); select pg_sleep(2); commit;" >/dev/null 2>&1) &
sleep 0.7
$P -At -c "$AUTH select gerar_ordens('42000000-0000-0000-0000-000000000001','c2-xxxxxxxx')" >/dev/null 2>&1 || true; wait
C2Q=$($P -At -c "select trim_scale(sum(quantidade)) from ordem_compra_itens where demanda_id='44000000-0000-0000-0000-000000000001'")
C2=$([ "$C2Q" = 40 ] && echo PASSOU || echo FALHOU)
OUT="$OUT
C01 edição técnica durante geração | $C1 | comprometido $C1Q (esperado 30), erro: ${C1ERR##*ERROR:  }
C02 atualização de demanda durante geração | $C2 | comprometido $C2Q (esperado 40)"
$P -f "$ROOT/tests/db/save-checkpoints.sql"
PGTEST_HOST="$DIR" PGTEST_PORT="$PORT" node "$ROOT/tests/db/save-concurrency.mjs"
echo "$OUT"
if echo "$OUT" | grep -q "FALHOU"; then echo "RESULTADO: FALHAS"; exit 1; fi
echo "RESULTADO: TODOS PASSARAM"
