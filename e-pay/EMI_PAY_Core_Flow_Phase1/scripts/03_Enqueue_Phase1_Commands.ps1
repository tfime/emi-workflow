# Enqueue Phase-1 commands for EMI_PAY_CORE_Orchestrator_V1 (Power Automate)
# Requires: Connect-PnPOnline to https://emicomvn.sharepoint.com/sites/cecm
[CmdletBinding()]
param(
    [string]$SiteUrl = 'https://emicomvn.sharepoint.com/sites/cecm',
    [ValidateSet('Create', 'Submit', 'DecidePass', 'ConfirmPayment', 'HappyPath')]
    [string]$Step = 'Create',
    [string]$RequestKey = '',
    [string]$CreatorUPN = 'admin@local',
    [string]$ActorUPN = 'admin@local',
    [int]$WaitSeconds = 30,
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
    $repoGuids = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) '9.EMI_PAY_Core_Orchestrator_V1\config\list-guids.json'
    $localGuids = Join-Path (Split-Path $PSScriptRoot -Parent) 'config\list-guids.json'
    if (Test-Path -LiteralPath $localGuids) { $GuidPath = $localGuids }
    elseif (Test-Path -LiteralPath $repoGuids) { $GuidPath = $repoGuids }
    else { throw 'list-guids.json not found' }
}

$guids = Get-Content -LiteralPath $GuidPath -Raw -Encoding UTF8 | ConvertFrom-Json
$cmdList = [Guid]$guids.EMI_PAY_Commands
$reqList = [Guid]$guids.EMI_PAY_Requests

function New-Key([string]$Prefix) {
    return '{0}-{1:yyyyMMddHHmmss}-{2}' -f $Prefix, (Get-Date).ToUniversalTime(), ([guid]::NewGuid().ToString('N').Substring(0, 6))
}

