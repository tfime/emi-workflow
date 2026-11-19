# EMI PAY Core 1.0.0.11 — UAT Activity + ACCEPT/DueAt gates
# Requires: Connect-PnPOnline CECM; Flow 1.0.0.11 ON; preferably -OrchestratorUrl
#
#   .\09_UAT_Phase2_ActivityAccept.ps1 -OrchestratorUrl 'https://...invoke' -WaitSeconds 90
[CmdletBinding()]
param(
    [string]$SiteUrl = 'https://emicomvn.sharepoint.com/sites/cecm',
    [string]$CreatorUPN = 'admin@local',
    [string]$ActorUPN = 'admin@local',
    [int]$WaitSeconds = 90,
    [int]$PollSeconds = 5,
    [string]$GuidPath = '',
    [string]$OrchestratorUrl = '',
    # JWT aud phải đúng https://service.flow.microsoft.com/ (trailing slash). Scope: …flow.microsoft.com//.default
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
    $localGuids = Join-Path (Split-Path $PSScriptRoot -Parent) 'config\list-guids.json'
    if (-not (Test-Path -LiteralPath $localGuids)) { throw "list-guids.json not found: $localGuids" }
    $GuidPath = $localGuids
}
$guids = Get-Content -LiteralPath $GuidPath -Raw -Encoding UTF8 | ConvertFrom-Json
$cmdList = [Guid]$guids.EMI_PAY_Commands
$reqList = [Guid]$guids.EMI_PAY_Requests
$wiList  = [Guid]$guids.EMI_PAY_WorkItems
$chkList = [Guid]$guids.EMI_PAY_ChecklistItems
$actList = [Guid]$guids.EMI_PAY_ActivityPublic
$actInt  = [Guid]$guids.EMI_PAY_ActivityInternal

# Flow HTTP = Any user in tenant → bắt buộc Bearer đúng audience.
$OrchestratorUrl = ($OrchestratorUrl -as [string]).Trim()
$script:FlowBearer = $null
$script:MsalApp = $null

function New-Key([string]$Prefix) {
    return '{0}-{1:yyyyMMddHHmmss}-{2}' -f $Prefix, (Get-Date).ToUniversalTime(), ([guid]::NewGuid().ToString('N').Substring(0, 6))
}

function Get-PropValue($Obj, [string]$Name) {
    if ($null -eq $Obj) { return $null }
    $prop = $Obj.PSObject.Properties[$Name]
    if ($null -eq $prop) { return $null }
    return $prop.Value
}

function Test-OrchestratorFailed($Resp) {
    $v = Get-PropValue -Obj $Resp -Name '__error'
    return ($null -ne $v -and [bool]$v)
}

function ConvertFrom-JwtPayload([string]$Jwt) {
    $jwt = ($Jwt -as [string]).Trim().Trim('"')
    $parts = $jwt -split '\.'
    if ($parts.Count -lt 2) { throw "JWT không đủ 3 phần (len=$($jwt.Length))" }
    $part = $parts[1].Replace('-', '+').Replace('_', '/')
    switch ($part.Length % 4) {
        1 { $part += '===' }
        2 { $part += '==' }
        3 { $part += '=' }
    }
    $json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($part))
    return ($json | ConvertFrom-Json)
}

