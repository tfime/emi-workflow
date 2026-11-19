# EMI PAY Core Phase 2 — UAT Checklist gate
# Flow ON + import EMI_PAY_CORE_V1 1.0.0.7+
# 1) CREATE → assert 2 required ChecklistItems Missing
# 2) SUBMIT incomplete → Command State=Rejected (master still Draft/BPCM1)
# 3) Mark UploadedCount >= MinFileCount → SUBMIT → BPCM2_TECH / InReview
[CmdletBinding()]
param(
    [string]$SiteUrl = 'https://emicomvn.sharepoint.com/sites/cecm',
    [string]$CreatorUPN = 'admin@local',
    [int]$WaitSeconds = 90,
    [int]$PollSeconds = 5,
    [string]$GuidPath = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Import-Module PnP.PowerShell -ErrorAction Stop
$connection = Get-PnPConnection -ErrorAction Stop
$web = Get-PnPWeb -Connection $connection -Includes Url
if ($web.Url.TrimEnd('/') -ine $SiteUrl.TrimEnd('/')) {
    throw "Safety stop: connected [$($web.Url)] != expected [$SiteUrl]"
}

if ([string]::IsNullOrWhiteSpace($GuidPath)) {
    $GuidPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'config\list-guids.json'
}
$guids = Get-Content -LiteralPath $GuidPath -Raw -Encoding UTF8 | ConvertFrom-Json
$cmdList = [Guid]$guids.EMI_PAY_Commands
$reqList = [Guid]$guids.EMI_PAY_Requests
$chkList = [Guid]$guids.EMI_PAY_ChecklistItems

function New-Key([string]$Prefix) {
    return '{0}-{1:yyyyMMddHHmmss}-{2}' -f $Prefix, (Get-Date).ToUniversalTime(), ([guid]::NewGuid().ToString('N').Substring(0, 6))
}

function Get-Master([string]$Key) {
    $escaped = [System.Security.SecurityElement]::Escape($Key)
    $query = @"
<View>
  <Query>
    <Where>
      <Eq><FieldRef Name='RequestKey' /><Value Type='Text'>$escaped</Value></Eq>
    </Where>
  </Query>
  <RowLimit>2</RowLimit>
</View>
"@
    $rows = @(Get-PnPListItem -List $reqList -Query $query -Connection $connection)
    if ($rows.Count -lt 1) { return $null }
    return $rows[0]
}

function Get-Checklist([string]$Key) {
    $escaped = [System.Security.SecurityElement]::Escape($Key)
    $query = @"
<View>
  <Query>
    <Where>
      <Eq><FieldRef Name='RequestKey' /><Value Type='Text'>$escaped</Value></Eq>
    </Where>
  </Query>
  <RowLimit>50</RowLimit>
</View>
"@
    return ,@(Get-PnPListItem -List $chkList -Query $query -Connection $connection)
}

function Add-Command {
    param([string]$Type, [hashtable]$Payload, [string]$RequestKeyValue = '')
    $ck = New-Key 'CMD'
    $item = Add-PnPListItem -List $cmdList -Values @{
        Title           = "UAT6-$Type-$ck"
        CommandKey      = $ck
        CommandType     = $Type
        PayloadJson     = ($Payload | ConvertTo-Json -Compress -Depth 6)
        State           = 'Pending'
        DedupeKey       = "$Type-$ck"
        RequestKey      = $RequestKeyValue
        StepInstanceKey = ''
    } -Connection $connection
    Write-Host ("Enqueued {0} id={1}" -f $Type, $item.Id) -ForegroundColor Cyan
    return [pscustomobject]@{ Id = [int]$item.Id; CommandKey = $ck }
}

function Wait-Command {
    param(
        [int]$Id,
        [string[]]$AcceptStates = @('Succeeded')
    )
    $deadline = (Get-Date).AddSeconds([Math]::Max(15, $WaitSeconds))
    do {
        Start-Sleep -Seconds ([Math]::Max(2, $PollSeconds))
        $item = Get-PnPListItem -List $cmdList -Id $Id -Connection $connection
        $state = [string]$item.FieldValues['State']
        $err = [string]$item.FieldValues['ErrorMessage']
        Write-Host ("  wait id={0} State={1}" -f $Id, $state) -ForegroundColor DarkGray
        if ($state -in @('Succeeded', 'Rejected', 'Failed')) {
            if ($state -notin $AcceptStates) {
                throw "CMD id=$Id State=$state Err=$err"
            }
            return [pscustomobject]@{ State = $state; ErrorMessage = $err }
        }
    } while ((Get-Date) -lt $deadline)
    throw "Timeout CMD id=$Id — Flow ON? Import 1.0.0.7?"
}

function Assert-Master([string]$Key, [string]$Step, [string]$Status) {
    $m = Get-Master $Key
    if (-not $m) { throw "Master missing $Key" }
    $gotStep = [string]$m.FieldValues['CurrentStepKey']
    $gotStatus = [string]$m.FieldValues['Status']
    if ($gotStep -ne $Step -or $gotStatus -ne $Status) {
        throw "Expected $Status/$Step got $gotStatus/$gotStep"
    }
    Write-Host ("ASSERT OK Status={0} Step={1}" -f $gotStatus, $gotStep) -ForegroundColor Green
    return $m
}

Write-Host 'UAT Phase2 ChecklistGate — Flow must be ON (solution 1.0.0.7+)' -ForegroundColor Yellow

# CREATE
$c = Add-Command -Type 'CREATE_REQUEST' -Payload @{
    title = 'UAT checklist gate'; createdOUCode = 'OU_BPCM1'; creatorUPN = $CreatorUPN
    paymentTypeCode = 'SPV_PAYMENT'; amount = 250000; explanation = 'checklist-gate'
}
Wait-Command -Id $c.Id | Out-Null
$rk = "PAY-$($c.CommandKey)"
Assert-Master $rk 'BPCM1_PREPARE' 'Draft' | Out-Null

$items = Get-Checklist $rk
$required = @($items | Where-Object { [bool]$_.FieldValues['IsRequired'] })
if ($required.Count -lt 2) {
    throw "Expected >=2 required ChecklistItems, got $($required.Count)"
}
foreach ($row in $required) {
    $code = [string]$row.FieldValues['ItemCode']
    $status = [string]$row.FieldValues['ItemStatus']
    $up = [int]$row.FieldValues['UploadedCount']
    Write-Host ("  checklist {0} Status={1} UploadedCount={2}" -f $code, $status, $up) -ForegroundColor DarkGray
    if ($up -ge [int]$row.FieldValues['MinFileCount'] -and [int]$row.FieldValues['MinFileCount'] -gt 0) {
        throw "Expected incomplete checklist for $code before mark"
    }
}
Write-Host 'ASSERT OK CREATE seeded required checklist (incomplete)' -ForegroundColor Green

# SUBMIT #1 — must Reject
$s1 = Add-Command -Type 'SUBMIT' -RequestKeyValue $rk -Payload @{
    actorUPN = $CreatorUPN; expectedStepKey = 'BPCM1_PREPARE'; expectedReviewRound = 1
}
$r1 = Wait-Command -Id $s1.Id -AcceptStates @('Rejected')
if ($r1.ErrorMessage -notmatch 'checklist') {
    Write-Host ("WARN ErrorMessage unexpected: {0}" -f $r1.ErrorMessage) -ForegroundColor Yellow
}
Assert-Master $rk 'BPCM1_PREPARE' 'Draft' | Out-Null
Write-Host 'ASSERT OK SUBMIT blocked while checklist incomplete' -ForegroundColor Green

# Mark ready
foreach ($row in $required) {
    $min = [int]$row.FieldValues['MinFileCount']
    if ($min -lt 1) { $min = 1 }
    Set-PnPListItem -List $chkList -Identity $row.Id -Values @{
        UploadedCount = $min
        ItemStatus    = 'Uploaded'
    } -Connection $connection | Out-Null
    Write-Host ("  marked Id={0} {1} Uploaded" -f $row.Id, $row.FieldValues['ItemCode']) -ForegroundColor DarkGray
}

# SUBMIT #2 — must Succeed
$s2 = Add-Command -Type 'SUBMIT' -RequestKeyValue $rk -Payload @{
    actorUPN = $CreatorUPN; expectedStepKey = 'BPCM1_PREPARE'; expectedReviewRound = 1
}
Wait-Command -Id $s2.Id -AcceptStates @('Succeeded') | Out-Null
Assert-Master $rk 'BPCM2_TECH' 'InReview' | Out-Null

Write-Host ''
Write-Host 'UAT PHASE2 CHECKLIST GATE PASS' -ForegroundColor Green
Write-Host "RequestKey=$rk"
