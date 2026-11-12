# EMI PAY Core 1.0.0.12 — UAT CHAIR hai bước: duyệt hồ sơ rồi duyệt thanh toán
# Flow ON + import EMI_PAY_CORE_V1 1.0.0.12+
# Tới CHAIR → PASS+due (chưa dossier) Rejected → PASS không due giữ CHAIR → PASS+due → TCKT_PAY
[CmdletBinding()]
param(
    [string]$SiteUrl = 'https://emicomvn.sharepoint.com/sites/cecm',
    [string]$CreatorUPN = 'admin@local',
    [string]$ActorUPN = 'admin@local',
    [int]$WaitSeconds = 90,
    [int]$PollSeconds = 5,
    [string]$GuidPath = '',
    [string]$OrchestratorUrl = '',
    [string]$FlowAccessToken = '',
    [string]$ClientId = '5c1a7c4d-3b40-4938-821d-12f44ee316e5'
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
$wiList  = [Guid]$guids.EMI_PAY_WorkItems

$passNext = [ordered]@{
    BPCM2_TECH  = 'BPCM3_PRICE'
    BPCM3_PRICE = 'TCKT_CHECK'
    TCKT_CHECK  = 'CHAIR_APPROVE'
}
$expectStatus = [ordered]@{
    BPCM2_TECH    = 'InReview'
    BPCM3_PRICE   = 'InReview'
    TCKT_CHECK    = 'InReview'
    CHAIR_APPROVE = 'AwaitManager'
    TCKT_PAY      = 'PendingPayment'
}

# --- orchestrator kick (same pattern as 04/09; optional) ---
$OrchestratorUrl = ($OrchestratorUrl -as [string]).Trim()
$script:FlowBearer = $null
$script:MsalApp = $null

function Get-PropValue($Obj, [string]$Name) {
    if ($null -eq $Obj) { return $null }
    $prop = $Obj.PSObject.Properties[$Name]
    if ($null -eq $prop) { return $null }
    return $prop.Value
}

function ConvertFrom-JwtPayload([string]$Jwt) {
    $jwt = ($Jwt -as [string]).Trim().Trim('"')
    $parts = $jwt -split '\.'
    if ($parts.Count -lt 2) { throw "JWT không đủ phần" }
    $part = $parts[1].Replace('-', '+').Replace('_', '/')
    switch ($part.Length % 4) { 1 { $part += '===' }; 2 { $part += '==' }; 3 { $part += '=' } }
    return ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($part)) | ConvertFrom-Json)
}

function Get-TenantIdForFlow {
    try {
        $sp = Get-PnPAccessToken -Connection $connection -ErrorAction Stop
        if ($sp -isnot [string] -and $sp.PSObject.Properties['RawData']) { $sp = [string]$sp.RawData }
        $p = ConvertFrom-JwtPayload -Jwt ([string]$sp)
        if ($p.tid) { return [string]$p.tid }
    }
    catch { }
    return 'organizations'
}

function Ensure-MsalApp {
    if ($null -ne $script:MsalApp) { return $script:MsalApp }
    $msalDll = Join-Path (Get-Module PnP.PowerShell).ModuleBase 'Common/Microsoft.Identity.Client.dll'
    if (-not (Test-Path -LiteralPath $msalDll)) { throw "Không thấy MSAL tại $msalDll" }
    Add-Type -Path $msalDll | Out-Null
    $tid = Get-TenantIdForFlow
    $script:MsalApp = [Microsoft.Identity.Client.PublicClientApplicationBuilder]::Create($ClientId).
        WithAuthority([Microsoft.Identity.Client.AzureCloudInstance]::AzurePublic, $tid).
        WithRedirectUri('http://localhost').
        Build()
    return $script:MsalApp
}

function Get-TokenForScopes([string[]]$Scopes, [string]$Label) {
    if ($Label -eq 'PnP-PowerAutomate') {
        try {
            $tokenObj = Get-PnPAccessToken -ResourceTypeName PowerAutomate -Connection $connection -ErrorAction Stop
            if ($tokenObj -is [string]) { return $tokenObj }
            if ($null -ne $tokenObj -and $tokenObj.PSObject.Properties['RawData']) { return [string]$tokenObj.RawData }
            return [string]$tokenObj
        }
        catch { return $null }
    }
    $app = Ensure-MsalApp
    try {
        $accounts = $app.GetAccountsAsync().GetAwaiter().GetResult()
        $acct = $null
        foreach ($a in $accounts) { $acct = $a; break }
        if ($null -ne $acct) {
            $silent = $app.AcquireTokenSilent($Scopes, $acct).ExecuteAsync().GetAwaiter().GetResult()
            if ($silent -and $silent.AccessToken) { return [string]$silent.AccessToken }
        }
    }
    catch { }
    Write-Host ("  MSAL interactive ({0})" -f $Label) -ForegroundColor Yellow
    $result = $app.AcquireTokenInteractive($Scopes).ExecuteAsync().GetAwaiter().GetResult()
    return [string]$result.AccessToken
}

