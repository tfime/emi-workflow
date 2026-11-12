# EMI PAY Core Phase 1 — UAT Happy Path (auto wait giữa các lệnh)
# Yêu cầu:
#   1) Connect-PnPOnline tới https://emicomvn.sharepoint.com/sites/cecm
#   2) Cloud Flow EMI_PAY_CORE_Orchestrator_V1 đang ON
#
# Ví dụ:
#   .\04_UAT_Phase1_HappyPath.ps1
#   .\04_UAT_Phase1_HappyPath.ps1 -RequestKey 'PAY-CMD-...' -Mode Resume
#   .\04_UAT_Phase1_HappyPath.ps1 -WaitSeconds 90
[CmdletBinding()]
param(
    [string]$SiteUrl = 'https://emicomvn.sharepoint.com/sites/cecm',
    [ValidateSet('Full', 'Resume')]
    [string]$Mode = 'Full',
    [string]$RequestKey = '',
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
    $localGuids = Join-Path (Split-Path $PSScriptRoot -Parent) 'config\list-guids.json'
    if (-not (Test-Path -LiteralPath $localGuids)) { throw "list-guids.json not found: $localGuids" }
    $GuidPath = $localGuids
}
$guids = Get-Content -LiteralPath $GuidPath -Raw -Encoding UTF8 | ConvertFrom-Json
$cmdList = [Guid]$guids.EMI_PAY_Commands
$reqList = [Guid]$guids.EMI_PAY_Requests
$wiList  = [Guid]$guids.EMI_PAY_WorkItems
$chkList = [Guid]$guids.EMI_PAY_ChecklistItems
$docList = [Guid]$guids.EMI_PAY_DocumentIndex

$passNext = [ordered]@{
    BPCM2_TECH    = 'BPCM3_PRICE'
    BPCM3_PRICE   = 'TCKT_CHECK'
    TCKT_CHECK    = 'CHAIR_APPROVE'
    CHAIR_APPROVE = 'TCKT_PAY'
}
$expectStatus = [ordered]@{
    BPCM1_PREPARE  = 'Draft'
    BPCM2_TECH     = 'InReview'
    BPCM3_PRICE    = 'InReview'
    TCKT_CHECK     = 'InReview'
    CHAIR_APPROVE  = 'AwaitManager'
    TCKT_PAY       = 'PendingPayment'
    SYSTEM_ARCHIVE = 'Archiving'
}

