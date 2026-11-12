# Starts SPFx gulp serve on Node 22. Invoked by VS Code task gulp:serve.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..
. "$PSScriptRoot\resolve-node22.ps1"

if (-not $env:EMI_NODE22 -or -not (Test-Path $env:EMI_NODE22)) {
  Write-Error "EMI_NODE22 is not set to a valid node.exe"
}

$gulpJs = Join-Path (Get-Location) 'node_modules\gulp\bin\gulp.js'
$argsList = @($gulpJs, 'serve', '--nobrowser')
if ($env:EMI_SERVE_CONFIG) {
  $argsList += "--config=$($env:EMI_SERVE_CONFIG)"
  Write-Host "serveConfigurations: $($env:EMI_SERVE_CONFIG)"
}

Write-Host "Starting: $($env:EMI_NODE22) $($argsList -join ' ')"
Write-Host "process will report: $(& $env:EMI_NODE22 -v)"
& $env:EMI_NODE22 @argsList
exit $LASTEXITCODE
