# Enqueue follow-up commands for an existing RequestKey (after CREATE processed)
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$RequestKey,
    [Parameter(Mandatory)]
    [ValidateSet('SUBMIT', 'COMPLETE_STEP', 'RETURN_STEP', 'CONFIRM_PAYMENT')]
    [string]$CommandType,
    [string]$ActorUPN = 'demo@local',
    [string]$Reason = '',
    [string]$DecisionNote = '',
    [switch]$SkipChecklistForPilot,
    [switch]$AutoCompleteChecklist,
    [string]$SiteUrl = 'https://emicomvn.sharepoint.com/sites/cecm'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module PnP.PowerShell -ErrorAction Stop
$conn = Get-PnPConnection -ErrorAction Stop
$web = Get-PnPWeb -Connection $conn -Includes Url
if ($web.Url.TrimEnd('/') -ine $SiteUrl.TrimEnd('/')) {
    throw "Safety stop: connected [$($web.Url)] != expected [$SiteUrl]"
}

$guids = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'config\list-guids.json') -Raw | ConvertFrom-Json
$cmdList = [Guid]$guids.EMI_PAY_Commands
$ck = 'CMD-{0:yyyyMMddHHmmss}-{1}' -f (Get-Date).ToUniversalTime(), ([guid]::NewGuid().ToString('N').Substring(0, 6))

$payload = @{ actorUPN = $ActorUPN }
switch ($CommandType) {
    'SUBMIT' {
        $payload.skipChecklistForPilot = [bool]$SkipChecklistForPilot
        $payload.autoCompleteChecklist = [bool]$AutoCompleteChecklist
    }
    'COMPLETE_STEP' { $payload.decisionNote = $(if ($DecisionNote) { $DecisionNote } else { 'ok' }) }
    'RETURN_STEP' {
        if (-not $Reason) { throw 'RETURN_STEP needs -Reason' }
        $payload.reason = $Reason
    }
    'CONFIRM_PAYMENT' { }
}

$values = @{
    Title       = "$CommandType-$ck"
    CommandKey  = $ck
    CommandType = $CommandType
    RequestKey  = $RequestKey
    PayloadJson = ($payload | ConvertTo-Json -Compress)
    State       = 'Pending'
    DedupeKey   = "$CommandType-$ck"
}
$item = Add-PnPListItem -List $cmdList -Values $values -Connection $conn
Write-Host "Enqueued $CommandType id=$($item.Id) key=$ck for $RequestKey" -ForegroundColor Cyan
