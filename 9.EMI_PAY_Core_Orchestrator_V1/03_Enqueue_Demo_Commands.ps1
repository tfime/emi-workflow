# Enqueue demo command chain for Core UAT (admin account with Commands write access)
[CmdletBinding()]
param(
    [string]$SiteUrl = 'https://emicomvn.sharepoint.com/sites/cecm',
    [ValidateSet('HappyPath', 'ReturnThenResume', 'CreateOnly')]
    [string]$Scenario = 'CreateOnly',
    [string]$CreatorUPN = 'demo@local',
    [string]$ActorUPN = 'demo@local',
    [switch]$AutoCompleteChecklist
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Import-Module PnP.PowerShell -ErrorAction Stop
$connection = Get-PnPConnection -ErrorAction Stop
$web = Get-PnPWeb -Connection $connection -Includes Url
if ($web.Url.TrimEnd('/') -ine $SiteUrl.TrimEnd('/')) {
    throw "Safety stop: connected [$($web.Url)] != expected [$SiteUrl]"
}

$root = $PSScriptRoot
$guids = Get-Content -LiteralPath (Join-Path $root 'config\list-guids.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$cmdList = [Guid]$guids.EMI_PAY_Commands

function New-Key([string]$Prefix) {
    return '{0}-{1:yyyyMMddHHmmss}-{2}' -f $Prefix, (Get-Date).ToUniversalTime(), ([guid]::NewGuid().ToString('N').Substring(0, 6))
}

function Add-Command {
    param(
        [string]$Type,
        [hashtable]$Payload,
        [string]$RequestKey = '',
        [string]$StepInstanceKey = ''
    )
    $ck = New-Key 'CMD'
    $dk = "$Type-$ck"
    $values = @{
        Title           = "$Type-$ck"
        CommandKey      = $ck
        CommandType     = $Type
        PayloadJson     = ($Payload | ConvertTo-Json -Compress -Depth 6)
        State           = 'Pending'
        DedupeKey       = $dk
        RequestKey      = $RequestKey
        StepInstanceKey = $StepInstanceKey
    }
    $item = Add-PnPListItem -List $cmdList -Values $values -Connection $connection
    Write-Host "Enqueued $Type id=$($item.Id) key=$ck" -ForegroundColor Cyan
    return [pscustomobject]@{ Id = $item.Id; CommandKey = $ck; RequestKey = $RequestKey }
}

$runId = New-Key 'RUN'
$requestKey = New-Key 'REQ'

$createPayload = @{
    paymentTypeCode = 'SPV_PAYMENT'
    createdOUCode   = 'OU_PBCM'
    creatorUPN      = $CreatorUPN
    amount          = 1500000
    explanation     = "Demo $Scenario $runId"
    requestCode     = "SPV-$($runId.Substring($runId.Length - 8))"
}
$created = Add-Command -Type 'CREATE_REQUEST' -Payload $createPayload -RequestKey $requestKey

if ($Scenario -eq 'CreateOnly') {
    Write-Host "RequestKey=$requestKey — chạy 02_Run_Orchestrator.ps1 rồi enqueue SUBMIT thủ công." -ForegroundColor Green
    return
}

$submitPayload = @{
    actorUPN               = $CreatorUPN
    autoCompleteChecklist  = [bool]$AutoCompleteChecklist
    skipChecklistForPilot  = -not [bool]$AutoCompleteChecklist
}
# For HappyPath/Return demo without files: skipChecklistForPilot=$true unless AutoCompleteChecklist
if (-not $AutoCompleteChecklist) {
    $submitPayload.skipChecklistForPilot = $true
}

Write-Host @"

Đã tạo CREATE_REQUEST (RequestKey=$requestKey).
Tiếp theo:
  1) .\02_Run_Orchestrator.ps1
  2) Enqueue SUBMIT / COMPLETE... bằng script này lần 2 hoặc thủ công.

Gợi ý payload SUBMIT:
$($submitPayload | ConvertTo-Json)

"@ -ForegroundColor Yellow

# Persist helper file for next steps
$statePath = Join-Path $root "demo-state-$runId.json"
@{
    runId       = $runId
    requestKey  = $requestKey
    scenario    = $Scenario
    createCmd   = $created.CommandKey
    submitHint  = $submitPayload
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statePath -Encoding UTF8
Write-Host "State file: $statePath" -ForegroundColor Green