function Add-Phase1Command {
    param(
        [string]$Type,
        [hashtable]$Payload,
        [string]$RequestKeyValue = '',
        [string]$StepInstanceKey = ''
    )
    $ck = New-Key 'CMD'
    $values = @{
        Title           = "P1-$Type-$ck"
        CommandKey      = $ck
        CommandType     = $Type
        PayloadJson     = ($Payload | ConvertTo-Json -Compress -Depth 6)
        State           = 'Pending'
        DedupeKey       = "$Type-$ck"
        RequestKey      = $RequestKeyValue
        StepInstanceKey = $StepInstanceKey
    }
    $item = Add-PnPListItem -List $cmdList -Values $values -Connection $connection
    Write-Host "Enqueued $Type id=$($item.Id) CommandKey=$ck RequestKey=$RequestKeyValue" -ForegroundColor Cyan
    return [pscustomobject]@{
        Id          = $item.Id
        CommandKey  = $ck
        RequestKey  = $RequestKeyValue
        CommandType = $Type
    }
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

function Wait-CommandSucceeded([int]$Id, [int]$Seconds) {
    $deadline = (Get-Date).AddSeconds([Math]::Max(5, $Seconds))
    do {
        Start-Sleep -Seconds 5
        $item = Get-PnPListItem -List $cmdList -Id $Id -Connection $connection
        $state = [string]$item.FieldValues['State']
        Write-Host "  Command id=$Id State=$state" -ForegroundColor DarkGray
        if ($state -in @('Succeeded', 'Rejected', 'Failed')) {
            return $state
        }
    } while ((Get-Date) -lt $deadline)
    return 'Timeout'
}

$created = $null

if ($Step -in @('Create', 'HappyPath')) {
    $ckHint = New-Key 'CMD'
    # RequestKey is assigned by Flow as PAY-{CommandKey}; we leave RequestKey blank on CREATE
    $created = Add-Phase1Command -Type 'CREATE_REQUEST' -Payload @{
        title           = 'Phase1 demo SPV'
        createdOUCode   = 'OU_BPCM1'
        creatorUPN      = $CreatorUPN
        paymentTypeCode = 'SPV_PAYMENT'
        amount          = 1000000
        explanation     = 'Phase1 happy path'
    }
    if ($Step -eq 'Create') {
        Write-Host "Flow se dat RequestKey = PAY-$($created.CommandKey)" -ForegroundColor Green
        Write-Host "Sau khi Succeeded, dung -RequestKey 'PAY-$($created.CommandKey)' cho Submit/Decide/Confirm." -ForegroundColor Yellow
        return
    }
    $state = Wait-CommandSucceeded -Id $created.Id -Seconds $WaitSeconds
    if ($state -ne 'Succeeded') { throw "CREATE did not Succeed (State=$state). Check Flow Run History." }
    $RequestKey = "PAY-$($created.CommandKey)"
    $master = Get-Master -Key $RequestKey
    if (-not $master) { throw "Master not found for $RequestKey" }
    Write-Host "Master OK Status=$($master.FieldValues['Status']) Step=$($master.FieldValues['CurrentStepKey'])" -ForegroundColor Green
}

if ([string]::IsNullOrWhiteSpace($RequestKey)) {
    throw 'RequestKey is required for Submit/DecidePass/ConfirmPayment (or use -Step HappyPath).'
}

if ($Step -in @('Submit', 'HappyPath')) {
    $sub = Add-Phase1Command -Type 'SUBMIT' -RequestKeyValue $RequestKey -Payload @{
        actorUPN            = $CreatorUPN
        expectedStepKey     = 'BPCM1_PREPARE'
        expectedReviewRound = 1
    }
    if ($Step -eq 'HappyPath') {
        $state = Wait-CommandSucceeded -Id $sub.Id -Seconds $WaitSeconds
        if ($state -ne 'Succeeded') { throw "SUBMIT failed: $state" }
    }
    elseif ($Step -eq 'Submit') { return }
}

if ($Step -in @('DecidePass', 'HappyPath')) {
    $passCount = if ($Step -eq 'HappyPath') { 4 } else { 1 }
    for ($i = 1; $i -le $passCount; $i++) {
        $master = Get-Master -Key $RequestKey
        if (-not $master) { throw "Master missing: $RequestKey" }
        $cur = [string]$master.FieldValues['CurrentStepKey']
        $sik = [string]$master.FieldValues['CurrentStepInstanceKey']
        $round = [int]$master.FieldValues['ReviewRound']
        Write-Host "DECIDE PASS at $cur (round $round)" -ForegroundColor Cyan
        $dec = Add-Phase1Command -Type 'DECIDE' -RequestKeyValue $RequestKey -StepInstanceKey $sik -Payload @{
            actorUPN                 = $ActorUPN
            decision                 = 'PASS'
            note                     = "Phase1 pass #$i"
            expectedStepKey          = $cur
            expectedStepInstanceKey  = $sik
            expectedReviewRound      = $round
        }
        if ($Step -eq 'HappyPath') {
            $state = Wait-CommandSucceeded -Id $dec.Id -Seconds $WaitSeconds
            if ($state -ne 'Succeeded') { throw "DECIDE failed at $cur : $state" }
        }
        else {
            return
        }
    }
}

if ($Step -in @('ConfirmPayment', 'HappyPath')) {
    $master = Get-Master -Key $RequestKey
    if (-not $master) { throw "Master missing: $RequestKey" }
    $sik = [string]$master.FieldValues['CurrentStepInstanceKey']
    $conf = Add-Phase1Command -Type 'CONFIRM_PAYMENT' -RequestKeyValue $RequestKey -StepInstanceKey $sik -Payload @{
        actorUPN                = $ActorUPN
        expectedStepKey         = 'TCKT_PAY'
        expectedStepInstanceKey = $sik
    }
    if ($Step -eq 'HappyPath') {
        $state = Wait-CommandSucceeded -Id $conf.Id -Seconds $WaitSeconds
        if ($state -ne 'Succeeded') { throw "CONFIRM_PAYMENT failed: $state" }
        $master = Get-Master -Key $RequestKey
        Write-Host "DONE RequestKey=$RequestKey Status=$($master.FieldValues['Status']) Step=$($master.FieldValues['CurrentStepKey']) PaidAt=$($master.FieldValues['PaidAt'])" -ForegroundColor Green
    }
}