function Write-Step([string]$Msg, [string]$Color = 'Cyan') {
    Write-Host ""
    Write-Host ("==> {0}" -f $Msg) -ForegroundColor $Color
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

function Get-WorkItems([string]$Key) {
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
    return ,@(Get-PnPListItem -List $wiList -Query $query -Connection $connection | Sort-Object Id)
}

function Show-Master([string]$Key) {
    $m = Get-Master $Key
    if (-not $m) {
        Write-Host "Master missing: $Key" -ForegroundColor Red
        return $null
    }
    $fv = $m.FieldValues
    Write-Host ("Master Status={0} Step={1} OU={2} PaidAt={3} Archive={4}" -f `
        $fv['Status'], $fv['CurrentStepKey'], $fv['CurrentOUCode'], $fv['PaidAt'], $fv['ArchiveStatus']) -ForegroundColor Green
    $wis = Get-WorkItems $Key
    foreach ($w in $wis) {
        $f = $w.FieldValues
        Write-Host ("  WI Id={0} Step={1} State={2} Decision={3}" -f $w.Id, $f['StepKey'], $f['State'], $f['Decision'])
    }
    return $m
}

function Add-Command {
    param(
        [string]$Type,
        [hashtable]$Payload,
        [string]$RequestKeyValue = '',
        [string]$StepInstanceKey = ''
    )
    $ck = New-Key 'CMD'
    $values = @{
        Title           = "UAT-$Type-$ck"
        CommandKey      = $ck
        CommandType     = $Type
        PayloadJson     = ($Payload | ConvertTo-Json -Compress -Depth 6)
        State           = 'Pending'
        DedupeKey       = "$Type-$ck"
        RequestKey      = $RequestKeyValue
        StepInstanceKey = $StepInstanceKey
    }
    $item = Add-PnPListItem -List $cmdList -Values $values -Connection $connection
    Write-Host ("Enqueued {0} id={1} CommandKey={2}" -f $Type, $item.Id, $ck) -ForegroundColor Cyan
    return [pscustomobject]@{ Id = [int]$item.Id; CommandKey = $ck; RequestKey = $RequestKeyValue; CommandType = $Type }
}

function Wait-Command {
    param(
        [int]$Id,
        [int]$Seconds = $WaitSeconds,
        [string[]]$AcceptStates = @('Succeeded')
    )
    $deadline = (Get-Date).AddSeconds([Math]::Max(15, $Seconds))
    do {
        Start-Sleep -Seconds ([Math]::Max(2, $PollSeconds))
        $item = Get-PnPListItem -List $cmdList -Id $Id -Connection $connection
        $state = [string]$item.FieldValues['State']
        $err = [string]$item.FieldValues['ErrorMessage']
        Write-Host ("  wait CMD id={0} State={1}" -f $Id, $state) -ForegroundColor DarkGray
        if ($state -in @('Succeeded', 'Rejected', 'Failed')) {
            if ($state -notin $AcceptStates) {
                throw ("Command id={0} ended State={1} Err={2}" -f $Id, $state, $err)
            }
            return $state
        }
    } while ((Get-Date) -lt $deadline)
    throw ("Timeout waiting CMD id={0} after {1}s (Flow ON? trigger bat item moi?)" -f $Id, $Seconds)
}

function Assert-Master {
    param(
        [string]$Key,
        [string]$ExpectStep,
        [string]$ExpectStatus = ''
    )
    $m = Get-Master $Key
    if (-not $m) { throw "Master not found: $Key" }
    $step = [string]$m.FieldValues['CurrentStepKey']
    $status = [string]$m.FieldValues['Status']
    if ($step -ne $ExpectStep) {
        throw ("Expected Step={0} but got {1} (Status={2})" -f $ExpectStep, $step, $status)
    }
    if ($ExpectStatus -and $status -ne $ExpectStatus) {
        throw ("Expected Status={0} but got {1} (Step={2})" -f $ExpectStatus, $status, $step)
    }
    Write-Host ("ASSERT OK Step={0} Status={1}" -f $step, $status) -ForegroundColor Green
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
    if ($rows.Count -lt 1) {
        throw "ChecklistItems missing for $Key (expect CREATE 1.0.0.7+)"
    }
    foreach ($row in $rows) {
        $required = [bool]$row.FieldValues['IsRequired']
        if (-not $required) { continue }
        $min = [int]$row.FieldValues['MinFileCount']
        if ($min -lt 1) { $min = 1 }
        Set-PnPListItem -List $chkList -Identity $row.Id -Values @{
            UploadedCount = $min
            ItemStatus    = 'Uploaded'
        } -Connection $connection | Out-Null
        Write-Host ("  checklist Id={0} {1} -> UploadedCount={2}" -f $row.Id, $row.FieldValues['ItemCode'], $min) -ForegroundColor DarkGray
    }
}

function Add-UncEvidence([string]$Key) {
    $docKey = "$Key|UNC"
    $escaped = [System.Security.SecurityElement]::Escape($docKey)
    $query = @"
<View>
  <Query>
    <Where>
      <Eq><FieldRef Name='DocumentKey' /><Value Type='Text'>$escaped</Value></Eq>
    </Where>
  </Query>
  <RowLimit>1</RowLimit>
</View>
"@
    $existing = @(Get-PnPListItem -List $docList -Query $query -Connection $connection)
    $fileUrl = "https://emicomvn.sharepoint.com/sites/cecm/EMI_PAY_DocsWorking/$Key-UNC-UAT.pdf"
    $values = @{
        Title          = "$Key-UNC"
        RequestKey     = $Key
        DocumentKey    = $docKey
        DocClass       = 'UNC'
        Visibility     = 'Published'
        FileName       = "$Key-UNC-UAT.pdf"
        LibraryName    = 'EMI_PAY_DocsWorking'
        FileUrl        = $fileUrl
        UploadedByUPN  = $ActorUPN
        UploadedAt     = (Get-Date).ToUniversalTime()
        IsCurrent      = $true
        IsArchived     = $false
    }
    if ($existing.Count -gt 0) {
        Set-PnPListItem -List $docList -Identity $existing[0].Id -Values $values -Connection $connection | Out-Null
        Write-Host ("  UNC DocumentIndex updated Id={0} DocumentKey={1}" -f $existing[0].Id, $docKey) -ForegroundColor DarkGray
    }
    else {
        $item = Add-PnPListItem -List $docList -Values $values -Connection $connection
        Write-Host ("  UNC DocumentIndex created Id={0} DocumentKey={1}" -f $item.Id, $docKey) -ForegroundColor DarkGray
    }
    return $docKey
}

function Ensure-PaymentDueAtField {
    $field = Get-PnPField -List $reqList -Identity 'PaymentDueAt' -ErrorAction SilentlyContinue -Connection $connection
    if (-not $field) {
        Add-PnPField -List $reqList -InternalName 'PaymentDueAt' -DisplayName 'Thời hạn thanh toán' -Type DateTime -Group 'EMI PAY' -Connection $connection | Out-Null
        Write-Host '  ADDED Requests.PaymentDueAt' -ForegroundColor Yellow
    }
}

function Invoke-DecidePass([string]$Key) {
    $m = Get-Master $Key
    if (-not $m) { throw "Master missing: $Key" }
    $cur = [string]$m.FieldValues['CurrentStepKey']
    if (-not $passNext.Contains($cur)) {
        throw "DecidePass not valid at Step=$cur"
    }
    $expectedNext = [string]$passNext[$cur]
    $sik = [string]$m.FieldValues['CurrentStepInstanceKey']
    $round = [int]$m.FieldValues['ReviewRound']
    Write-Step ("DECIDE PASS {0} -> {1}" -f $cur, $expectedNext)
    $payload = @{
        actorUPN                = $ActorUPN
        decision                = 'PASS'
        note                    = "UAT pass $cur"
        expectedStepKey         = $cur
        expectedStepInstanceKey = $sik
        expectedReviewRound     = $round
    }
    if ($cur -eq 'CHAIR_APPROVE') {
        Ensure-PaymentDueAtField
        $payload.paymentDueAt = (Get-Date).ToUniversalTime().AddDays(7).ToString('yyyy-MM-ddTHH:mm:ssZ')
    }
    $cmd = Add-Command -Type 'DECIDE' -RequestKeyValue $Key -StepInstanceKey $sik -Payload $payload
    Wait-Command -Id $cmd.Id | Out-Null
    $expectSt = if ($expectStatus.Contains($expectedNext)) { [string]$expectStatus[$expectedNext] } else { '' }
    Assert-Master -Key $Key -ExpectStep $expectedNext -ExpectStatus $expectSt | Out-Null
    if ($cur -eq 'CHAIR_APPROVE') {
        $after = Get-Master $Key
        $due = $after.FieldValues['PaymentDueAt']
        if ($null -eq $due -or [string]$due -eq '') { throw 'PaymentDueAt empty after CHAIR PASS' }
        Write-Host ("ASSERT OK PaymentDueAt={0}" -f $due) -ForegroundColor Green
    }
}

# ---------------- main ----------------
Write-Host "UAT Phase1 Mode=$Mode WaitSeconds=$WaitSeconds" -ForegroundColor Yellow
Write-Host "Dam bao Flow EMI_PAY_CORE_Orchestrator_V1 dang ON truoc khi tiep tuc." -ForegroundColor Yellow

if ($Mode -eq 'Full') {
    Write-Step 'CREATE_REQUEST'
    $created = Add-Command -Type 'CREATE_REQUEST' -Payload @{
        title           = 'UAT Phase1 happy path'
        createdOUCode   = 'OU_BPCM1'
        creatorUPN      = $CreatorUPN
        paymentTypeCode = 'SPV_PAYMENT'
        amount          = 1000000
        explanation     = 'UAT auto happy path'
    }
    Wait-Command -Id $created.Id | Out-Null
    $RequestKey = "PAY-$($created.CommandKey)"
    Assert-Master -Key $RequestKey -ExpectStep 'BPCM1_PREPARE' -ExpectStatus 'Draft' | Out-Null
    Show-Master $RequestKey | Out-Null

    Write-Step 'Mark checklist Uploaded (required)'
    Set-ChecklistReady -Key $RequestKey

    Write-Step 'SUBMIT'
    $sub = Add-Command -Type 'SUBMIT' -RequestKeyValue $RequestKey -Payload @{
        actorUPN            = $CreatorUPN
        expectedStepKey     = 'BPCM1_PREPARE'
        expectedReviewRound = 1
    }
    Wait-Command -Id $sub.Id | Out-Null
    Assert-Master -Key $RequestKey -ExpectStep 'BPCM2_TECH' -ExpectStatus 'InReview' | Out-Null
}
else {
    if ([string]::IsNullOrWhiteSpace($RequestKey)) {
        throw 'Resume mode requires -RequestKey'
    }
    Write-Step ("RESUME RequestKey={0}" -f $RequestKey)
    $m = Show-Master $RequestKey
    if (-not $m) { throw "Cannot resume; master not found" }
}

$m = Get-Master $RequestKey
$step = [string]$m.FieldValues['CurrentStepKey']
$status = [string]$m.FieldValues['Status']

# From BPCM1 after CREATE-only resume
if ($step -eq 'BPCM1_PREPARE' -and $status -in @('Draft', 'Returned')) {
    Write-Step 'Mark checklist Uploaded (required)'
    Set-ChecklistReady -Key $RequestKey
    Write-Step 'SUBMIT (resume)'
    $sub = Add-Command -Type 'SUBMIT' -RequestKeyValue $RequestKey -Payload @{
        actorUPN            = $CreatorUPN
        expectedStepKey     = 'BPCM1_PREPARE'
        expectedReviewRound = [int]$m.FieldValues['ReviewRound']
    }
    Wait-Command -Id $sub.Id | Out-Null
    Assert-Master -Key $RequestKey -ExpectStep 'BPCM2_TECH' -ExpectStatus 'InReview' | Out-Null
}

# DECIDE until TCKT_PAY
while ($true) {
    $m = Get-Master $RequestKey
    $step = [string]$m.FieldValues['CurrentStepKey']
    if ($step -eq 'TCKT_PAY' -or $step -eq 'SYSTEM_ARCHIVE') { break }
    if (-not $passNext.Contains($step)) {
        throw "Cannot continue from Step=$step"
    }
    Invoke-DecidePass -Key $RequestKey
}

$m = Get-Master $RequestKey
$step = [string]$m.FieldValues['CurrentStepKey']
if ($step -eq 'TCKT_PAY') {
    Write-Step 'Seed UNC DocumentIndex (TCKT evidence)'
    $uncKey = Add-UncEvidence -Key $RequestKey
    Write-Step 'CONFIRM_PAYMENT'
    $sik = [string]$m.FieldValues['CurrentStepInstanceKey']
    $conf = Add-Command -Type 'CONFIRM_PAYMENT' -RequestKeyValue $RequestKey -StepInstanceKey $sik -Payload @{
        actorUPN                = $ActorUPN
        expectedStepKey         = 'TCKT_PAY'
        expectedStepInstanceKey = $sik
        uncDocumentKey          = $uncKey
    }
    Wait-Command -Id $conf.Id | Out-Null
    Assert-Master -Key $RequestKey -ExpectStep 'SYSTEM_ARCHIVE' -ExpectStatus 'Archiving' | Out-Null
}

Write-Step 'FINAL STATE' 'Green'
Show-Master $RequestKey | Out-Null
$final = Get-Master $RequestKey
$fv = $final.FieldValues
if ([string]$fv['CurrentStepKey'] -ne 'SYSTEM_ARCHIVE' -or [string]$fv['Status'] -ne 'Archiving') {
    throw 'UAT FAILED: expected SYSTEM_ARCHIVE / Archiving'
}
if ($null -eq $fv['PaidAt'] -or [string]$fv['PaidAt'] -eq '') {
    throw 'UAT FAILED: PaidAt empty'
}

Write-Host ""
Write-Host "UAT PHASE1 HAPPY PATH PASS" -ForegroundColor Green
Write-Host "RequestKey=$RequestKey"
Write-Host "PaidAt=$($fv['PaidAt']) ArchiveStatus=$($fv['ArchiveStatus'])"
