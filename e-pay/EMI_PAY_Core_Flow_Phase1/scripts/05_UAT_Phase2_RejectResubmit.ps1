# EMI PAY Core Phase 2 — UAT REJECT + Resubmit
# Flow phải ON + đã import EMI_PAY_CORE_V1 1.0.0.7+ (REJECT + checklist gate).
# Luồng: CREATE → mark checklist → SUBMIT → DECIDE REJECT → Returned@BPCM1
#         → SUBMIT lại (ReviewRound+1) → BPCM2 → (tuỳ chọn) chạy tiếp happy path.
[CmdletBinding()]
param(
    [string]$SiteUrl = 'https://emicomvn.sharepoint.com/sites/cecm',
    [string]$CreatorUPN = 'admin@local',
    [string]$ActorUPN = 'admin@local',
    [int]$WaitSeconds = 90,
    [int]$PollSeconds = 5,
    [switch]$ContinueHappyPath,
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

function Add-Command {
    param([string]$Type, [hashtable]$Payload, [string]$RequestKeyValue = '', [string]$StepInstanceKey = '')
    $ck = New-Key 'CMD'
    $item = Add-PnPListItem -List $cmdList -Values @{
        Title           = "UAT2-$Type-$ck"
        CommandKey      = $ck
        CommandType     = $Type
        PayloadJson     = ($Payload | ConvertTo-Json -Compress -Depth 6)
        State           = 'Pending'
        DedupeKey       = "$Type-$ck"
        RequestKey      = $RequestKeyValue
        StepInstanceKey = $StepInstanceKey
    } -Connection $connection
    Write-Host ("Enqueued {0} id={1}" -f $Type, $item.Id) -ForegroundColor Cyan
    return [pscustomobject]@{ Id = [int]$item.Id; CommandKey = $ck }
}

function Wait-Command([int]$Id) {
    $deadline = (Get-Date).AddSeconds([Math]::Max(15, $WaitSeconds))
    do {
        Start-Sleep -Seconds ([Math]::Max(2, $PollSeconds))
        $item = Get-PnPListItem -List $cmdList -Id $Id -Connection $connection
        $state = [string]$item.FieldValues['State']
        $err = [string]$item.FieldValues['ErrorMessage']
        Write-Host ("  wait id={0} State={1}" -f $Id, $state) -ForegroundColor DarkGray
        if ($state -in @('Succeeded', 'Rejected', 'Failed')) {
            if ($state -ne 'Succeeded') { throw "CMD id=$Id State=$state Err=$err" }
            return
        }
    } while ((Get-Date) -lt $deadline)
    throw "Timeout CMD id=$Id — Flow ON? Import 1.0.0.7?"
}

function Set-ChecklistReady([string]$Key) {
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
    $rows = @(Get-PnPListItem -List $chkList -Query $query -Connection $connection)
    if ($rows.Count -lt 1) { throw "ChecklistItems missing for $Key" }
    foreach ($row in $rows) {
        if (-not [bool]$row.FieldValues['IsRequired']) { continue }
        $min = [int]$row.FieldValues['MinFileCount']
        if ($min -lt 1) { $min = 1 }
        Set-PnPListItem -List $chkList -Identity $row.Id -Values @{
            UploadedCount = $min
            ItemStatus    = 'Uploaded'
        } -Connection $connection | Out-Null
    }
}

function Assert-Master([string]$Key, [string]$Step, [string]$Status, [int]$Round = -1) {
    $m = Get-Master $Key
    if (-not $m) { throw "Master missing $Key" }
    $fv = $m.FieldValues
    $gotStep = [string]$fv['CurrentStepKey']
    $gotStatus = [string]$fv['Status']
    $gotRound = [int]$fv['ReviewRound']
    if ($gotStep -ne $Step -or $gotStatus -ne $Status) {
        throw "Expected $Status/$Step round=? got $gotStatus/$gotStep round=$gotRound"
    }
    if ($Round -ge 0 -and $gotRound -ne $Round) {
        throw "Expected ReviewRound=$Round got $gotRound"
    }
    Write-Host ("ASSERT OK Status={0} Step={1} Round={2}" -f $gotStatus, $gotStep, $gotRound) -ForegroundColor Green
    return $m
}

Write-Host 'UAT Phase2 Reject+Resubmit — Flow must be ON (solution 1.0.0.7+)' -ForegroundColor Yellow

# CREATE
$c = Add-Command -Type 'CREATE_REQUEST' -Payload @{
    title = 'UAT Phase2 reject'; createdOUCode = 'OU_BPCM1'; creatorUPN = $CreatorUPN
    paymentTypeCode = 'SPV_PAYMENT'; amount = 500000; explanation = 'reject-resubmit'
}
Wait-Command $c.Id
$rk = "PAY-$($c.CommandKey)"
Assert-Master $rk 'BPCM1_PREPARE' 'Draft' 1 | Out-Null
Set-ChecklistReady $rk

# SUBMIT #1
$m = Get-Master $rk
$s = Add-Command -Type 'SUBMIT' -RequestKeyValue $rk -Payload @{
    actorUPN = $CreatorUPN; expectedStepKey = 'BPCM1_PREPARE'; expectedReviewRound = 1
}
Wait-Command $s.Id
Assert-Master $rk 'BPCM2_TECH' 'InReview' 1 | Out-Null

# Optional PASS once to BPCM3 then reject from BPCM3 — or reject at BPCM2
# Reject at BPCM2 (simplest)
$m = Get-Master $rk
$rej = Add-Command -Type 'DECIDE' -RequestKeyValue $rk -StepInstanceKey ([string]$m.FieldValues['CurrentStepInstanceKey']) -Payload @{
    actorUPN = $ActorUPN
    decision = 'REJECT'
    reason   = 'UAT thieu chung tu'
    note     = 'UAT reject'
    expectedStepKey = 'BPCM2_TECH'
    expectedStepInstanceKey = [string]$m.FieldValues['CurrentStepInstanceKey']
    expectedReviewRound = 1
}
Wait-Command $rej.Id
Assert-Master $rk 'BPCM1_PREPARE' 'Returned' 1 | Out-Null   # round unchanged on reject

# SUBMIT #2 — ReviewRound must become 2, go BPCM2
$m = Get-Master $rk
$s2 = Add-Command -Type 'SUBMIT' -RequestKeyValue $rk -Payload @{
    actorUPN = $CreatorUPN; expectedStepKey = 'BPCM1_PREPARE'; expectedReviewRound = 1
}
Wait-Command $s2.Id
Assert-Master $rk 'BPCM2_TECH' 'InReview' 2 | Out-Null

Write-Host ''
Write-Host 'UAT PHASE2 REJECT+RESUBMIT PASS' -ForegroundColor Green
Write-Host "RequestKey=$rk ReviewRound=2 at BPCM2_TECH"

if ($ContinueHappyPath) {
    Write-Host 'ContinueHappyPath: goi 04_UAT_Phase1_HappyPath.ps1 -Mode Resume ...' -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot '04_UAT_Phase1_HappyPath.ps1') -Mode Resume -RequestKey $rk -WaitSeconds $WaitSeconds -CreatorUPN $CreatorUPN -ActorUPN $ActorUPN
}
