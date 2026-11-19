#Requires -Version 7.0
[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('Preflight','DryRun','Apply','Verify')]
  [string]$Mode,

  [string]$Config = '',

  [switch]$ConfirmApply,

  [switch]$SkipSampleGenerate
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
Import-Module (Join-Path $here 'Common.psm1') -Force

if ([string]::IsNullOrWhiteSpace($Config)) {
  $Config = Join-Path (Get-DemoRoot) 'config\settings.json'
}

Write-Host "=== EMI SharePoint Demo :: $Mode ==="
Write-Host "Config: $Config"

switch ($Mode) {
  'Preflight' {
    & (Join-Path $here '00-preflight.ps1') -ConfigPath $Config
  }
  'DryRun' {
    if (-not $SkipSampleGenerate) {
      & (Join-Path $here '00-Generate-SampleFiles.ps1')
    }
    & (Join-Path $here '01-provision-hub.ps1') -ConfigPath $Config -Mode DryRun
    & (Join-Path $here '02-provision-cecm.ps1') -ConfigPath $Config -Mode DryRun
    & (Join-Path $here '03-provision-permissions.ps1') -ConfigPath $Config -Mode DryRun
    & (Join-Path $here '04-seed-content.ps1') -ConfigPath $Config -Mode DryRun
    Write-Host 'DryRun complete — không thay đổi SharePoint.'
  }
  'Apply' {
    if (-not $ConfirmApply) {
      throw "Apply bị chặn. Chạy lại với -ConfirmApply sau khi Preflight/DryRun OK."
    }
    if (-not $SkipSampleGenerate) {
      & (Join-Path $here '00-Generate-SampleFiles.ps1')
    }
    & (Join-Path $here '01-provision-hub.ps1') -ConfigPath $Config -Mode Apply
    & (Join-Path $here '02-provision-cecm.ps1') -ConfigPath $Config -Mode Apply
    & (Join-Path $here '03-provision-permissions.ps1') -ConfigPath $Config -Mode Apply
    & (Join-Path $here '04-seed-content.ps1') -ConfigPath $Config -Mode Apply
    & (Join-Path $here '05-verify.ps1') -ConfigPath $Config
    Write-Host 'Apply + Verify finished. Xem reports/.'
  }
  'Verify' {
    & (Join-Path $here '05-verify.ps1') -ConfigPath $Config
  }
}
