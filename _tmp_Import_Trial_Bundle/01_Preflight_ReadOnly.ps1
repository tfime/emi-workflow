#Requires -Version 7.2
<#
.SYNOPSIS EMI PAY - Read-only preflight for Main Flow V1.0.0.2.
.DESCRIPTION Does not create/update records, fields, permissions, or flows.
#>
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$site='https://emicomvn.sharepoint.com/sites/cecm'
$connection=Get-PnPConnection
if(-not $connection){throw "Connect-PnPOnline -Url '$site' -ClientId <existing client id> -Interactive first."}
if([string]$connection.Url -ne $site){throw "WRONG SITE: $($connection.Url) expected $site"}
$objects=@(
  @{Name='EMI_PAY_Requests'; Guid='12b3051d-7642-4f90-a39d-5364df561fbf'},
  @{Name='EMI_PAY_Commands'; Guid='e16b76dc-7686-43e9-b232-18c80e2b31d2'},
  @{Name='EMI_PAY_WorkflowVersions'; Guid='b263446d-7cea-4fd8-bfde-b22dd2de4281'},
  @{Name='EMI_PAY_WorkflowSteps'; Guid='0135b54a-f4a3-4edc-a738-a64e12feb9ad'},
  @{Name='EMI_PAY_StepRecipients'; Guid='7ebac733-193d-4216-bf63-785c6a5f06a2'},
  @{Name='EMI_PAY_OrgUnits'; Guid='a95e5ccf-00cc-4c7e-b375-828a07117530'},
  @{Name='EMI_PAY_PaymentTypes'; Guid='60bb23f6-4702-4aed-b36f-b2b20b09e74d'},
  @{Name='EMI_PAY_WorkItems'; Guid='e21ef6e7-ee31-466a-be3b-65ae30ca7722'},
  @{Name='EMI_PAY_ChecklistItems'; Guid='d02c6a03-9561-4d90-b5d5-ad30a2fef88b'},
  @{Name='EMI_PAY_DocumentIndex'; Guid='a45c74cd-1f21-454c-9fcc-6812692b801b'},
  @{Name='EMI_PAY_ActivityPublic'; Guid='84b57c9e-6b90-4a6b-a200-b3afb4499895'}
)
$results=[System.Collections.Generic.List[object]]::new()
foreach($entry in $objects){
 $l=Get-PnPList -Identity ([guid]$entry.Guid) -Includes HasUniqueRoleAssignments,ItemCount
 if(-not $l.HasUniqueRoleAssignments){throw "RBAC regression: $($entry.Name) inherits site permission"}
 $results.Add([pscustomobject]@{List=$entry.Name;ItemCount=$l.ItemCount;UniqueACL=$l.HasUniqueRoleAssignments})
}
$reqID=[guid]'12b3051d-7642-4f90-a39d-5364df561fbf'
foreach($field in 'PaymentLECode','WorkflowVersionNo','PaymentDueAt'){
 $f=Get-PnPField -List $reqID -Identity $field -ErrorAction SilentlyContinue
 if(-not $f){Write-Warning "MISSING EMI_PAY_Requests.$field"}else{Write-Host "PASS field $field $($f.TypeAsString)" -ForegroundColor Green}
}
$checks=@(
 @{Guid='b263446d-7cea-4fd8-bfde-b22dd2de4281';Field='Lifecycle'},
 @{Guid='0135b54a-f4a3-4edc-a738-a64e12feb9ad';Field='StepKind'},
 @{Guid='e16b76dc-7686-43e9-b232-18c80e2b31d2';Field='State'},
 @{Guid='12b3051d-7642-4f90-a39d-5364df561fbf';Field='Status'},
 @{Guid='e21ef6e7-ee31-466a-be3b-65ae30ca7722';Field='State'},
 @{Guid='e21ef6e7-ee31-466a-be3b-65ae30ca7722';Field='StepKind'},
 @{Guid='e21ef6e7-ee31-466a-be3b-65ae30ca7722';Field='Decision'}
)
foreach($c in $checks){
 $f=Get-PnPField -List ([guid]$c.Guid) -Identity $c.Field
 Get-PnPProperty -ClientObject $f -Property Choices | Out-Null
 Write-Host "CHOICE $($c.Guid) $($c.Field): $(@($f.Choices) -join ', ')"
}
$results | Format-Table -AutoSize
Write-Host 'PREFLIGHT READ ONLY DONE. Nothing was modified.' -ForegroundColor Cyan