function Write-JwtClaims([string]$Jwt, [string]$Label) {
    try {
        $p = ConvertFrom-JwtPayload -Jwt $Jwt
        $azp = Get-PropValue -Obj $p -Name 'azp'
        if (-not $azp) { $azp = Get-PropValue -Obj $p -Name 'appid' }
        Write-Host ("  JWT[{0}] aud={1} scp={2} tid={3} appid/azp={4}" -f `
            $Label,
            (Get-PropValue -Obj $p -Name 'aud'),
            (Get-PropValue -Obj $p -Name 'scp'),
            (Get-PropValue -Obj $p -Name 'tid'),
            $azp) -ForegroundColor DarkGray
    }
    catch {
        Write-Host ("  JWT[{0}] decode failed: {1} (tokenLen={2})" -f $Label, $_.Exception.Message, ($Jwt -as [string]).Length) -ForegroundColor DarkYellow
    }
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
    Write-Host ("  MSAL authority tenant={0} clientId={1}" -f $tid, $ClientId) -ForegroundColor DarkGray
    $script:MsalApp = [Microsoft.Identity.Client.PublicClientApplicationBuilder]::Create($ClientId).
        WithAuthority([Microsoft.Identity.Client.AzureCloudInstance]::AzurePublic, $tid).
        WithRedirectUri('http://localhost').
        Build()
    return $script:MsalApp
}

function Get-TokenForScopes([string[]]$Scopes, [string]$Label) {
    # PnP PowerAutomate
    if ($Label -eq 'PnP-PowerAutomate') {
        try {
            $tokenObj = Get-PnPAccessToken -ResourceTypeName PowerAutomate -Connection $connection -ErrorAction Stop
            if ($tokenObj -is [string]) { return $tokenObj }
            if ($null -ne $tokenObj -and $tokenObj.PSObject.Properties['RawData']) { return [string]$tokenObj.RawData }
            return [string]$tokenObj
        }
        catch {
            Write-Host ("  skip {0}: {1}" -f $Label, $_.Exception.Message) -ForegroundColor DarkYellow
            return $null
        }
    }

    $app = Ensure-MsalApp
    # Silent trước (cache từ lần login trước), rồi interactive.
    try {
        $accounts = $app.GetAccountsAsync().GetAwaiter().GetResult()
        $acct = $null
        foreach ($a in $accounts) { $acct = $a; break }
        if ($null -ne $acct) {
            $silent = $app.AcquireTokenSilent($Scopes, $acct).ExecuteAsync().GetAwaiter().GetResult()
            if ($silent -and $silent.AccessToken) {
                Write-Host ("  MSAL silent OK ({0})" -f $Label) -ForegroundColor DarkGray
                return [string]$silent.AccessToken
            }
        }
    }
    catch { }

    Write-Host ("  MSAL interactive scopes=[{0}] ({1})" -f ($Scopes -join ' '), $Label) -ForegroundColor Yellow
    try {
        $result = $app.AcquireTokenInteractive($Scopes).ExecuteAsync().GetAwaiter().GetResult()
        return [string]$result.AccessToken
    }
    catch {
        Write-Host ("  skip {0}: {1}" -f $Label, $_.Exception.Message) -ForegroundColor DarkYellow
        return $null
    }
}

function Test-OrchestratorToken([string]$Bearer, [int]$CommandId) {
    $headers = @{ Authorization = "Bearer $Bearer"; Accept = 'application/json' }
    $body = (@{ commandId = $CommandId } | ConvertTo-Json -Compress)
    try {
        return Invoke-RestMethod -Method Post -Uri $OrchestratorUrl -Headers $headers -ContentType 'application/json' -Body $body
    }
    catch {
        $msg = $_.Exception.Message
        $respBody = $null
        try { $respBody = $_.ErrorDetails.Message } catch { }
        return [pscustomobject]@{ __error = $true; Message = $msg; Body = $respBody }
    }
}

function Invoke-Orchestrator([int]$CommandId) {
    if ([string]::IsNullOrWhiteSpace($OrchestratorUrl)) { return }

    if (-not [string]::IsNullOrWhiteSpace($FlowAccessToken)) {
        $script:FlowBearer = $FlowAccessToken.Trim()
    }

    if (-not [string]::IsNullOrWhiteSpace($script:FlowBearer)) {
        $resp = Test-OrchestratorToken -Bearer $script:FlowBearer -CommandId $CommandId
        if (-not (Test-OrchestratorFailed -Resp $resp)) {
            Write-Host ("  POST orchestrator commandId={0} state={1}" -f $CommandId, (Get-PropValue -Obj $resp -Name 'state')) -ForegroundColor DarkGray
            return $resp
        }
        Write-Host ("  cached token rejected: {0}" -f (Get-PropValue -Obj $resp -Name 'Message')) -ForegroundColor DarkYellow
        $script:FlowBearer = $null
    }

    # aud BẮT BUỘC đúng https://service.flow.microsoft.com/ (có trailing slash).
    # Scope /User thường cho aud không slash → MisMatchingOAuthClaims.
    # Scope //.default (double slash) mới ra aud đúng — docs MS + community.
    $requiredAud = 'https://service.flow.microsoft.com/'
    $candidates = @(
        [pscustomobject]@{ Label = 'PnP-PowerAutomate'; Scopes = @() }
        [pscustomobject]@{ Label = 'Flow-slash-default'; Scopes = @('https://service.flow.microsoft.com//.default') }
        [pscustomobject]@{ Label = 'Flow-User'; Scopes = @('https://service.flow.microsoft.com/User') }
        [pscustomobject]@{ Label = 'Flow-user_impersonation'; Scopes = @('https://service.flow.microsoft.com/user_impersonation') }
    )

    $lastErr = ''
    foreach ($c in $candidates) {
        $token = Get-TokenForScopes -Scopes ([string[]]$c.Scopes) -Label $c.Label
        if ([string]::IsNullOrWhiteSpace($token)) { continue }
        Write-JwtClaims -Jwt $token -Label $c.Label
        try {
            $claims = ConvertFrom-JwtPayload -Jwt $token
            $aud = [string](Get-PropValue -Obj $claims -Name 'aud')
            if ($aud -ne $requiredAud) {
                Write-Host ("  note {0}: aud='{1}' (expected '{2}')" -f $c.Label, $aud, $requiredAud) -ForegroundColor DarkYellow
                if ($aud -notlike 'https://service.flow.microsoft.com*') {
                    continue
                }
            }
        }
        catch { }

        $resp = Test-OrchestratorToken -Bearer $token -CommandId $CommandId
        if (-not (Test-OrchestratorFailed -Resp $resp)) {
            $script:FlowBearer = $token
            Write-Host ("  POST orchestrator OK via {0} state={1}" -f $c.Label, (Get-PropValue -Obj $resp -Name 'state')) -ForegroundColor Green
            return $resp
        }
        $body = Get-PropValue -Obj $resp -Name 'Body'
        $msg = Get-PropValue -Obj $resp -Name 'Message'
        $lastErr = if ($body) { $body } else { $msg }
        Write-Host ("  POST fail via {0}: {1}" -f $c.Label, $lastErr) -ForegroundColor DarkYellow
    }

    throw @"
Orchestrator auth thất bại (MisMatchingOAuthClaims / 401).

JWT aud phải đúng: https://service.flow.microsoft.com/  (có dấu / cuối).
Scope đúng: https://service.flow.microsoft.com//.default  (hai dấu / trước .default).

Entra App $ClientId cần Microsoft Flow Service (Delegated User) + admin consent.
Hoặc: -FlowAccessToken '<jwt có aud đúng>' lấy từ jwt.ms sau khi SPFx/AadHttpClient gọi Flow.

Chi tiết cuối: $lastErr
"@
}

function Get-Master([string]$Key) {
    $escaped = [System.Security.SecurityElement]::Escape($Key)
    $query = "<View><Query><Where><Eq><FieldRef Name='RequestKey' /><Value Type='Text'>$escaped</Value></Eq></Where></Query><RowLimit>2</RowLimit></View>"
    $rows = @(Get-PnPListItem -List $reqList -Query $query -Connection $connection)
    if ($rows.Count -lt 1) { return $null }
    return $rows[0]
}

function Add-Command {
    param([string]$Type, [hashtable]$Payload, [string]$RequestKeyValue = '', [string]$StepInstanceKey = '')
    $ck = New-Key 'CMD'
    $values = @{
        Title = "UAT11-$Type-$ck"; CommandKey = $ck; CommandType = $Type
        PayloadJson = ($Payload | ConvertTo-Json -Compress -Depth 6); State = 'Pending'
        DedupeKey = "$Type-$ck"; RequestKey = $RequestKeyValue; StepInstanceKey = $StepInstanceKey
    }
    $item = Add-PnPListItem -List $cmdList -Values $values -Connection $connection
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
        Write-Host ("  wait id={0} State={1} Err={2}" -f $Id, $state, $err) -ForegroundColor DarkGray
        if ($state -in @('Succeeded', 'Rejected', 'Failed')) {
            if ($state -notin $AcceptStates) {
                throw ("CMD id={0} State={1} Err={2}" -f $Id, $state, $err)
            }
            return [pscustomobject]@{ State = $state; ErrorMessage = $err; Item = $item }
        }
    } while ((Get-Date) -lt $deadline)
    throw "Timeout CMD id=$Id"
}

function Set-ChecklistReady([string]$Key) {
    $escaped = [System.Security.SecurityElement]::Escape($Key)
    $query = "<View><Query><Where><Eq><FieldRef Name='RequestKey' /><Value Type='Text'>$escaped</Value></Eq></Where></Query><RowLimit>50</RowLimit></View>"
    $rows = @(Get-PnPListItem -List $chkList -Query $query -Connection $connection)
    foreach ($row in $rows) {
        if (-not [bool]$row.FieldValues['IsRequired']) { continue }
        $min = [int]$row.FieldValues['MinFileCount']; if ($min -lt 1) { $min = 1 }
        Set-PnPListItem -List $chkList -Identity $row.Id -Values @{ UploadedCount = $min; ItemStatus = 'Uploaded' } -Connection $connection | Out-Null
    }
}

Write-Host 'UAT 1.0.0.11 Activity + ACCEPT gates' -ForegroundColor Yellow

# CREATE
$created = Add-Command -Type 'CREATE_REQUEST' -Payload @{
    title = 'UAT ActivityAccept'; createdOUCode = 'OU_BPCM1'; creatorUPN = $CreatorUPN
    paymentTypeCode = 'SPV_PAYMENT'; amount = 1000; explanation = 'UAT 1.0.0.11'
}
Wait-Command -Id $created.Id | Out-Null
$RequestKey = "PAY-$($created.CommandKey)"
Write-Host "RequestKey=$RequestKey" -ForegroundColor Green

Set-ChecklistReady -Key $RequestKey

# SUBMIT → AwaitingManager
$sub = Add-Command -Type 'SUBMIT' -RequestKeyValue $RequestKey -Payload @{
    actorUPN = $CreatorUPN; expectedStepKey = 'BPCM1_PREPARE'; expectedReviewRound = 1
}
Wait-Command -Id $sub.Id | Out-Null
$m = Get-Master $RequestKey
if ([string]$m.FieldValues['Status'] -ne 'AwaitingManager') { throw 'Expected AwaitingManager after SUBMIT' }

# TP PASS → BPCM2
$sik = [string]$m.FieldValues['CurrentStepInstanceKey']
$dec = Add-Command -Type 'DECIDE' -RequestKeyValue $RequestKey -StepInstanceKey $sik -Payload @{
    actorUPN = $ActorUPN; decision = 'PASS'; note = 'mgr'; expectedStepKey = 'BPCM1_PREPARE'
    expectedStepInstanceKey = $sik; expectedReviewRound = 1
}
Wait-Command -Id $dec.Id | Out-Null
$m = Get-Master $RequestKey
if ([string]$m.FieldValues['CurrentStepKey'] -ne 'BPCM2_TECH') { throw 'Expected BPCM2 after manager PASS' }

# Gate: DECIDE without ACCEPT → Rejected
$sik = [string]$m.FieldValues['CurrentStepInstanceKey']
$bad = Add-Command -Type 'DECIDE' -RequestKeyValue $RequestKey -StepInstanceKey $sik -Payload @{
    actorUPN = $ActorUPN; decision = 'PASS'; note = 'no accept'
    expectedStepKey = 'BPCM2_TECH'; expectedStepInstanceKey = $sik; expectedReviewRound = 1
}
$rBad = Wait-Command -Id $bad.Id -AcceptStates @('Rejected')
if ($rBad.ErrorMessage -notmatch 'ACCEPT') { throw "Expected ACCEPT required, got: $($rBad.ErrorMessage)" }
Write-Host 'ASSERT OK DECIDE blocked without ACCEPT' -ForegroundColor Green

# Gate: ACCEPT without dueAt → Rejected
$bad2 = Add-Command -Type 'ACCEPT' -RequestKeyValue $RequestKey -StepInstanceKey $sik -Payload @{
    actorUPN = $ActorUPN; expectedStepKey = 'BPCM2_TECH'; expectedStepInstanceKey = $sik; expectedReviewRound = 1
}
$rBad2 = Wait-Command -Id $bad2.Id -AcceptStates @('Rejected')
if ($rBad2.ErrorMessage -notmatch 'dueAt') { throw "Expected dueAt required, got: $($rBad2.ErrorMessage)" }
Write-Host 'ASSERT OK ACCEPT blocked without dueAt' -ForegroundColor Green

# ACCEPT OK
$due = (Get-Date).ToUniversalTime().AddDays(2).ToString('yyyy-MM-ddTHH:mm:ssZ')
$acc = Add-Command -Type 'ACCEPT' -RequestKeyValue $RequestKey -StepInstanceKey $sik -Payload @{
    actorUPN = $ActorUPN; dueAt = $due; expectedStepKey = 'BPCM2_TECH'
    expectedStepInstanceKey = $sik; expectedReviewRound = 1
}
Wait-Command -Id $acc.Id | Out-Null
Write-Host 'ASSERT OK ACCEPT with dueAt' -ForegroundColor Green

# DECIDE PASS OK
$ok = Add-Command -Type 'DECIDE' -RequestKeyValue $RequestKey -StepInstanceKey $sik -Payload @{
    actorUPN = $ActorUPN; decision = 'PASS'; note = 'after accept'
    expectedStepKey = 'BPCM2_TECH'; expectedStepInstanceKey = $sik; expectedReviewRound = 1
}
Wait-Command -Id $ok.Id | Out-Null
$m = Get-Master $RequestKey
if ([string]$m.FieldValues['CurrentStepKey'] -ne 'BPCM3_PRICE') { throw 'Expected BPCM3 after ACCEPT+PASS' }
Write-Host 'ASSERT OK DECIDE after ACCEPT -> BPCM3' -ForegroundColor Green

# ActivityPublic
$escaped = [System.Security.SecurityElement]::Escape($RequestKey)
$q = "<View><Query><Where><Eq><FieldRef Name='RequestKey' /><Value Type='Text'>$escaped</Value></Eq></Where></Query><RowLimit>100</RowLimit></View>"
$acts = @(Get-PnPListItem -List $actList -Query $q -Connection $connection)
$types = @($acts | ForEach-Object { [string]$_.FieldValues['EventType'] })
Write-Host ("ActivityPublic=[{0}]" -f ($types -join ',')) -ForegroundColor Cyan
foreach ($need in @('REQUEST_CREATED', 'SUBMITTED_TO_MANAGER', 'MANAGER_APPROVED', 'STEP_ACCEPTED', 'STEP_PASSED')) {
    if ($types -notcontains $need) { throw "Missing EventType=$need" }
}
Write-Host 'ASSERT OK ActivityPublic events' -ForegroundColor Green

# ActivityInternal for Rejected ACCEPT-missing command
$qInt = "<View><Query><Where><Contains><FieldRef Name='ActivityKey' /><Value Type='Text'>$($bad.CommandKey)</Value></Contains></Where></Query><RowLimit>5</RowLimit></View>"
$ints = @(Get-PnPListItem -List $actInt -Query $qInt -Connection $connection -ErrorAction SilentlyContinue)
if ($ints.Count -lt 1) {
    Write-Host 'WARN ActivityInternal not found for rejected DECIDE (check Flow ACL / list)' -ForegroundColor Yellow
}
else {
    Write-Host 'ASSERT OK ActivityInternal for rejected command' -ForegroundColor Green
}

Write-Host ""
Write-Host "UAT Activity+ACCEPT PASS RequestKey=$RequestKey" -ForegroundColor Green
