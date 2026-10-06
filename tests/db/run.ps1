param([Parameter(Mandatory=$true)][string]$PostgresBin, [int]$Port = 55440)
$ErrorActionPreference = 'Stop'
$testRoot = Join-Path $env:TEMP ('nexus-checkpoint-test-' + [guid]::NewGuid().ToString('N'))
$absoluteRoot = [IO.Path]::GetFullPath($testRoot)
$allowedRoot = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
if (!$absoluteRoot.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe test directory' }
New-Item -ItemType Directory -Path $absoluteRoot | Out-Null
$psql = Join-Path $PostgresBin 'psql.exe'
function Invoke-TestSql([string]$file) {
  & $psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres -f $file
  if ($LASTEXITCODE -ne 0) { throw "SQL failed: $file" }
}
try {
  & (Join-Path $PostgresBin 'initdb.exe') -D "$absoluteRoot\data" -U postgres -A trust -E UTF8 --no-locale | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
  $start = Start-Process -FilePath (Join-Path $PostgresBin 'pg_ctl.exe') -ArgumentList @('-D', "$absoluteRoot\data", '-o', "`"-h 127.0.0.1 -p $Port`"", '-l', "$absoluteRoot\postgres.log", 'start', '-w') -WindowStyle Hidden -PassThru
  # Start-Process -Wait follows the server's descendants; wait for pg_ctl itself only.
  $start.WaitForExit()
  if ($start.ExitCode -ne 0) { throw 'PostgreSQL startup failed' }
  Invoke-TestSql "$PSScriptRoot\bootstrap.sql"
  foreach ($dir in @("supabase", "drizzle")) { Get-ChildItem "$PSScriptRoot\..\..\$dir\migrations\*.sql" | Sort-Object Name | ForEach-Object { Invoke-TestSql $_.FullName } }
  Invoke-TestSql "$PSScriptRoot\cenarios.sql"
  # Geração de OC/OP: idempotência por contexto, prévia = execução, rascunho de OP antigo, aprovação técnica.
  $ordens = & $psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres -f "$PSScriptRoot\ordens.sql"
  if ($LASTEXITCODE -ne 0) { throw 'SQL failed: ordens.sql' }
  $ordens | Write-Output
  if ($ordens -match 'FALHOU') { throw 'ordens.sql: cenários falharam' }
  $auth = "set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000e',false);"
  function Sql1([string]$q) { (& $psql -X -qAt -h 127.0.0.1 -p $Port -U postgres -d postgres -c $q) -join '' }
  $par = { param($p, $port, $q) & $p -X -qAt -h 127.0.0.1 -p $port -U postgres -d postgres -c $q 2>&1 | Out-String }
  # G08: duas sessões simultâneas com chaves diferentes cobrem o saldo uma única vez.
  $jobs = 'a','b' | ForEach-Object { Start-Job -ScriptBlock $par -ArgumentList $psql, $Port, "$auth select gerar_ordens('42000000-0000-0000-0000-000000000001','par-$_-xxxx')" }
  $jobs | Wait-Job | Receive-Job | Out-Null
  $q = Sql1 "select trim_scale(sum(quantidade)) from ordem_compra_itens where demanda_id='44000000-0000-0000-0000-000000000001'"
  if ($q -ne '30') { throw "G08 FALHOU: comprometido $q (esperado 30)" }; Write-Output 'G08 duas sessões, chaves diferentes | PASSOU'
  # C01: edição técnica durante a geração -> geração espera a trava e recusa.
  Sql1 "update demandas set quantidade_planejada=35 where id='44000000-0000-0000-0000-000000000001'" | Out-Null
  $edit = Start-Job -ScriptBlock $par -ArgumentList $psql, $Port, "begin; update revisao_componentes set quantidade_avulsa=quantidade_avulsa+1 where id='43000000-0000-0000-0000-000000000002'; select pg_sleep(2); commit;"
  Start-Sleep -Milliseconds 1500
  $err = (Start-Job -ScriptBlock $par -ArgumentList $psql, $Port, "$auth select gerar_ordens('42000000-0000-0000-0000-000000000001','c1-xxxxxxxx')" | Wait-Job | Receive-Job)
  $edit | Wait-Job | Out-Null
  $q = Sql1 "select trim_scale(sum(quantidade)) from ordem_compra_itens where demanda_id='44000000-0000-0000-0000-000000000001'"
  if ($q -ne '30' -or $err -notmatch 'mudou|Recalcule') { throw "C01 FALHOU: comprometido $q, $err" }; Write-Output 'C01 edição técnica durante geração | PASSOU'
  Sql1 "update revisao_componentes set quantidade_avulsa=quantidade_avulsa-1 where id='43000000-0000-0000-0000-000000000002'; update proposta_revisoes set desatualizada=false where id='42000000-0000-0000-0000-000000000001';" | Out-Null
  # C02: atualização da demanda durante a geração -> geração usa o planejamento confirmado, sem duplicar.
  $lin = '[{"revisao_componente_id":"43000000-0000-0000-0000-000000000001","modalidade":"comprar","quantidade_necessaria":40,"quantidade_planejada":40,"quantidade_tecnica":40,"origem":{}}]'
  $upd = Start-Job -ScriptBlock $par -ArgumentList $psql, $Port, "$auth begin; select aplicar_demanda('42000000-0000-0000-0000-000000000001', hash_tecnico('42000000-0000-0000-0000-000000000001'), '$lin', '{}'); select pg_sleep(2); commit;"
  Start-Sleep -Milliseconds 1500
  Start-Job -ScriptBlock $par -ArgumentList $psql, $Port, "$auth select gerar_ordens('42000000-0000-0000-0000-000000000001','c2-xxxxxxxx')" | Wait-Job | Receive-Job | Out-Null
  $upd | Wait-Job | Out-Null
  $q = Sql1 "select trim_scale(sum(quantidade)) from ordem_compra_itens where demanda_id='44000000-0000-0000-0000-000000000001'"
  if ($q -ne '40') { throw "C02 FALHOU: comprometido $q (esperado 40)" }; Write-Output 'C02 atualização de demanda durante geração | PASSOU'
  Invoke-TestSql "$PSScriptRoot\save-checkpoints.sql"
  $env:PGTEST_PSQL = $psql; $env:PGTEST_HOST = '127.0.0.1'; $env:PGTEST_PORT = "$Port"
  node "$PSScriptRoot\save-concurrency.mjs"
  if ($LASTEXITCODE -ne 0) { throw 'Concurrent checkpoint test failed' }
} finally {
  if (Test-Path -LiteralPath "$absoluteRoot\data\postmaster.pid") {
    Start-Process -FilePath (Join-Path $PostgresBin 'pg_ctl.exe') -ArgumentList @('-D', "$absoluteRoot\data", 'stop', '-m', 'fast', '-w') -WindowStyle Hidden -Wait
  }
  # Single-shell cleanup, with the absolute target verified inside the dedicated temp directory.
  if ($absoluteRoot.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $absoluteRoot -Leaf).StartsWith('nexus-checkpoint-test-')) {
    Remove-Item -LiteralPath $absoluteRoot -Recurse -Force
  }
}
