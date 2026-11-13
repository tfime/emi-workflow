# Đo latency CREATE + đọc list (sau Gói 1–2 / Core ≥ 1.0.0.14).
# Yêu cầu: Connect-PnPOnline CECM; Flow ON.
#
#   Connect-PnPOnline -Url https://emicomvn.sharepoint.com/sites/cecm -ClientId 5c1a7c4d-3b40-4938-821d-12f44ee316e5 -Interactive
#   .\10_PERF_Measure_Create.ps1 -OrchestratorUrl 'https://.../triggers/manual/paths/invoke?api-version=...'
#
[CmdletBinding()]
param(
    [string]$SiteUrl = 'https://emicomvn.sharepoint.com/sites/cecm',
    [string]$CreatorUPN = 'tinh.pt@emi.com.vn',
    [string]$CreatedOUCode = 'OU_HCNS',
    [string]$PaymentTypeCode = 'SPV_PAYMENT',
    [int]$WaitSeconds = 120,
    [int]$PollSeconds = 2,
    [string]$GuidPath = '',
    [string]$OrchestratorUrl = '',
    [string]$FlowAccessToken = '',
    [string]$ClientId = '5c1a7c4d-3b40-4938-821d-12f44ee316e5',
    [switch]$SkipCreate
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Import-Module PnP.PowerShell -ErrorAction Stop
try { $connection = Get-PnPConnection -ErrorAction Stop }
catch {
    Connect-PnPOnline -Url $SiteUrl -ClientId $ClientId -Interactive
    $connection = Get-PnPConnection -ErrorAction Stop
}
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
$wiList = [Guid]$guids.EMI_PAY_WorkItems
$chkList = [Guid]$guids.EMI_PAY_ChecklistItems
$tplList = [Guid]$guids.EMI_PAY_ChecklistTemplates
$docList = [Guid]$guids.EMI_PAY_DocumentIndex
$actList = [Guid]$guids.EMI_PAY_ActivityPublic
$revList = [Guid]$guids.EMI_PAY_StepReviews
$ptList = [Guid]$guids.EMI_PAY_PaymentTypes
$ouList = [Guid]$guids.EMI_PAY_OrgUnits
$omList = [Guid]$guids.EMI_PAY_OrgMembers
$srList = [Guid]$guids.EMI_PAY_StepRecipients

$OrchestratorUrl = ($OrchestratorUrl -as [string]).Trim()
$script:FlowBearer = $null
$script:MsalApp = $null

function Get-PropValue($Obj, [string]$Name) {
    if ($null -eq $Obj) { return $null }
    $prop = $Obj.PSObject.Properties[$Name]
    if ($null -eq $prop) { return $null }
    return $prop.Value
}

function Ms([diagnostics.stopwatch]$Sw) { return [int]$Sw.Elapsed.TotalMilliseconds }

function Mark([string]$Label, [int]$Ms, [hashtable]$Extra = @{}) {
    $parts = @()
    foreach ($k in $Extra.Keys) { $parts += ("{0}={1}" -f $k, $Extra[$k]) }
    $tail = if ($parts.Count) { '  ' + ($parts -join ' ') } else { '' }
    Write-Host ("[PERF] {0,-28} {1,6} ms{2}" -f $Label, $Ms, $tail) -ForegroundColor Green
}

function ConvertFrom-JwtPayload([string]$Jwt) {
    $jwt = ($Jwt -as [string]).Trim().Trim('"')
    $parts = $jwt -split '\.'
    if ($parts.Count -lt 2) { throw "JWT không đủ phần" }
    $part = $parts[1].Replace('-', '+').Replace('_', '/')
    switch ($part.Length % 4) {
        1 { $part += '===' }
        2 { $part += '==' }
        3 { $part += '=' }
    }
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
        catch {
            Write-Host ("  skip {0}: {1}" -f $Label, $_.Exception.Message) -ForegroundColor DarkYellow
            return $null
        }
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
        $respBody = $null
        try { $respBody = $_.ErrorDetails.Message } catch { }
        return [pscustomobject]@{ __error = $true; Message = $_.Exception.Message; Body = $respBody }
    }
}

