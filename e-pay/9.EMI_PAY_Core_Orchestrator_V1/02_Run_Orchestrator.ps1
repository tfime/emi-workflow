# Poll / process Pending commands on EMI_PAY_Commands
[CmdletBinding()]
param(
    [string]$SiteUrl = 'https://emicomvn.sharepoint.com/sites/cecm',
    [int]$Top = 20,
    [string]$CommandKey = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = $PSScriptRoot
Import-Module (Join-Path $root 'src\EMI_PAY_Orchestrator.psm1') -Force
Initialize-EmiPayOrchestrator -Root $root -SiteUrl $SiteUrl

if ($CommandKey) {
    $guids = Get-Content -LiteralPath (Join-Path $root 'config\list-guids.json') -Raw | ConvertFrom-Json
    $listId = [Guid]$guids.EMI_PAY_Commands
    $escaped = [System.Security.SecurityElement]::Escape($CommandKey)
    $query = "<View><Query><Where><Eq><FieldRef Name='CommandKey' /><Value Type='Text'>$escaped</Value></Eq></Where></Query><RowLimit>5</RowLimit></View>"
    $items = @(Get-PnPListItem -List $listId -Query $query)
    if ($items.Count -eq 0) { throw "CommandKey not found: $CommandKey" }
    Invoke-EmiPayCommand -Command $items[0]
}
else {
    Invoke-EmiPayOrchestratorBatch -Top $Top
}
