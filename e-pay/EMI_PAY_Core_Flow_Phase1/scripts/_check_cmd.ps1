Import-Module PnP.PowerShell -ErrorAction Stop
try { $null = Get-PnPConnection } catch { Write-Host 'NO_CONNECTION'; exit 2 }
$web = Get-PnPWeb -Includes Url
Write-Host "Connected: $($web.Url)"
$cmdList = [Guid]'e16b76dc-7686-43e9-b232-18c80e2b31d2'
$reqList = [Guid]'12b3051d-7642-4f90-a39d-5364df561fbf'
$items = Get-PnPListItem -List $cmdList -PageSize 50 | Sort-Object Id -Descending | Select-Object -First 8
foreach ($i in $items) {
  $fv = $i.FieldValues
  Write-Host ("CMD id=$($i.Id) Type=$($fv['CommandType']) State=$($fv['State']) Key=$($fv['CommandKey']) Req=$($fv['RequestKey']) Err=$($fv['ErrorMessage'])")
}
$rk = 'PAY-CMD-20261112035921-4b8dfe'
$query = @"
<View>
  <Query>
    <Where>
      <Eq><FieldRef Name='RequestKey' /><Value Type='Text'>$rk</Value></Eq>
    </Where>
  </Query>
  <RowLimit>2</RowLimit>
</View>
"@
$m = @(Get-PnPListItem -List $reqList -Query $query)
Write-Host "Master count for $rk = $($m.Count)"
if ($m.Count -gt 0) {
  Write-Host ("Master Status=$($m[0].FieldValues['Status']) Step=$($m[0].FieldValues['CurrentStepKey'])")
}