function Invoke-Orchestrator([int]$CommandId) {
    if ([string]::IsNullOrWhiteSpace($OrchestratorUrl)) { return $null }
    if (-not [string]::IsNullOrWhiteSpace($FlowAccessToken)) {
        $script:FlowBearer = $FlowAccessToken.Trim()
    }
    if (-not [string]::IsNullOrWhiteSpace($script:FlowBearer)) {
        $resp = Test-OrchestratorToken -Bearer $script:FlowBearer -CommandId $CommandId
        if (-not (Get-PropValue -Obj $resp -Name '__error')) { return $resp }
        $script:FlowBearer = $null
    }
    $candidates = @(
        [pscustomobject]@{ Label = 'PnP-PowerAutomate'; Scopes = @() }
        [pscustomobject]@{ Label = 'Flow-slash-default'; Scopes = @('https://service.flow.microsoft.com//.default') }
    )
    foreach ($c in $candidates) {
        $token = Get-TokenForScopes -Scopes ([string[]]$c.Scopes) -Label $c.Label
        if ([string]::IsNullOrWhiteSpace($token)) { continue }
        $resp = Test-OrchestratorToken -Bearer $token -CommandId $CommandId
        if (-not (Get-PropValue -Obj $resp -Name '__error')) {
            $script:FlowBearer = $token
            Write-Host ("  POST orchestrator OK via {0}" -f $c.Label) -ForegroundColor DarkGray
            return $resp
        }
        Write-Host ("  POST fail via {0}: {1}" -f $c.Label, ((Get-PropValue $resp 'Body') -or (Get-PropValue $resp 'Message'))) -ForegroundColor DarkYellow
    }
    throw 'Orchestrator auth thất bại — truyền -OrchestratorUrl đúng + login'
}

function New-Key([string]$Prefix) {
    return '{0}-{1:yyyyMMddHHmmss}-{2}' -f $Prefix, (Get-Date).ToUniversalTime(), ([guid]::NewGuid().ToString('N').Substring(0, 6))
}

function Get-ByRequestKey([Guid]$ListId, [string]$Key, [int]$RowLimit = 100) {
    $escaped = [System.Security.SecurityElement]::Escape($Key)
    $query = @"
<View>
  <Query>
    <Where>
      <Eq><FieldRef Name='RequestKey' /><Value Type='Text'>$escaped</Value></Eq>
    </Where>
  </Query>
  <RowLimit>$RowLimit</RowLimit>
</View>
"@
    return ,@(Get-PnPListItem -List $ListId -Query $query -Connection $connection)
}

Write-Host "PERF Measure — site=$SiteUrl" -ForegroundColor Yellow
Write-Host ("OrchestratorUrl set={0}" -f (-not [string]::IsNullOrWhiteSpace($OrchestratorUrl))) -ForegroundColor Yellow
if (-not $SkipCreate -and [string]::IsNullOrWhiteSpace($OrchestratorUrl)) {
    Write-Host 'WARN: Core trigger = HTTP Request — không có -OrchestratorUrl thì Command sẽ kẹt Pending.' -ForegroundColor Yellow
    Write-Host '  Lấy URL: make.powerautomate.com → Flow → HTTP URL → copy vào -OrchestratorUrl' -ForegroundColor Yellow
}

# --- boot.cfg mirror ---
$sw = [diagnostics.stopwatch]::StartNew()
$null = @(Get-PnPListItem -List $ptList -PageSize 50 -Connection $connection)
$null = @(Get-PnPListItem -List $ouList -PageSize 50 -Connection $connection)
$null = @(Get-PnPListItem -List $omList -PageSize 200 -Connection $connection)
$null = @(Get-PnPListItem -List $srList -PageSize 100 -Connection $connection)
Mark 'boot.cfg.lists' (Ms $sw)

$sw.Restart()
$null = @(Get-PnPListItem -List $reqList -PageSize 50 -Connection $connection | Select-Object -First 50)
Mark 'boot.inbox.top50' (Ms $sw)

# template count (Gói 2 expect)
$sw.Restart()
$tpls = @(Get-PnPListItem -List $tplList -PageSize 200 -Connection $connection | Where-Object {
        $fv = $_.FieldValues
        [string]$fv['PaymentTypeCode'] -eq $PaymentTypeCode -or [string]$fv['Title'] -like "*$PaymentTypeCode*"
    })
# fallback: all templates if filter empty
if ($tpls.Count -eq 0) {
    $tpls = @(Get-PnPListItem -List $tplList -PageSize 200 -Connection $connection)
}
$tplN = $tpls.Count
Mark 'cfg.templates' (Ms $sw) @{ paymentType = $PaymentTypeCode; n = $tplN }

if ($SkipCreate) {
    Write-Host 'SkipCreate — xong phần đọc list.' -ForegroundColor Cyan
    return
}

# --- CREATE ---
$ck = New-Key 'CMD'
$route = @{
    BPCM1_PREPARE  = $CreatedOUCode
    BPCM2_TECH     = 'OU_KYTHUAT'
    BPCM3_PRICE    = 'OU_KINHTE'
    TCKT_CHECK     = 'OU_TCKT'
    CHAIR_APPROVE  = 'OU_HDQT'
    TCKT_PAY       = 'OU_TCKT'
}
$payload = @{
    title             = "PERF measure $ck"
    createdOUCode     = $CreatedOUCode
    creatorUPN        = $CreatorUPN
    paymentTypeCode   = $PaymentTypeCode
    checklistVersion  = 1
    amount            = 1234567
    explanation       = 'PERF measure script'
    routePlan         = $route
    routePlanJson     = ($route | ConvertTo-Json -Compress)
}
$values = @{
    Title           = "PERF-CREATE-$ck"
    CommandKey      = $ck
    CommandType     = 'CREATE_REQUEST'
    PayloadJson     = ($payload | ConvertTo-Json -Compress -Depth 6)
    State           = 'Pending'
    DedupeKey       = "CREATE_REQUEST-$ck"
    RequestKey      = ''
    StepInstanceKey = ''
}

