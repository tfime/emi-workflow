# Perf Gói 3 — CREATE song song + double-invoke cùng commandId.
# Yêu cầu: Core 1.0.0.16+ On; -OrchestratorUrl từ EMI-Pay.aspx.
#
#   .\11_PERF_Goi3_Concurrent.ps1 -OrchestratorUrl 'https://...invoke?api-version=1' -Parallel 3
#
[CmdletBinding()]
param(
    [string]$SiteUrl = 'https://emicomvn.sharepoint.com/sites/cecm',
    [Parameter(Mandatory = $true)][string]$OrchestratorUrl,
    [string]$CreatorUPN = 'tinh.pt@emi.com.vn',
    [string]$CreatedOUCode = 'OU_HCNS',
    [int]$Parallel = 3,
    [int]$WaitSeconds = 180,
    [string]$GuidPath = '',
    [string]$ClientId = '5c1a7c4d-3b40-4938-821d-12f44ee316e5'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module PnP.PowerShell -ErrorAction Stop
try { $null = Get-PnPConnection -ErrorAction Stop }
catch { Connect-PnPOnline -Url $SiteUrl -ClientId $ClientId -Interactive }

if ([string]::IsNullOrWhiteSpace($GuidPath)) {
    $GuidPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'config\list-guids.json'
}
$guids = Get-Content -LiteralPath $GuidPath -Raw -Encoding UTF8 | ConvertFrom-Json
$cmdList = [Guid]$guids.EMI_PAY_Commands
$reqList = [Guid]$guids.EMI_PAY_Requests
$connection = Get-PnPConnection
$OrchestratorUrl = $OrchestratorUrl.Trim()
$script:FlowBearer = $null
$script:MsalApp = $null

function Get-PropValue($Obj, [string]$Name) {
    if ($null -eq $Obj) { return $null }
    $p = $Obj.PSObject.Properties[$Name]
    if ($null -eq $p) { return $null }
    return $p.Value
}
function ConvertFrom-JwtPayload([string]$Jwt) {
    $parts = (($Jwt -as [string]).Trim().Trim('"') -split '\.')
    if ($parts.Count -lt 2) { throw 'JWT bad' }
    $part = $parts[1].Replace('-', '+').Replace('_', '/')
    switch ($part.Length % 4) { 1 { $part += '===' } 2 { $part += '==' } 3 { $part += '=' } }
    return ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($part)) | ConvertFrom-Json)
}
function Get-TenantIdForFlow {
    try {
        $sp = Get-PnPAccessToken -Connection $connection -ErrorAction Stop
        if ($sp -isnot [string] -and $sp.PSObject.Properties['RawData']) { $sp = [string]$sp.RawData }
        $p = ConvertFrom-JwtPayload -Jwt ([string]$sp)
        if ($p.tid) { return [string]$p.tid }
    } catch { }
    return 'organizations'
}
function Ensure-MsalApp {
    if ($null -ne $script:MsalApp) { return $script:MsalApp }
    $msalDll = Join-Path (Get-Module PnP.PowerShell).ModuleBase 'Common/Microsoft.Identity.Client.dll'
    Add-Type -Path $msalDll | Out-Null
    $tid = Get-TenantIdForFlow
    $script:MsalApp = [Microsoft.Identity.Client.PublicClientApplicationBuilder]::Create($ClientId).
        WithAuthority([Microsoft.Identity.Client.AzureCloudInstance]::AzurePublic, $tid).
        WithRedirectUri('http://localhost').Build()
    return $script:MsalApp
}
function Get-FlowToken {
    try {
        $t = Get-PnPAccessToken -ResourceTypeName PowerAutomate -Connection $connection -ErrorAction Stop
        if ($t -isnot [string] -and $t.PSObject.Properties['RawData']) { $t = [string]$t.RawData }
        if ($t) { return [string]$t }
    } catch { }
    $app = Ensure-MsalApp
    $scopes = [string[]]@('https://service.flow.microsoft.com//.default')
    try {
        $accounts = $app.GetAccountsAsync().GetAwaiter().GetResult()
        $acct = $null; foreach ($a in $accounts) { $acct = $a; break }
        if ($acct) {
            $s = $app.AcquireTokenSilent($scopes, $acct).ExecuteAsync().GetAwaiter().GetResult()
            if ($s.AccessToken) { return [string]$s.AccessToken }
        }
    } catch { }
    # MSAL: IEnumerable scopes — ép List để tránh overload lỗi.
    $scopeList = New-Object 'System.Collections.Generic.List[string]'
    foreach ($s in $scopes) { [void]$scopeList.Add($s) }
    $r = $app.AcquireTokenInteractive($scopeList).ExecuteAsync().GetAwaiter().GetResult()
    return [string]$r.AccessToken
}
function Invoke-Orch([int]$CommandId) {
    if (-not $script:FlowBearer) { $script:FlowBearer = Get-FlowToken }
    $headers = @{ Authorization = "Bearer $($script:FlowBearer)"; Accept = 'application/json' }
    $body = (@{ commandId = $CommandId } | ConvertTo-Json -Compress)
    return Invoke-RestMethod -Method Post -Uri $OrchestratorUrl -Headers $headers -ContentType 'application/json' -Body $body
}
function New-Key([string]$Prefix) {
    return '{0}-{1:yyyyMMddHHmmss}-{2}' -f $Prefix, (Get-Date).ToUniversalTime(), ([guid]::NewGuid().ToString('N').Substring(0, 6))
}
function Wait-Cmd([int]$Id, [int]$Seconds = $WaitSeconds) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        Start-Sleep -Seconds 2
        $cur = Get-PnPListItem -List $cmdList -Id $Id -Connection $connection
        $st = [string]$cur.FieldValues['State']
        if ($st -in @('Succeeded', 'Rejected', 'Failed')) {
            return [pscustomobject]@{
                Id = $Id; State = $st
                RequestKey = [string]$cur.FieldValues['RequestKey']
                Error = [string]$cur.FieldValues['ErrorMessage']
                CommandKey = [string]$cur.FieldValues['CommandKey']
            }
        }
    } while ((Get-Date) -lt $deadline)
    throw "Timeout CMD $Id"
}