function Test-OrchestratorFailed($Resp) {
    $v = Get-PropValue -Obj $Resp -Name '__error'
    return ($null -ne $v -and [bool]$v)
}

function Invoke-Orchestrator([int]$CommandId) {
    if ([string]::IsNullOrWhiteSpace($OrchestratorUrl)) { return }
    if (-not [string]::IsNullOrWhiteSpace($FlowAccessToken)) { $script:FlowBearer = $FlowAccessToken.Trim() }
    $tryPost = {
        param($Bearer)
        try {
            return Invoke-RestMethod -Method Post -Uri $OrchestratorUrl -Headers @{
                Authorization = "Bearer $Bearer"; Accept = 'application/json'
            } -ContentType 'application/json' -Body ((@{ commandId = $CommandId } | ConvertTo-Json -Compress))
        }
        catch {
            $body = $null
            try { $body = $_.ErrorDetails.Message } catch { }
            return [pscustomobject]@{ __error = $true; Message = $_.Exception.Message; Body = $body }
        }
    }
    if (-not [string]::IsNullOrWhiteSpace($script:FlowBearer)) {
        $resp = & $tryPost $script:FlowBearer
        if (-not (Test-OrchestratorFailed -Resp $resp)) { return $resp }
        $script:FlowBearer = $null
    }
    foreach ($c in @(
        [pscustomobject]@{ Label = 'PnP-PowerAutomate'; Scopes = @() }
        [pscustomobject]@{ Label = 'Flow-slash-default'; Scopes = @('https://service.flow.microsoft.com//.default') }
    )) {
        $token = Get-TokenForScopes -Scopes ([string[]]$c.Scopes) -Label $c.Label
        if ([string]::IsNullOrWhiteSpace($token)) { continue }
        $resp = & $tryPost $token
        if (-not (Test-OrchestratorFailed -Resp $resp)) {
            $script:FlowBearer = $token
            Write-Host ("  POST orchestrator OK via {0}" -f $c.Label) -ForegroundColor Green
            return $resp
        }
    }
    throw 'Orchestrator auth thất bại — truyền -OrchestratorUrl + login hoặc -FlowAccessToken'
}

function New-Key([string]$Prefix) {
    return '{0}-{1:yyyyMMddHHmmss}-{2}' -f $Prefix, (Get-Date).ToUniversalTime(), ([guid]::NewGuid().ToString('N').Substring(0, 6))
}

function Get-Master([string]$Key) {
    $escaped = [System.Security.SecurityElement]::Escape($Key)
    $query = "<View><Query><Where><Eq><FieldRef Name='RequestKey' /><Value Type='Text'>$escaped</Value></Eq></Where></Query><RowLimit>2</RowLimit></View>"
    $rows = @(Get-PnPListItem -List $reqList -Query $query -Connection $connection)
    if ($rows.Count -lt 1) { return $null }
    return $rows[0]
}

function Ensure-PaymentDueAtField {
    $field = Get-PnPField -List $reqList -Identity 'PaymentDueAt' -ErrorAction SilentlyContinue -Connection $connection
    if (-not $field) {
        Add-PnPField -List $reqList -InternalName 'PaymentDueAt' -DisplayName 'Thời hạn thanh toán' -Type DateTime -Group 'EMI PAY' -Connection $connection | Out-Null
        Write-Host 'ADDED Requests.PaymentDueAt' -ForegroundColor Yellow
    }
}

