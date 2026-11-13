# EMI PAY Dyn ACL — Validate/Apply desired permissions for one RequestKey.
# Yêu cầu: Connect-PnPOnline CECM với tài khoản SYSADM / FLOW-SVC (Full trên 23 list).
# Không sửa RBAC tĩnh cấp List/Library.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$RequestKey,
    [string]$SiteUrl = 'https://emicomvn.sharepoint.com/sites/cecm',
    [string]$ClientId = '5c1a7c4d-3b40-4938-821d-12f44ee316e5',
    [switch]$Connect,
    [string]$GuidPath = '',
    [ValidateSet('Validate', 'Apply')]
    [string]$Mode = 'Validate',
    [ValidateSet('Auto', 'OnCreate', 'OnSubmit', 'OnAccept', 'OnDecidePass', 'OnDecideReject', 'OnConfirm')]
    [string]$Event = 'Auto',
    # Khi CreatorUPN vẫn là admin@local: cấp thêm UPN này (vd. tài khoản đang login)
    [string]$AlsoGrantUPN = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Off

$here = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if ([string]::IsNullOrWhiteSpace($GuidPath)) {
    $GuidPath = Join-Path $here 'config\list-guids.json'
}

Import-Module PnP.PowerShell -ErrorAction Stop
$mod = Join-Path $here 'src\EMI_PAY_DynPermission.psm1'
Import-Module $mod -Force -ErrorAction Stop

if ($Connect) {
    # App CECM dùng Interactive (PKCE). DeviceLogin → AADSTS7000218 (app không phải public client).
    Write-Host "Connect-PnPOnline $SiteUrl (ClientId=$ClientId, Interactive)..." -ForegroundColor Cyan
    Connect-PnPOnline -Url $SiteUrl -ClientId $ClientId -Interactive
}

try {
    $connection = Get-PnPConnection -ErrorAction Stop
}
catch {
    throw "Chưa kết nối PnP. Chạy lại với -Connect hoặc Connect-PnPOnline trước."
}
$web = Get-PnPWeb -Connection $connection -Includes Url
if ($web.Url.TrimEnd('/') -ine $SiteUrl.TrimEnd('/')) {
    throw "Safety stop: connected [$($web.Url)] != expected [$SiteUrl]"
}

$guids = Get-Content -LiteralPath $GuidPath -Raw -Encoding UTF8 | ConvertFrom-Json

Write-Host "=== EMI PAY Dyn ACL ($Mode) ===" -ForegroundColor Cyan
Write-Host "RequestKey: $RequestKey | Event: $Event"
Write-Host ""

$plan = Build-EmiPayDynAclPlan -RequestKey $RequestKey -Guids $guids -Event $Event

if ([string]::IsNullOrWhiteSpace($AlsoGrantUPN)) {
    try {
        $me = Get-PnPProperty -ClientObject (Get-PnPWeb) -Property CurrentUser
        if ($me -and $me.Email) { $AlsoGrantUPN = $me.Email }
    }
    catch { }
}
$grantable = @($plan.Principals | Where-Object { Test-EmiPayGrantableUpn $_.UPN })
if ($grantable.Count -lt 1 -and $AlsoGrantUPN -and (Test-EmiPayGrantableUpn $AlsoGrantUPN)) {
    $u = Normalize-EmiPayUpn $AlsoGrantUPN
    $plan.Principals = @($plan.Principals) + @([pscustomobject]@{ UPN = $u; DocsRole = 'Read' })
    Write-Host "Fallback AlsoGrantUPN (connected user): $u (Read) — CreatorUPN was placeholder" -ForegroundColor Yellow
}
elseif ($AlsoGrantUPN -and (Test-EmiPayGrantableUpn $AlsoGrantUPN)) {
    $u = Normalize-EmiPayUpn $AlsoGrantUPN
    $existing = @($plan.Principals | Where-Object { $_.UPN -eq $u })
    if ($existing.Count -lt 1) {
        $plan.Principals = @($plan.Principals) + @([pscustomobject]@{ UPN = $u; DocsRole = 'Read' })
        Write-Host "AlsoGrantUPN: $u (Read)" -ForegroundColor Yellow
    }
}

Write-Host ("Master Id={0} Status={1} Step={2} OU={3} Creator={4}" -f `
        $plan.MasterId, $plan.Status, $plan.CurrentStepKey, $plan.CurrentOUCode, $plan.CreatorUPN)
Write-Host "Principals:" -ForegroundColor Yellow
$plan.Principals | Format-Table -AutoSize | Out-Host

$report = Invoke-EmiPayDynAclPlan -Plan $plan -Mode $Mode
$flat = foreach ($r in $report) {
    [pscustomobject]@{
        Action = $r.Action
        List   = $(if ($r.PSObject.Properties['List']) { $r.List } else { '' })
        Id     = $(if ($r.PSObject.Properties['Id']) { $r.Id } else { '' })
        Folder = $(if ($r.PSObject.Properties['Folder']) { $r.Folder } else { '' })
        User   = $(if ($r.PSObject.Properties['User']) { $r.User } else { '' })
        Role   = $(if ($r.PSObject.Properties['Role']) { $r.Role } else { '' })
        Mode   = $(if ($r.PSObject.Properties['Mode']) { $r.Mode } else { $Mode })
        Error  = $(if ($r.PSObject.Properties['Error']) { $r.Error } else { '' })
    }
}
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$out = Join-Path $here ("dyn-acl-report-{0}-{1}-{2}.csv" -f $Mode, ($RequestKey -replace '[^\w\-]', '_'), $stamp)
$flat | Export-Csv -LiteralPath $out -Encoding UTF8
Write-Host ""
Write-Host "Report: $out" -ForegroundColor Green
$err = @($flat | Where-Object { -not [string]::IsNullOrWhiteSpace($_.Error) })
if ($err.Count -gt 0) {
    Write-Warning "$($err.Count) row(s) had errors — xem CSV."
    $err | Format-Table Action, List, User, Error -AutoSize | Out-Host
    exit 2
}
Write-Host "Done ($Mode)." -ForegroundColor Green
