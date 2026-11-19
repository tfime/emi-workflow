[CmdletBinding()]
param(
    [string]$SiteUrl = 'https://emicomvn.sharepoint.com/sites/cecm',
    [string]$ClientId = '5c1a7c4d-3b40-4938-821d-12f44ee316e5',
    [switch]$Connect
)
$ErrorActionPreference = 'Stop'
Import-Module PnP.PowerShell
if ($Connect) {
    Connect-PnPOnline -Url $SiteUrl -ClientId $ClientId -Interactive
}
$lists = [ordered]@{
    PaymentTypes       = '60bb23f6-4702-4aed-b36f-b2b20b09e74d'
    OrgUnits           = 'a95e5ccf-00cc-4c7e-b375-828a07117530'
    ChecklistTemplates = '81b94541-2e8e-4457-af28-e47f4d284477'
    StepRecipients     = '7ebac733-193d-4216-bf63-785c6a5f06a2'
    WorkflowSteps      = '0135b54a-f4a3-4edc-a738-a64e12feb9ad'
    Commands           = 'e16b76dc-7686-43e9-b232-18c80e2b31d2'
}
$g = Get-PnPGroup -Identity 'GR-PAY-USERS'
Write-Host "USERS Id=$($g.Id)"
foreach ($key in $lists.Keys) {
    $l = Get-PnPList -Identity ([guid]$lists[$key]) -Includes RoleAssignments, HasUniqueRoleAssignments
    Write-Host "--- $key unique=$($l.HasUniqueRoleAssignments) ---"
    $found = $false
    foreach ($ra in $l.RoleAssignments) {
        $m = Get-PnPProperty -ClientObject $ra -Property Member
        $b = Get-PnPProperty -ClientObject $ra -Property RoleDefinitionBindings
        $names = ($b | ForEach-Object { $_.Name }) -join ','
        if ($m.Id -eq $g.Id) {
            Write-Host "MATCH $($m.Title) ($($m.Id)) => $names" -ForegroundColor Green
            $found = $true
        }
        else {
            Write-Host "  $($m.Title) => $names"
        }
    }
    if (-not $found) {
        Write-Host "MISSING GR-PAY-USERS on $key" -ForegroundColor Red
    }
}
