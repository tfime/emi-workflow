#Requires -Version 7.2
<#
.SYNOPSIS
  EMI PAY Core V1 — validate/seed configuration using EXISTING CECM Lists by GUID.
.DESCRIPTION
  Default Validate: NO writes. Apply: explicit -Mode Apply -ApproveSchemaExtension
  -ApproveChoiceExtensions and filled configuration CSVs required.
  Does NOT create a Flow, alter permissions, delete records or seed fake people.
#>
[CmdletBinding()]
param(
    [ValidateSet('Validate','Apply')][string]$Mode = 'Validate',
    [switch]$ApproveSchemaExtension,
    [switch]$ApproveChoiceExtensions,
    [string]$Root = (Split-Path -Parent $PSScriptRoot)
)
$ErrorActionPreference='Stop'
$site='https://emicomvn.sharepoint.com/sites/cecm'
$cfg = Get-Content -Raw -Encoding UTF8 (Join-Path $Root 'config/workflow.json') | ConvertFrom-Json
$ids = Get-Content -Raw -Encoding UTF8 (Join-Path $Root 'reference/CECM_23_object_ids.json') | ConvertFrom-Json
$routing = @(Import-Csv -Encoding UTF8 (Join-Path $Root 'config/routing.template.csv'))
$types = @(Import-Csv -Encoding UTF8 (Join-Path $Root 'config/paymenttypes.template.csv'))
$checklists = @(Import-Csv -Encoding UTF8 (Join-Path $Root 'config/checklist.template.csv'))
$c=Get-PnPConnection
if (-not $c) { throw "Connect-PnPOnline to $site first." }
if ([string]$c.Url -ne $site) { throw "WRONG SITE: $($c.Url) ; expected $site" }
Write-Host "MODE=$Mode ; TARGET=$site"
$required = @('EMI_PAY_WorkflowVersions','EMI_PAY_WorkflowSteps','EMI_PAY_StepRecipients','EMI_PAY_PaymentTypes','EMI_PAY_Requests','EMI_PAY_Commands','EMI_PAY_WorkItems','EMI_PAY_ActivityPublic','EMI_PAY_ActivityInternal')
foreach($n in $required){
  $l=Get-PnPList -Identity ([guid]$ids.$n.id) -Includes Id,HasUniqueRoleAssignments,ItemCount
  if ([string]$l.Id -ne [string]$ids.$n.id) { throw "GUID mismatch: $n" }
  if (-not $l.HasUniqueRoleAssignments) { throw "RBAC regression: $n inherits permissions" }
  Write-Host ("PASS schema object: {0} {1}" -f $n,$l.Id) -ForegroundColor Green
}
# Fail closed before ANY change: routing and approved payment types must be complete.
if ($Mode -eq 'Apply') {
  $keys=@($cfg.steps | Where-Object {$_.StepKey -ne 'SYSTEM_ARCHIVE'} | ForEach-Object {$_.StepKey})
  foreach($key in $keys){
    $row=@($routing | Where-Object {$_.StepKey -eq $key})
    if($row.Count -ne 1 -or [string]::IsNullOrWhiteSpace($row[0].OUCode)) { throw "Fill one actual OUCode for $key before Apply." }
  }
  $validTypes=@($types | Where-Object {-not [string]::IsNullOrWhiteSpace($_.PaymentTypeCode) -and -not [string]::IsNullOrWhiteSpace($_.Title) -and -not [string]::IsNullOrWhiteSpace($_.WorkflowCode)})
  if($validTypes.Count -eq 0){throw 'Fill at least one approved payment type before Apply.'}
}
# Snapshot configuration rows before ANY write. No rollback is performed automatically.
if ($Mode -eq 'Apply') {
  $snapDir=Join-Path $Root ('backup_CORE_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
  New-Item -ItemType Directory -Path $snapDir -Force | Out-Null
  foreach($n in @('EMI_PAY_WorkflowVersions','EMI_PAY_WorkflowSteps','EMI_PAY_StepRecipients','EMI_PAY_PaymentTypes','EMI_PAY_ChecklistTemplates')){
    $lg=[guid]$ids.$n.id
    $records=@(Get-PnPListItem -List $lg -PageSize 500 | ForEach-Object {
      [pscustomobject]@{ ID=$_.Id; Title=$_.FieldValues['Title']; FieldValues=$_.FieldValues }
    })
    ConvertTo-Json -InputObject $records -Depth 10 | Set-Content -Path (Join-Path $snapDir ($n+'.json')) -Encoding UTF8
  }
  Write-Host "Config snapshot captured: $snapDir" -ForegroundColor Yellow
}
$addFields=@(
  @{List='EMI_PAY_Requests';Name='PaymentLECode';Type='Text';Label='Pháp nhân thanh toán'},
  @{List='EMI_PAY_Requests';Name='WorkflowVersionNo';Type='Number';Label='Phiên bản quy trình cố định'},
  @{List='EMI_PAY_Requests';Name='PaymentDueAt';Type='DateTime';Label='Thời hạn thanh toán'}
)
foreach($f in $addFields){
  $lg=[guid]$ids.($f.List).id
  $field=Get-PnPField -List $lg -Identity $f.Name -ErrorAction SilentlyContinue
  if (!$field){
    Write-Warning "MISSING: $($f.List).$($f.Name) [$($f.Type)]"
    if($Mode -eq 'Apply'){
      if (!$ApproveSchemaExtension){throw 'Missing schema fields; run with -ApproveSchemaExtension to add 3 proposed fields.'}
      Add-PnPField -List $lg -InternalName $f.Name -DisplayName $f.Label -Type $f.Type -Group 'EMI PAY' | Out-Null
      Write-Host "ADDED: $($f.Name)" -ForegroundColor Yellow
    }
  }
}
# Compare actual SharePoint Choice options with the canonical Core V1 vocabulary.
$choices=@(
  @{List='EMI_PAY_WorkflowVersions';Name='Lifecycle';Values=@('DRAFT','PUBLISHED','RETIRED')},
  @{List='EMI_PAY_WorkflowSteps';Name='StepKind';Values=@('PREPARE','REVIEW','APPROVAL','PAYMENT','SYSTEM')},
  @{List='EMI_PAY_Commands';Name='State';Values=@('NEW','PROCESSING','SUCCEEDED','REJECTED','FAILED','NEEDS_RECONCILIATION')},
  @{List='EMI_PAY_Requests';Name='Status';Values=@('DRAFT','IN_PROGRESS','RETURNED','ARCHIVE_PENDING','COMPLETED')},
  @{List='EMI_PAY_WorkItems';Name='State';Values=@('OPEN','CLOSED')},
  @{List='EMI_PAY_WorkItems';Name='Decision';Values=@('PASS','REJECT')}
)
foreach($m in $choices){
  $lg=[guid]$ids.($m.List).id
  $f=Get-PnPField -List $lg -Identity $m.Name
  Get-PnPProperty -ClientObject $f -Property Choices | Out-Null
  $old=@($f.Choices)
  $miss=@($m.Values | Where-Object {$_ -notin $old})
  Write-Host ("CHOICE {0}.{1}: existing=[{2}] missing=[{3}]" -f $m.List,$m.Name,($old -join ','),($miss -join ','))
  if ($miss.Count -gt 0 -and $Mode -eq 'Apply'){
    if (!$ApproveChoiceExtensions){throw "Missing choices for $($m.List).$($m.Name); use -ApproveChoiceExtensions."}
    # Add-only: preserve every previously defined Choice value.
    Set-PnPField -List $lg -Identity $m.Name -Values @{Choices = @($old + $miss)} | Out-Null
    Write-Host "EXTENDED CHOICE: $($m.List).$($m.Name)" -ForegroundColor Yellow
  }
}
if($Mode -eq 'Validate') {
  Write-Host 'VALIDATE DONE. No changes made. Complete CSVs and run Apply only after checking choice/schema diffs.' -ForegroundColor Cyan
  return
}
# Fail closed before writing business rows if routing/payment type is not grounded.
$expected=@($cfg.steps | Where-Object {$_.StepKey -ne 'SYSTEM_ARCHIVE'} | ForEach-Object {$_.StepKey})
foreach($key in $expected) {
  $row=@($routing | Where-Object {$_.StepKey -eq $key})
  if($row.Count -ne 1 -or [string]::IsNullOrWhiteSpace($row[0].OUCode)) {throw "Complete exactly one actual OUCode for step $key in routing.template.csv before Apply."}
}
$payValid=@($types | Where-Object {-not [string]::IsNullOrWhiteSpace($_.PaymentTypeCode) -and -not [string]::IsNullOrWhiteSpace($_.Title)})
if($payValid.Count -eq 0){throw 'Fill paymenttypes.template.csv with at least one REAL approved PaymentTypeCode before Apply.'}
# Upsert by business key only; do not wipe or replace other items.
function Upsert([string]$ListName,[string]$Field,[string]$Key,[hashtable]$Values){
  $listId=[guid]$ids.$ListName.id
  $all=@(Get-PnPListItem -List $listId -Fields @($Field) -PageSize 500)
  $match=@($all | Where-Object {$_.FieldValues[$Field] -eq $Key})
  if($match.Count -gt 1){throw "Duplicate key in $ListName $Field=$Key; stop and investigate."}
  if($match.Count -eq 1){
    # Read all required fields for a meaningful drift check.
    $full=Get-PnPListItem -List $listId -Id $match[0].Id -Fields @($Values.Keys)
    # Existing item is not modified automatically; drift requires explicit review.
    foreach($p in $Values.Keys){
      if([string]$full.FieldValues[$p] -ne [string]$Values[$p]){
        throw "DRIFT $ListName $Field=$Key property $p existing=$($full.FieldValues[$p]) desired=$($Values[$p]); manual review required."
      }
    }
    Write-Host "EXISTS: $ListName $Key";return
  }
  Add-PnPListItem -List $listId -Values $Values | Out-Null
  Write-Host "CREATED: $ListName $Key" -ForegroundColor Green
}
$wfCode=[string]$cfg.WorkflowCode;$ver=[int]$cfg.VersionNo
# Workflow version and steps must be created only after prerequisites have passed.
$wKey="$wfCode|$ver"
Upsert 'EMI_PAY_WorkflowVersions' 'Title' $wKey @{Title=$wKey;WorkflowCode=$wfCode;VersionNo=$ver;Lifecycle='DRAFT'}
foreach($step in $cfg.steps){
  $sKey=[string]$step.StepKey
  $title="$wKey|$sKey"
  Upsert 'EMI_PAY_WorkflowSteps' 'Title' $title @{Title=$title;WorkflowCode=$wfCode;VersionNo=$ver;StepKey=$sKey;StepOrder=[int]$step.StepOrder;StepName=[string]$step.StepName;StepKind=[string]$step.StepKind;IsActive=$true}
}
foreach($row in $routing){
  if([string]::IsNullOrWhiteSpace($row.OUCode)) {continue}
  $title="$wKey|$($row.StepKey)|$($row.OUCode)"
  Upsert 'EMI_PAY_StepRecipients' 'Title' $title @{Title=$title;WorkflowCode=$wfCode;VersionNo=$ver;StepKey=$row.StepKey;OUCode=$row.OUCode;IsDefault=$true}
}
foreach($row in $payValid){
  Upsert 'EMI_PAY_PaymentTypes' 'PaymentTypeCode' $row.PaymentTypeCode @{Title=$row.Title;PaymentTypeCode=$row.PaymentTypeCode;ChecklistVersion=[int]$row.ChecklistVersion;WorkflowCode=$row.WorkflowCode;IsActive=([string]$row.IsActive -eq 'true')}
}
foreach($row in $checklists){
  if([string]::IsNullOrWhiteSpace($row.ItemCode)){continue}
  $title="$($row.PaymentTypeCode)|$($row.VersionNo)|$($row.ItemCode)"
  Upsert 'EMI_PAY_ChecklistTemplates' 'Title' $title @{Title=$title;PaymentTypeCode=$row.PaymentTypeCode;VersionNo=[int]$row.VersionNo;ItemCode=$row.ItemCode;ItemLabel=$row.ItemLabel;IsRequired=([string]$row.IsRequired -eq 'true');MinFileCount=[int]$row.MinFileCount;DisplayOrder=[int]$row.DisplayOrder}
}
Write-Host 'CORE CONFIG SEEDED (DRAFT). Do not publish or activate Flow until actual mapping and access controls are reviewed.' -ForegroundColor Cyan
