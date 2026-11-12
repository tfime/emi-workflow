# Chay trong session da Connect-PnPOnline CECM
$ErrorActionPreference = 'Stop'
Import-Module PnP.PowerShell -ErrorAction Stop
$null = Get-PnPConnection

$cmdList = [Guid]'e16b76dc-7686-43e9-b232-18c80e2b31d2'
$reqList = [Guid]'12b3051d-7642-4f90-a39d-5364df561fbf'
$wiList  = [Guid]'e21ef6e7-ee31-466a-be3b-65ae30ca7722'
$rk = 'PAY-CMD-20261112040144-1c123c'

# Latest SUBMIT command(s)
foreach ($id in @(8, 7)) {
    try {
        $cmd = Get-PnPListItem -List $cmdList -Id $id
        $fv = $cmd.FieldValues
        Write-Host ("CMD id={0} Type={1} State={2} Key={3} Req={4} Err={5}" -f `
            $id, $fv['CommandType'], $fv['State'], $fv['CommandKey'], $fv['RequestKey'], $fv['ErrorMessage'])
    } catch {
        Write-Host "CMD id=$id not found"
    }
}

$escaped = [System.Security.SecurityElement]::Escape($rk)
$q = "<View><Query><Where><Eq><FieldRef Name='RequestKey' /><Value Type='Text'>$escaped</Value></Eq></Where></Query><RowLimit>20</RowLimit></View>"

$masters = @(Get-PnPListItem -List $reqList -Query $q)
Write-Host ("Master count=$($masters.Count)")
foreach ($m in $masters) {
    $fv = $m.FieldValues
    Write-Host ("Master Id={0} Status={1} Step={2} OU={3} SIK={4} Locked={5}" -f `
        $m.Id, $fv['Status'], $fv['CurrentStepKey'], $fv['CurrentOUCode'], $fv['CurrentStepInstanceKey'], $fv['IsLocked'])
}

$wis = @(Get-PnPListItem -List $wiList -Query $q)
Write-Host ("WorkItems count=$($wis.Count)")
foreach ($w in ($wis | Sort-Object Id)) {
    $fv = $w.FieldValues
    Write-Host ("WI Id={0} Step={1} State={2} Decision={3} SIK={4}" -f `
        $w.Id, $fv['StepKey'], $fv['State'], $fv['Decision'], $fv['StepInstanceKey'])
}

Write-Host ''
Write-Host 'PASS neu:'
Write-Host '  CMD id=8 State=Succeeded'
Write-Host '  Master Status=InReview Step=BPCM2_TECH'
Write-Host '  WI BPCM1_PREPARE State=Completed'
Write-Host '  WI BPCM2_TECH State=InReview'