function Add-Command {
    param([string]$Type, [hashtable]$Payload, [string]$RequestKeyValue = '', [string]$StepInstanceKey = '')
    $ck = New-Key 'CMD'
    $item = Add-PnPListItem -List $cmdList -Values @{
        Title           = "UAT8-$Type-$ck"
        CommandKey      = $ck
        CommandType     = $Type
        PayloadJson     = ($Payload | ConvertTo-Json -Compress -Depth 6)
        State           = 'Pending'
        DedupeKey       = "$Type-$ck"
        RequestKey      = $RequestKeyValue
        StepInstanceKey = $StepInstanceKey
    } -Connection $connection
    Write-Host ("Enqueued {0} id={1}" -f $Type, $item.Id) -ForegroundColor Cyan
    Invoke-Orchestrator -CommandId ([int]$item.Id) | Out-Null
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
    throw "Timeout CMD id=$Id — Flow ON? Import 1.0.0.12?"
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
    $query = "<View><Query><Where><Eq><FieldRef Name='RequestKey' /><Value Type='Text'>$escaped</Value></Eq></Where></Query><RowLimit>50</RowLimit></View>"
    $rows = @(Get-PnPListItem -List $chkList -Query $query -Connection $connection)
    if ($rows.Count -lt 1) { throw "ChecklistItems missing for $Key" }
    foreach ($row in $rows) {
        if (-not [bool]$row.FieldValues['IsRequired']) { continue }
        $min = [int]$row.FieldValues['MinFileCount']
        if ($min -lt 1) { $min = 1 }
        Set-PnPListItem -List $chkList -Identity $row.Id -Values @{
            UploadedCount = $min
            ItemStatus    = 'Pass'
            IsLocked      = $true
        } -Connection $connection | Out-Null
    }
}

function Invoke-Accept([string]$Key) {
    $m = Get-Master $Key
    $sik = [string]$m.FieldValues['CurrentStepInstanceKey']
    $round = [int]$m.FieldValues['ReviewRound']
    $step = [string]$m.FieldValues['CurrentStepKey']
    $due = (Get-Date).ToUniversalTime().AddDays(3).ToString('yyyy-MM-ddTHH:mm:ssZ')
    $c = Add-Command -Type 'ACCEPT' -RequestKeyValue $Key -StepInstanceKey $sik -Payload @{
        actorUPN = $ActorUPN; dueAt = $due
        expectedStepKey = $step; expectedStepInstanceKey = $sik; expectedReviewRound = $round
    }
    Wait-Command -Id $c.Id | Out-Null
}

Write-Host 'UAT Phase2 ChairPaymentDueAt 1.0.0.12 — Flow must be ON' -ForegroundColor Yellow
Ensure-PaymentDueAtField

$c = Add-Command -Type 'CREATE_REQUEST' -Payload @{
    title = 'UAT chair due'; createdOUCode = 'OU_BPCM1'; creatorUPN = $CreatorUPN
    paymentTypeCode = 'SPV_PAYMENT'; amount = 400000; explanation = 'chair-due-1.0.0.12'
}
Wait-Command -Id $c.Id | Out-Null
$rk = "PAY-$($c.CommandKey)"
Assert-Master $rk 'BPCM1_PREPARE' 'Draft' | Out-Null
Set-ChecklistReady $rk

$s = Add-Command -Type 'SUBMIT' -RequestKeyValue $rk -Payload @{
    actorUPN = $CreatorUPN; expectedStepKey = 'BPCM1_PREPARE'; expectedReviewRound = 1
}
Wait-Command -Id $s.Id | Out-Null
Assert-Master $rk 'BPCM1_PREPARE' 'AwaitingManager' | Out-Null

$m = Get-Master $rk
$sik = [string]$m.FieldValues['CurrentStepInstanceKey']
$round = [int]$m.FieldValues['ReviewRound']
$tp = Add-Command -Type 'DECIDE' -RequestKeyValue $rk -StepInstanceKey $sik -Payload @{
    actorUPN = $ActorUPN; decision = 'PASS'; note = 'TP'
    expectedStepKey = 'BPCM1_PREPARE'; expectedStepInstanceKey = $sik; expectedReviewRound = $round
}
Wait-Command -Id $tp.Id | Out-Null
Assert-Master $rk 'BPCM2_TECH' 'InReview' | Out-Null

while ($true) {
    $m = Get-Master $rk
    $cur = [string]$m.FieldValues['CurrentStepKey']
    if ($cur -eq 'CHAIR_APPROVE') { break }
    if (-not $passNext.Contains($cur)) { throw "Cannot advance from $cur" }
    $next = [string]$passNext[$cur]
    Invoke-Accept -Key $rk
    $m = Get-Master $rk
    $sik = [string]$m.FieldValues['CurrentStepInstanceKey']
    $round = [int]$m.FieldValues['ReviewRound']
    Write-Host ("==> DECIDE PASS {0} -> {1}" -f $cur, $next) -ForegroundColor Cyan
    $d = Add-Command -Type 'DECIDE' -RequestKeyValue $rk -StepInstanceKey $sik -Payload @{
        actorUPN = $ActorUPN; decision = 'PASS'; note = "UAT8 $cur"
        expectedStepKey = $cur; expectedStepInstanceKey = $sik; expectedReviewRound = $round
    }
    Wait-Command -Id $d.Id | Out-Null
    Assert-Master $rk $next ([string]$expectStatus[$next]) | Out-Null
}

