# EMI PAY Core Phase 2 — UAT UNC gate trước CONFIRM_PAYMENT
# Flow ON + import EMI_PAY_CORE_V1 1.0.0.8+
# Chạy tới TCKT_PAY → CONFIRM thiếu UNC → Rejected → seed DocumentIndex → CONFIRM Succeeded
[CmdletBinding()]
param(
    [string]$SiteUrl = 'https://emicomvn.sharepoint.com/sites/cecm',
    [string]$CreatorUPN = 'admin@local',
    [string]$ActorUPN = 'admin@local',
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
$docList = [Guid]$guids.EMI_PAY_DocumentIndex

$passNext = [ordered]@{
    BPCM2_TECH    = 'BPCM3_PRICE'
    BPCM3_PRICE   = 'TCKT_CHECK'
    TCKT_CHECK    = 'CHAIR_APPROVE'
    CHAIR_APPROVE = 'TCKT_PAY'
}
$expectStatus = [ordered]@{
    BPCM2_TECH    = 'InReview'
    BPCM3_PRICE   = 'InReview'
    TCKT_CHECK    = 'InReview'
    CHAIR_APPROVE = 'AwaitManager'
    TCKT_PAY      = 'PendingPayment'
}

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
        Title           = "UAT7-$Type-$ck"
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

function Wait-Command {
    param([int]$Id, [string[]]$AcceptStates = @('Succeeded'))
    $deadline = (Get-Date).AddSeconds([Math]::Max(15, $WaitSeconds))
    do {
        Start-Sleep -Seconds ([Math]::Max(2, $PollSeconds))
        $item = Get-PnPListItem -List $cmdList -Id $Id -Connection $connection
        $state = [string]$item.FieldValues['State']
        $err = [string]$item.FieldValues['ErrorMessage']
        Write-Host ("  wait id={0} State={1}" -f $Id, $state) -ForegroundColor DarkGray
        if ($state -in @('Succeeded', 'Rejected', 'Failed')) {
            if ($state -notin $AcceptStates) { throw "CMD id=$Id State=$state Err=$err" }
            return [pscustomobject]@{ State = $state; ErrorMessage = $err }
        }
    } while ((Get-Date) -lt $deadline)
    throw "Timeout CMD id=$Id — Flow ON? Import 1.0.0.8?"
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

function Add-UncEvidence([string]$Key) {
    $docKey = "$Key|UNC"
    $fileUrl = "https://emicomvn.sharepoint.com/sites/cecm/EMI_PAY_DocsWorking/$Key-UNC-UAT.pdf"
    $item = Add-PnPListItem -List $docList -Values @{
        Title         = "$Key-UNC"
        RequestKey    = $Key
        DocumentKey   = $docKey
        DocClass      = 'UNC'
        Visibility    = 'Published'
        FileName      = "$Key-UNC-UAT.pdf"
        LibraryName   = 'EMI_PAY_DocsWorking'
        FileUrl       = $fileUrl
        UploadedByUPN = $ActorUPN
        UploadedAt    = (Get-Date).ToUniversalTime()
        IsCurrent     = $true
        IsArchived    = $false
    } -Connection $connection
    Write-Host ("  seeded UNC Id={0} DocumentKey={1}" -f $item.Id, $docKey) -ForegroundColor DarkGray
    return $docKey
}

Write-Host 'UAT Phase2 UncGate — Flow must be ON (solution 1.0.0.8+)' -ForegroundColor Yellow

# CREATE → checklist → SUBMIT → DECIDE×4 → TCKT_PAY
$c = Add-Command -Type 'CREATE_REQUEST' -Payload @{
    title = 'UAT UNC gate'; createdOUCode = 'OU_BPCM1'; creatorUPN = $CreatorUPN
    paymentTypeCode = 'SPV_PAYMENT'; amount = 300000; explanation = 'unc-gate'
}
Wait-Command -Id $c.Id | Out-Null
$rk = "PAY-$($c.CommandKey)"
Assert-Master $rk 'BPCM1_PREPARE' 'Draft' | Out-Null
Set-ChecklistReady $rk

$s = Add-Command -Type 'SUBMIT' -RequestKeyValue $rk -Payload @{
    actorUPN = $CreatorUPN; expectedStepKey = 'BPCM1_PREPARE'; expectedReviewRound = 1
}
Wait-Command -Id $s.Id | Out-Null
Assert-Master $rk 'BPCM2_TECH' 'InReview' | Out-Null

while ($true) {
    $m = Get-Master $rk
    $cur = [string]$m.FieldValues['CurrentStepKey']
    if ($cur -eq 'TCKT_PAY') { break }
    if (-not $passNext.Contains($cur)) { throw "Cannot advance from $cur" }
    $next = [string]$passNext[$cur]
    $sik = [string]$m.FieldValues['CurrentStepInstanceKey']
    $round = [int]$m.FieldValues['ReviewRound']
    Write-Host ("==> DECIDE PASS {0} -> {1}" -f $cur, $next) -ForegroundColor Cyan
    $payload = @{
        actorUPN = $ActorUPN; decision = 'PASS'; note = "UAT7 $cur"
        expectedStepKey = $cur; expectedStepInstanceKey = $sik; expectedReviewRound = $round
    }
    if ($cur -eq 'CHAIR_APPROVE') {
        $payload.paymentDueAt = (Get-Date).ToUniversalTime().AddDays(7).ToString('yyyy-MM-ddTHH:mm:ssZ')
    }
    $d = Add-Command -Type 'DECIDE' -RequestKeyValue $rk -StepInstanceKey $sik -Payload $payload
    Wait-Command -Id $d.Id | Out-Null
    $st = [string]$expectStatus[$next]
    Assert-Master $rk $next $st | Out-Null
}

# CONFIRM #1 — no UNC → Rejected; stay TCKT_PAY
$m = Get-Master $rk
$sik = [string]$m.FieldValues['CurrentStepInstanceKey']
$c1 = Add-Command -Type 'CONFIRM_PAYMENT' -RequestKeyValue $rk -StepInstanceKey $sik -Payload @{
    actorUPN = $ActorUPN; expectedStepKey = 'TCKT_PAY'; expectedStepInstanceKey = $sik
}
$r1 = Wait-Command -Id $c1.Id -AcceptStates @('Rejected')
if ($r1.ErrorMessage -notmatch 'UNC') {
    Write-Host ("WARN ErrorMessage unexpected: {0}" -f $r1.ErrorMessage) -ForegroundColor Yellow
}
Assert-Master $rk 'TCKT_PAY' 'PendingPayment' | Out-Null
Write-Host 'ASSERT OK CONFIRM blocked without UNC' -ForegroundColor Green

# Seed UNC + CONFIRM #2
$uncKey = Add-UncEvidence $rk
$m = Get-Master $rk
$sik = [string]$m.FieldValues['CurrentStepInstanceKey']
$c2 = Add-Command -Type 'CONFIRM_PAYMENT' -RequestKeyValue $rk -StepInstanceKey $sik -Payload @{
    actorUPN = $ActorUPN; expectedStepKey = 'TCKT_PAY'; expectedStepInstanceKey = $sik
    uncDocumentKey = $uncKey
}
Wait-Command -Id $c2.Id -AcceptStates @('Succeeded') | Out-Null
Assert-Master $rk 'SYSTEM_ARCHIVE' 'Archiving' | Out-Null

Write-Host ''
Write-Host 'UAT PHASE2 UNC GATE PASS' -ForegroundColor Green
Write-Host "RequestKey=$rk DocumentKey=$uncKey"
