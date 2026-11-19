$ErrorActionPreference = 'Stop'
Import-Module PnP.PowerShell -ErrorAction Stop
$null = Get-PnPConnection

$cmdList = [Guid]'e16b76dc-7686-43e9-b232-18c80e2b31d2'
$reqList = [Guid]'12b3051d-7642-4f90-a39d-5364df561fbf'
$wiList  = [Guid]'e21ef6e7-ee31-466a-be3b-65ae30ca7722'
$rk = 'PAY-CMD-20261112040144-1c123c'

Write-Host '=== Commands 9-13 ===' -ForegroundColor Cyan
foreach ($id in 9..13) {
    try {
        $c = Get-PnPListItem -List $cmdList -Id $id
        $fv = $c.FieldValues
        Write-Host ("id={0} Type={1,-16} State={2,-12} Err={3}" -f $id, $fv['CommandType'], $fv['State'], $fv['ErrorMessage'])
    } catch {
        Write-Host "id=$id missing"
    }
}

$escaped = [System.Security.SecurityElement]::Escape($rk)
$q = "<View><Query><Where><Eq><FieldRef Name='RequestKey' /><Value Type='Text'>$escaped</Value></Eq></Where></Query><RowLimit>50</RowLimit></View>"
$m = @(Get-PnPListItem -List $reqList -Query $q)[0]
$fv = $m.FieldValues
Write-Host ''
Write-Host '=== Master ===' -ForegroundColor Cyan
Write-Host ("Status={0} Step={1} OU={2} PaidAt={3} ArchiveStatus={4}" -f `
    $fv['Status'], $fv['CurrentStepKey'], $fv['CurrentOUCode'], $fv['PaidAt'], $fv['ArchiveStatus'])

Write-Host ''
Write-Host '=== WorkItems ===' -ForegroundColor Cyan
$wis = @(Get-PnPListItem -List $wiList -Query $q) | Sort-Object Id
foreach ($w in $wis) {
    $f = $w.FieldValues
    Write-Host ("WI Id={0} Step={1,-16} State={2,-16} Decision={3}" -f $w.Id, $f['StepKey'], $f['State'], $f['Decision'])
}

Write-Host ''
$step = [string]$fv['CurrentStepKey']
$status = [string]$fv['Status']
if ($step -eq 'SYSTEM_ARCHIVE' -and $status -eq 'Archiving') {
    Write-Host 'PHASE1 HAPPY PATH COMPLETE' -ForegroundColor Green
} elseif ($step -eq 'TCKT_PAY' -or $status -eq 'PendingPayment') {
    Write-Host 'NEXT: ConfirmPayment (neu CMD 13 Rejected/Failed thi enqueue lai ConfirmPayment)' -ForegroundColor Yellow
} elseif ($step -eq 'CHAIR_APPROVE') {
    Write-Host 'NEXT: DecidePass 1 lan -> TCKT_PAY, roi ConfirmPayment' -ForegroundColor Yellow
} elseif ($step -eq 'TCKT_CHECK') {
    Write-Host 'NEXT: DecidePass 2 lan (TCKT->CHAIR->TCKT_PAY), doi tung lan, roi ConfirmPayment' -ForegroundColor Yellow
} elseif ($step -eq 'BPCM3_PRICE') {
    Write-Host 'NEXT: DecidePass 3 lan...' -ForegroundColor Yellow
} else {
    Write-Host "NEXT: xu ly tiep tu Step=$step Status=$status" -ForegroundColor Yellow
}