# CHAIR PASS + paymentDueAt trước khi duyệt hồ sơ → Rejected
$m = Get-Master $rk
$sik = [string]$m.FieldValues['CurrentStepInstanceKey']
$round = [int]$m.FieldValues['ReviewRound']
$due = (Get-Date).ToUniversalTime().AddDays(10).ToString('yyyy-MM-ddTHH:mm:ssZ')
$bad = Add-Command -Type 'DECIDE' -RequestKeyValue $rk -StepInstanceKey $sik -Payload @{
    actorUPN = $ActorUPN; decision = 'PASS'; note = 'due before dossier'; paymentDueAt = $due
    expectedStepKey = 'CHAIR_APPROVE'; expectedStepInstanceKey = $sik; expectedReviewRound = $round
}
$rBad = Wait-Command -Id $bad.Id -AcceptStates @('Rejected')
if ($rBad.ErrorMessage -notmatch 'dossier approve required') {
    Write-Host ("WARN ErrorMessage unexpected: {0}" -f $rBad.ErrorMessage) -ForegroundColor Yellow
}
Assert-Master $rk 'CHAIR_APPROVE' 'AwaitManager' | Out-Null
Write-Host 'ASSERT OK CHAIR PASS+due blocked before dossier approve' -ForegroundColor Green

# CHAIR PASS không due → giữ CHAIR
$m = Get-Master $rk
$sik = [string]$m.FieldValues['CurrentStepInstanceKey']
$round = [int]$m.FieldValues['ReviewRound']
$dossier = Add-Command -Type 'DECIDE' -RequestKeyValue $rk -StepInstanceKey $sik -Payload @{
    actorUPN = $ActorUPN; decision = 'PASS'; note = 'dossier only'
    expectedStepKey = 'CHAIR_APPROVE'; expectedStepInstanceKey = $sik; expectedReviewRound = $round
}
Wait-Command -Id $dossier.Id -AcceptStates @('Succeeded') | Out-Null
Assert-Master $rk 'CHAIR_APPROVE' 'AwaitManager' | Out-Null
$mid = Get-Master $rk
if ($null -ne $mid.FieldValues['PaymentDueAt'] -and [string]$mid.FieldValues['PaymentDueAt'] -ne '') {
    throw 'PaymentDueAt must be empty after dossier approve'
}
$escaped = [System.Security.SecurityElement]::Escape($rk)
$wiQ = "<View><Query><Where><And><Eq><FieldRef Name='RequestKey' /><Value Type='Text'>$escaped</Value></Eq><Eq><FieldRef Name='StepKey' /><Value Type='Text'>CHAIR_APPROVE</Value></Eq></And></Where></Query><RowLimit>20</RowLimit></View>"
$chairWis = @(Get-PnPListItem -List $wiList -Query $wiQ -Connection $connection)
$approved = @($chairWis | Where-Object { [string]$_.FieldValues['Decision'] -eq 'Approved' })
if ($approved.Count -lt 1) { throw 'Expected Completed/Approved CHAIR WI after dossier' }
Write-Host 'ASSERT OK CHAIR dossier approved (stay CHAIR, PaymentDueAt empty)' -ForegroundColor Green

# CHAIR PASS + due → TCKT_PAY
$m = Get-Master $rk
$sik = [string]$m.FieldValues['CurrentStepInstanceKey']
$round = [int]$m.FieldValues['ReviewRound']
$ok = Add-Command -Type 'DECIDE' -RequestKeyValue $rk -StepInstanceKey $sik -Payload @{
    actorUPN = $ActorUPN; decision = 'PASS'; note = 'with due'; paymentDueAt = $due
    expectedStepKey = 'CHAIR_APPROVE'; expectedStepInstanceKey = $sik; expectedReviewRound = $round
}
Wait-Command -Id $ok.Id -AcceptStates @('Succeeded') | Out-Null
Assert-Master $rk 'TCKT_PAY' 'PendingPayment' | Out-Null
$after = Get-Master $rk
$gotDue = $after.FieldValues['PaymentDueAt']
if ($null -eq $gotDue -or [string]$gotDue -eq '') { throw 'PaymentDueAt not written on Master' }
Write-Host ("ASSERT OK PaymentDueAt={0}" -f $gotDue) -ForegroundColor Green

Write-Host ''
Write-Host 'UAT PHASE2 CHAIR PAYMENTDUEAT PASS (1.0.0.12 two-step)' -ForegroundColor Green
Write-Host "RequestKey=$rk"