$swEnq = [diagnostics.stopwatch]::StartNew()
$item = Add-PnPListItem -List $cmdList -Values $values -Connection $connection
$cmdId = [int]$item.Id
Mark 'enqueueCommand' (Ms $swEnq) @{ commandId = $cmdId; commandKey = $ck }

$swFlow = [diagnostics.stopwatch]::StartNew()
$orchMode = 'poll'
if (-not [string]::IsNullOrWhiteSpace($OrchestratorUrl)) {
    $orchMode = 'api'
    $null = Invoke-Orchestrator -CommandId $cmdId
    Mark 'orchestratorApi' (Ms $swFlow) @{ commandId = $cmdId }
}

# poll until Succeeded (also if API already done — verify)
$deadline = (Get-Date).AddSeconds($WaitSeconds)
$state = ''
$err = ''
$requestKey = "PAY-$ck"
do {
    Start-Sleep -Seconds ([Math]::Max(1, $PollSeconds))
    $cur = Get-PnPListItem -List $cmdList -Id $cmdId -Connection $connection
    $fv = $cur.FieldValues
    $state = [string]$fv['State']
    $err = [string]$fv['ErrorMessage']
    if ($fv['RequestKey']) { $requestKey = [string]$fv['RequestKey'] }
    if ($state -in @('Succeeded', 'Rejected', 'Failed')) { break }
} while ((Get-Date) -lt $deadline)

Mark 'enqueueAndRun.total' (Ms $swEnq) @{ mode = $orchMode; state = $state; requestKey = $requestKey }
if ($state -ne 'Succeeded') {
    throw "CREATE state=$state err=$err (Flow ON? version ≥ 1.0.0.14?)"
}

# --- loadDetail mirror ---
$sw.Restart()
$masters = Get-ByRequestKey -ListId $reqList -Key $requestKey -RowLimit 2
Mark 'loadDetail.master' (Ms $sw) @{ n = $masters.Count }
if ($masters.Count -lt 1) { throw "Master missing $requestKey" }
$m = $masters[0].FieldValues
$title = [string]$m['Title']
$amount = $m['Amount']
$routeJson = [string]$m['RoutePlanJson']
$expl = [string]$m['Explanation']

$sw.Restart()
$checks = Get-ByRequestKey -ListId $chkList -Key $requestKey -RowLimit 100
Mark 'loadDetail.checklist' (Ms $sw) @{ n = $checks.Count }

$sw.Restart()
$wis = Get-ByRequestKey -ListId $wiList -Key $requestKey
$acts = Get-ByRequestKey -ListId $actList -Key $requestKey
$revs = Get-ByRequestKey -ListId $revList -Key $requestKey
$docs = Get-ByRequestKey -ListId $docList -Key $requestKey
Mark 'loadDetail.parallel' (Ms $sw) @{
    wi = $wis.Count; acts = $acts.Count; revs = $revs.Count; docs = $docs.Count
}

Write-Host ''
Write-Host '=== CREATE field / checklist (Gói 2) ===' -ForegroundColor Cyan
Write-Host ("RequestKey={0}" -f $requestKey)
Write-Host ("Title='{0}' (expect not CommandKey-only)" -f $title)
Write-Host ("Amount={0} Explanation.len={1} RoutePlanJson.len={2}" -f $amount, $expl.Length, $routeJson.Length)
Write-Host ("ChecklistItems={0} Templates≈{1}  (Gói2: items ≈ templates, không chỉ 2 stub)" -f $checks.Count, $tplN)
$codes = @($checks | ForEach-Object { [string]$_.FieldValues['ItemCode'] })
Write-Host ("ItemCodes: {0}" -f ($codes -join ', '))

$goi2Ok = ($checks.Count -ge 3 -or ($tplN -gt 0 -and $checks.Count -ge $tplN)) -and `
    $title -like 'PERF measure*' -and $null -ne $amount -and $routeJson.Length -gt 10
Write-Host ("Gói2 signal: {0}" -f $(if ($goi2Ok) { 'OK' } else { 'WEAK — kiểm tra Import Core ≥ 1.0.0.14' })) `
    -ForegroundColor $(if ($goi2Ok) { 'Green' } else { 'Yellow' })
