# Resolves a Node 22 binary for SPFx 1.24 and prepends it to PATH.
# Prefer fnm, then a portable Node 22 under %TEMP%\node22, then refuse Node 26.
# Sets $env:EMI_NODE22 to the absolute node.exe path — tasks MUST use that
# (PowerShell command cache can keep resolving `node` to Node 26 after PATH changes).

$ErrorActionPreference = 'Stop'

function Prepend-Path([string]$dir) {
  if (-not (Test-Path $dir)) { return }
  $rest = @($env:Path -split ';' | Where-Object { $_ -and ($_ -ne $dir) }) -join ';'
  $env:Path = "$dir;$rest"
}

# SPFx serve needs certutil.exe (System32). Keep Windows paths if a host shell stripped them.
foreach ($winDir in @(
    (Join-Path $env:WINDIR 'System32'),
    (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0')
  )) {
  if ((Test-Path $winDir) -and ($env:Path -notlike "*$winDir*")) {
    $env:Path = "$env:Path;$winDir"
  }
}

$selected = $null

$fnm = Get-Command fnm -ErrorAction SilentlyContinue
if ($fnm) {
  & fnm env --use-on-cd --shell power-shell | Out-String | Invoke-Expression
  & fnm use 22 2>$null | Out-Null
  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($nodeCmd) {
    $ver = & $nodeCmd.Source -v 2>$null
    if ($ver -match '^v22\.') {
      $selected = $nodeCmd.Source
      Prepend-Path (Split-Path $selected -Parent)
    }
  }
}

if (-not $selected) {
  $portableRoot = Join-Path $env:TEMP 'node22'
  $candidates = @(
    (Join-Path $portableRoot 'node-v22.21.1-win-x64\node.exe'),
    (Get-ChildItem -Path $portableRoot -Filter 'node.exe' -Recurse -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match 'node-v22\.' } |
      Select-Object -First 1 -ExpandProperty FullName)
  ) | Where-Object { $_ -and (Test-Path $_) }

  foreach ($nodeExe in $candidates) {
    $ver = & $nodeExe -v
    if ($ver -match '^v22\.') {
      Prepend-Path (Split-Path $nodeExe -Parent)
      $selected = $nodeExe
      break
    }
  }
}

if (-not $selected) {
  $current = (& node -v) 2>$null
  Write-Error @"
Node 22 is required for SPFx gulp serve (got: $current).
Install with: fnm install 22
Or extract Node 22 win-x64 under: $env:TEMP\node22\
"@
}

$env:EMI_NODE22 = $selected
$env:NODE_OPTIONS = '--dns-result-order=ipv4first'
Write-Host "Using Node $(& $selected -v) at $selected"
Write-Host "EMI_NODE22=$($env:EMI_NODE22)"
Write-Host "NODE_OPTIONS=$($env:NODE_OPTIONS)"