Write-Host "Gói3 concurrent Parallel=$Parallel" -ForegroundColor Yellow
$swAll = [diagnostics.stopwatch]::StartNew()
$jobs = [System.Collections.Generic.List[object]]::new()

for ($i = 1; $i -le $Parallel; $i++) {
    $ck = New-Key 'CMD'
    $route = @{ BPCM1_PREPARE = $CreatedOUCode; BPCM2_TECH = 'OU_KYTHUAT'; BPCM3_PRICE = 'OU_KINHTE'; TCKT_CHECK = 'OU_TCKT'; CHAIR_APPROVE = 'OU_HDQT'; TCKT_PAY = 'OU_TCKT' }
    $payload = @{
        title = "PERF G3 parallel $i $ck"; createdOUCode = $CreatedOUCode; creatorUPN = $CreatorUPN
        paymentTypeCode = 'SPV_PAYMENT'; checklistVersion = 1; amount = (1000000 + $i)
        explanation = 'Goi3 concurrent'; routePlan = $route; routePlanJson = ($route | ConvertTo-Json -Compress)
    }
    $item = Add-PnPListItem -List $cmdList -Values @{
        Title = "PERF-G3-$ck"; CommandKey = $ck; CommandType = 'CREATE_REQUEST'
        PayloadJson = ($payload | ConvertTo-Json -Compress -Depth 6)
        State = 'Pending'; DedupeKey = "CREATE_REQUEST-$ck"; RequestKey = ''; StepInstanceKey = ''
    } -Connection $connection
    $jobs.Add([pscustomobject]@{ Idx = $i; Id = [int]$item.Id; CommandKey = $ck; Sw = [diagnostics.stopwatch]::StartNew() })
}

