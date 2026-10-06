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
