param([Parameter(Mandatory=$true)][string]$PostgresBin, [switch]$Write, [switch]$Check)
$ErrorActionPreference = 'Stop'
if ($env:PGTEST_EPHEMERAL -ne '1') { throw 'Declare PGTEST_EPHEMERAL=1 para permitir somente este fluxo descartável' }
if ($Write -and $Check) { throw 'Escolha -Write ou -Check' }
$typegenRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$typegenTemp = Join-Path $env:TEMP ('nexus-supabase-typegen-' + [guid]::NewGuid().ToString('N'))
$typegenAllowed = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
if (!$typegenTemp.StartsWith($typegenAllowed, [StringComparison]::OrdinalIgnoreCase)) { throw 'TEMP inválido' }
$typegenPg = [IO.Path]::GetFullPath($PostgresBin)
foreach ($typegenExe in @('postgres.exe','initdb.exe','pg_ctl.exe')) {
  if (!(Test-Path -LiteralPath (Join-Path $typegenPg $typegenExe))) { throw "Binário PostgreSQL ausente: $typegenExe" }
}
New-Item -ItemType Directory -Path $typegenTemp | Out-Null
$typegenListener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
$typegenListener.Start()
$typegenPort = $typegenListener.LocalEndpoint.Port
$typegenListener.Stop()
$typegenWasStarted = $false
$typegenOldHost = $env:PGTEST_HOST
$typegenOldPort = $env:PGTEST_PORT
try {
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Destination $typegenTemp
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'package-lock.json') -Destination $typegenTemp
  Push-Location -LiteralPath $typegenTemp
  try {
    # Pinned official registry dependencies; no lifecycle installer is executed.
    npm ci --ignore-scripts --registry=https://registry.npmjs.org --no-audit --no-fund *> (Join-Path $typegenTemp 'npm-ci.log')
    if ($LASTEXITCODE -ne 0) { throw 'npm ci falhou; consulte npm-ci.log no TEMP informado' }
  } finally { Pop-Location }
  & (Join-Path $typegenPg 'initdb.exe') -D (Join-Path $typegenTemp 'data') -U postgres -A trust -E UTF8 --no-locale *> (Join-Path $typegenTemp 'initdb.log')
  if ($LASTEXITCODE -ne 0) { throw 'initdb falhou' }
  $typegenStart = Start-Process -FilePath (Join-Path $typegenPg 'pg_ctl.exe') -ArgumentList @('-D',(Join-Path $typegenTemp 'data'),'-o',"`"-h 127.0.0.1 -p $typegenPort`"",'-l',(Join-Path $typegenTemp 'postgres.log'),'start','-w') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $typegenTemp 'pg-start.out') -RedirectStandardError (Join-Path $typegenTemp 'pg-start.err')
  $typegenStart.WaitForExit()
  if ($typegenStart.ExitCode -ne 0) { throw 'PostgreSQL não iniciou' }
  $typegenWasStarted = $true
  $env:PGTEST_HOST = '127.0.0.1'
  $env:PGTEST_PORT = "$typegenPort"
  node (Join-Path $PSScriptRoot 'prepare.mjs') $typegenTemp
  if ($LASTEXITCODE -ne 0) { throw 'Preparação do schema falhou' }
  node (Join-Path $PSScriptRoot 'generate.mjs') $typegenTemp
  if ($LASTEXITCODE -ne 0) { throw 'Geração oficial ou conferência do catálogo falhou' }
  $typegenOutput = Join-Path $typegenTemp 'database.public.types.ts'
  $typegenTarget = Join-Path $typegenRoot 'src\integrations\supabase\types.ts'
  if ($Check -and (Get-FileHash -LiteralPath $typegenOutput -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $typegenTarget -Algorithm SHA256).Hash) { throw 'Tipos atuais divergem do gerador; examine o arquivo TEMP antes de executar -Write' }
  if ($Write) { Copy-Item -LiteralPath $typegenOutput -Destination $typegenTarget }
} finally {
  $env:PGTEST_HOST = $typegenOldHost
  $env:PGTEST_PORT = $typegenOldPort
  if ($typegenWasStarted) {
    & (Join-Path $typegenPg 'pg_ctl.exe') -D (Join-Path $typegenTemp 'data') stop -m fast *> (Join-Path $typegenTemp 'pg-stop.log')
  }
  Write-Output "Artefatos, logs e proveniência locais: $typegenTemp"
}