# Fire HTTP in parallel (runspaces)
$token = Get-FlowToken
$script:FlowBearer = $token
$pool = [runspacefactory]::CreateRunspacePool(1, [Math]::Min(5, $Parallel))
$pool.Open()
$runners = @()
foreach ($j in $jobs) {
    $ps = [powershell]::Create().AddScript({
            param($Url, $Bearer, $CommandId)
            $headers = @{ Authorization = "Bearer $Bearer"; Accept = 'application/json' }
            $body = (@{ commandId = $CommandId } | ConvertTo-Json -Compress)
            try {
                $resp = Invoke-RestMethod -Method Post -Uri $Url -Headers $headers -ContentType 'application/json' -Body $body
                return [pscustomobject]@{ Ok = $true; State = [string]$resp.state; RequestKey = [string]$resp.requestKey; Err = [string]$resp.errorMessage }
            }
            catch {
                return [pscustomobject]@{ Ok = $false; State = 'HTTP_ERR'; RequestKey = ''; Err = $_.Exception.Message }
            }
        }).AddArgument($OrchestratorUrl).AddArgument($token).AddArgument($j.Id)
    $ps.RunspacePool = $pool
    $runners += [pscustomobject]@{ Job = $j; Ps = $ps; Handle = $ps.BeginInvoke() }
}

$httpResults = @{}
foreach ($r in $runners) {
    $out = $r.Ps.EndInvoke($r.Handle)
    $r.Ps.Dispose()
    $httpResults[$r.Job.Id] = $out | Select-Object -First 1
    $r.Job.Sw.Stop()
    Write-Host ("[PERF] parallel#{0} cmd={1} httpMs={2} state={3} rk={4}" -f `
            $r.Job.Idx, $r.Job.Id, [int]$r.Job.Sw.Elapsed.TotalMilliseconds,
        (Get-PropValue $httpResults[$r.Job.Id] 'State'),
        (Get-PropValue $httpResults[$r.Job.Id] 'RequestKey')) -ForegroundColor Green
}
$pool.Close(); $pool.Dispose()

$finals = @()
foreach ($j in $jobs) {
    $f = Wait-Cmd -Id $j.Id
    $finals += $f
    Write-Host ("  final id={0} state={1} rk={2} err={3}" -f $f.Id, $f.State, $f.RequestKey, $f.Error)
}

$oks = @($finals | Where-Object { $_.State -eq 'Succeeded' })
$keys = @($oks | ForEach-Object { if ($_.RequestKey) { $_.RequestKey } else { "PAY-$($_.CommandKey)" } } | Select-Object -Unique)
Write-Host ("Parallel wall={0}ms Succeeded={1}/{2} uniqueRequestKey={3}" -f `
        [int]$swAll.Elapsed.TotalMilliseconds, $oks.Count, $Parallel, $keys.Count) -ForegroundColor Cyan
if ($oks.Count -ne $Parallel -or $keys.Count -ne $Parallel) {
    throw "Gói3 parallel FAIL — expect $Parallel distinct Succeeded RequestKeys"
}

# Double-invoke: POST lại commandId đã Succeeded → no-op Succeeded, không Master mới
$sample = $oks[0]
$rk = if ($sample.RequestKey) { $sample.RequestKey } else { "PAY-$($sample.CommandKey)" }
$before = @(Get-PnPListItem -List $reqList -Query @"
<View><Query><Where><Eq><FieldRef Name='RequestKey'/><Value Type='Text'>$([System.Security.SecurityElement]::Escape($rk))</Value></Eq></Where></Query><RowLimit>5</RowLimit></View>
"@ -Connection $connection)
$sw2 = [diagnostics.stopwatch]::StartNew()
$again = Invoke-Orch -CommandId ([int]$sample.Id)
$sw2.Stop()
Write-Host ("[PERF] doubleInvoke cmd={0} ms={1} state={2}" -f $sample.Id, [int]$sw2.Elapsed.TotalMilliseconds, (Get-PropValue $again 'state')) -ForegroundColor Green
$after = @(Get-PnPListItem -List $reqList -Query @"
<View><Query><Where><Eq><FieldRef Name='RequestKey'/><Value Type='Text'>$([System.Security.SecurityElement]::Escape($rk))</Value></Eq></Where></Query><RowLimit>5</RowLimit></View>
"@ -Connection $connection)
if ($after.Count -ne $before.Count -or $after.Count -ne 1) {
    throw "Double-invoke tạo Master trùng (before=$($before.Count) after=$($after.Count))"
}
Write-Host 'Gói3 concurrent PASS' -ForegroundColor Green
