# EMI PAY Dynamic Permission V1 — plan + apply item/folder ACL per RequestKey.
# Does NOT change list-level RBAC V1.9.1. Requires Connect-PnPOnline as SYSADM/FLOW-SVC.
Set-StrictMode -Off

function Get-EmiPayField {
    param($Item, [string]$Name)
    if ($null -eq $Item) { return $null }
    if ($Item.FieldValues -and $Item.FieldValues.ContainsKey($Name)) {
        return $Item.FieldValues[$Name]
    }
    $p = $Item.PSObject.Properties[$Name]
    if ($null -ne $p) { return $p.Value }
    return $null
}

function Get-EmiPayItemId {
    param($Item)
    $id = Get-EmiPayField $Item 'ID'
    if ($null -eq $id) { $id = Get-EmiPayField $Item 'Id' }
    if ($null -eq $id) { return $null }
    return [int]$id
}

function Normalize-EmiPayUpn {
    param([string]$Upn)
    if ([string]::IsNullOrWhiteSpace($Upn)) { return $null }
    return $Upn.Trim().ToLowerInvariant()
}

function Test-EmiPayGrantableUpn {
    param([string]$Upn)
    $u = Normalize-EmiPayUpn $Upn
    if (-not $u) { return $false }
    if ($u -eq 'to_fill' -or $u -eq 'admin@local') { return $false }
    if ($u -match '@local$') { return $false }
    if ($u -notmatch '@') { return $false }
    return $true
}

function Get-EmiPayRoleDefinitionName {
    param([ValidateSet('Read', 'Contribute')][string]$Role)
    # Site CECM tiếng Việt: "Đọc" / "Đóng góp" — resolve bằng RoleTypeKind, không hardcode EN.
    $web = Get-PnPWeb -Includes RoleDefinitions
    $kind = if ($Role -eq 'Contribute') { 'Contributor' } else { 'Reader' }
    foreach ($rd in @($web.RoleDefinitions)) {
        if ("$($rd.RoleTypeKind)" -eq $kind) { return [string]$rd.Name }
    }
    # Fallback common names
    if ($Role -eq 'Contribute') { return 'Contribute' }
    return 'Read'
}

function Get-EmiPayManagerUpn {
    param(
        [Guid]$OrgUnitsListId,
        [string]$OuCode
    )
    if ([string]::IsNullOrWhiteSpace($OuCode)) { return $null }
    $esc = $OuCode.Replace("'", "''")
    $rows = Get-PnPListItem -List $OrgUnitsListId -PageSize 50 `
        -Query "<View><Query><Where><Eq><FieldRef Name='OUCode'/><Value Type='Text'>$esc</Value></Eq></Where></Query></View>"
    foreach ($r in @($rows)) {
        $upn = Normalize-EmiPayUpn (Get-EmiPayField $r 'ManagerUPN')
        if ($upn) { return $upn }
    }
    return $null
}

function Ensure-EmiPayDocsWorkingFolder {
    param([string]$RequestKey)
    $lib = 'EMI_PAY_DocsWorking'
    $folderServer = "$lib/$RequestKey"
    $existing = Get-PnPFolder -Url $folderServer -ErrorAction SilentlyContinue
    if ($null -eq $existing) {
        Add-PnPFolder -Name $RequestKey -Folder $lib | Out-Null
    }
    return $folderServer
}

function New-EmiPayAclGrant {
    param(
        [string]$PrincipalUpn,
        [ValidateSet('Item', 'Folder')][string]$TargetKind,
        [string]$ListName,
        [string]$TargetKey,
        [ValidateSet('Read', 'Contribute')][string]$Role
    )
    [pscustomobject]@{
        PrincipalUpn = $PrincipalUpn
        TargetKind   = $TargetKind
        ListName     = $ListName
        TargetKey    = $TargetKey
        Role         = $Role
    }
}

function Build-EmiPayDynAclPlan {
    <#
    .SYNOPSIS
      Desired-state ACL plan for one RequestKey from master + org config.
    #>
    param(
        [Parameter(Mandatory)][string]$RequestKey,
        [Parameter(Mandatory)]$Guids,
        [ValidateSet('Auto', 'OnCreate', 'OnSubmit', 'OnAccept', 'OnDecidePass', 'OnDecideReject', 'OnConfirm')]
        [string]$Event = 'Auto'
    )

    $reqList = [Guid]$Guids.EMI_PAY_Requests
    $ouList = [Guid]$Guids.EMI_PAY_OrgUnits
    $wiList = [Guid]$Guids.EMI_PAY_WorkItems
    $asgList = [Guid]$Guids.EMI_PAY_Assignments

    $esc = $RequestKey.Replace("'", "''")
    $masters = @(Get-PnPListItem -List $reqList -PageSize 5 `
            -Query "<View><Query><Where><Eq><FieldRef Name='RequestKey'/><Value Type='Text'>$esc</Value></Eq></Where></Query></View>")
    if ($masters.Count -lt 1) { throw "RequestKey not found: $RequestKey" }
    $master = $masters[0]
    $masterId = Get-EmiPayItemId $master

    $creator = Normalize-EmiPayUpn (Get-EmiPayField $master 'CreatorUPN')
    $status = [string](Get-EmiPayField $master 'Status')
    $step = [string](Get-EmiPayField $master 'CurrentStepKey')
    $currentOu = [string](Get-EmiPayField $master 'CurrentOUCode')
    $createdOu = [string](Get-EmiPayField $master 'CreatedOUCode')
    $locked = $false
    $lockVal = Get-EmiPayField $master 'IsLocked'
    if ($lockVal -eq $true -or "$lockVal" -eq '1') { $locked = $true }

    # Fallback: SharePoint Author when CreatorUPN is pilot placeholder (admin@local)
    $authorUpn = $null
    try {
        $author = Get-EmiPayField $master 'Author'
        if ($author -and $author.Email) { $authorUpn = Normalize-EmiPayUpn $author.Email }
        elseif ($author -and $author.LookupValue -match '@') { $authorUpn = Normalize-EmiPayUpn $author.LookupValue }
    }
    catch { }
    if (-not (Test-EmiPayGrantableUpn $creator) -and (Test-EmiPayGrantableUpn $authorUpn)) {
        $creator = $authorUpn
    }

    if ($Event -eq 'OnConfirm' -or $status -match 'Archiv|Complete|Cancel' -or $locked) {
        $docsRoleCreator = 'Read'
        $forceReadOnly = $true
    }
    elseif ($Event -eq 'OnDecideReject' -or $status -match 'Draft|Returned' -or $step -eq 'BPCM1_PREPARE') {
        $docsRoleCreator = 'Contribute'
        $forceReadOnly = $false
    }
    elseif ($Event -eq 'OnCreate') {
        $docsRoleCreator = 'Contribute'
        $forceReadOnly = $false
    }
    else {
        $docsRoleCreator = 'Read'
        $forceReadOnly = $false
    }

    # UPN -> docs role (Items always Read for users)
    $docsMap = @{}
    if (Test-EmiPayGrantableUpn $creator) { $docsMap[$creator] = $docsRoleCreator }

    $mgrCurrent = Get-EmiPayManagerUpn -OrgUnitsListId $ouList -OuCode $currentOu
    $mgrCreated = Get-EmiPayManagerUpn -OrgUnitsListId $ouList -OuCode $createdOu
    foreach ($m in @($mgrCurrent, $mgrCreated)) {
        if (-not (Test-EmiPayGrantableUpn $m)) { continue }
        if (-not $docsMap.ContainsKey($m)) { $docsMap[$m] = 'Read' }
        elseif ($forceReadOnly) { $docsMap[$m] = 'Read' }
    }

    # AwaitingManager: ensure created-OU manager present
    if ($status -eq 'AwaitingManager' -and $mgrCreated) {
        if (-not $docsMap.ContainsKey($mgrCreated)) { $docsMap[$mgrCreated] = 'Read' }
    }

    # Open WI assignments
    $wis = @(Get-PnPListItem -List $wiList -PageSize 200 `
            -Query "<View><Query><Where><Eq><FieldRef Name='RequestKey'/><Value Type='Text'>$esc</Value></Eq></Where></Query></View>")
    $openWiKeys = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($wi in $wis) {
        $st = [string](Get-EmiPayField $wi 'State')
        $sik = [string](Get-EmiPayField $wi 'StepInstanceKey')
        if ($st -match 'Open|Await' -and $sik) { [void]$openWiKeys.Add($sik) }
        $respOu = [string](Get-EmiPayField $wi 'ResponsibleOUCode')
        if ($st -match 'Open|Await' -and $respOu) {
            $m = Get-EmiPayManagerUpn -OrgUnitsListId $ouList -OuCode $respOu
            if ((Test-EmiPayGrantableUpn $m) -and -not $docsMap.ContainsKey($m)) { $docsMap[$m] = 'Read' }
        }
    }

    try {
        $asgs = @(Get-PnPListItem -List $asgList -PageSize 200 `
                -Query "<View><Query><Where><Eq><FieldRef Name='RequestKey'/><Value Type='Text'>$esc</Value></Eq></Where></Query></View>")
        foreach ($a in $asgs) {
            $assignee = Normalize-EmiPayUpn (Get-EmiPayField $a 'AssigneeUPN')
            if (-not $assignee) { $assignee = Normalize-EmiPayUpn (Get-EmiPayField $a 'MemberUPN') }
            if (-not (Test-EmiPayGrantableUpn $assignee)) { continue }
            $sik = [string](Get-EmiPayField $a 'StepInstanceKey')
            $role = 'Read'
            if (-not $forceReadOnly -and $sik -and $openWiKeys.Contains($sik) -and $step -eq 'TCKT_PAY') {
                $role = 'Contribute'
            }
            if (-not $docsMap.ContainsKey($assignee) -or ($role -eq 'Contribute' -and $docsMap[$assignee] -eq 'Read')) {
                $docsMap[$assignee] = $role
            }
            elseif (-not $docsMap.ContainsKey($assignee)) {
                $docsMap[$assignee] = 'Read'
            }
        }
    }
    catch {
        # Assignments list may be empty / field drift — ignore
    }

    if ($forceReadOnly) {
        foreach ($k in @($docsMap.Keys)) { $docsMap[$k] = 'Read' }
    }

    $itemLists = @(
        'EMI_PAY_Requests',
        'EMI_PAY_WorkItems',
        'EMI_PAY_Assignments',
        'EMI_PAY_ChecklistItems',
        'EMI_PAY_DocumentIndex',
        'EMI_PAY_ActivityPublic',
        'EMI_PAY_StepReviews'
    )

    $grants = [System.Collections.Generic.List[object]]::new()
    $folderPath = "EMI_PAY_DocsWorking/$RequestKey"

    foreach ($upn in ($docsMap.Keys | Sort-Object)) {
        foreach ($ln in $itemLists) {
            $grants.Add((New-EmiPayAclGrant -PrincipalUpn $upn -TargetKind Item -ListName $ln -TargetKey $RequestKey -Role Read))
        }
        $grants.Add((New-EmiPayAclGrant -PrincipalUpn $upn -TargetKind Folder -ListName 'EMI_PAY_DocsWorking' -TargetKey $folderPath -Role $docsMap[$upn]))
    }

    [pscustomobject]@{
        RequestKey     = $RequestKey
        MasterId       = $masterId
        Status         = $status
        CurrentStepKey = $step
        CurrentOUCode  = $currentOu
        CreatorUPN     = $creator
        Event          = $Event
        Guids          = $Guids
        Principals     = @($docsMap.GetEnumerator() | ForEach-Object { [pscustomobject]@{ UPN = $_.Key; DocsRole = $_.Value } })
        Grants         = $grants
    }
}

function Set-EmiPayItemReadForRequest {
    param(
        [string]$ListName,
        $ListId,
        [string]$RequestKey,
        [string[]]$Upns,
        [ValidateSet('Validate', 'Apply')][string]$Mode
    )
    $listRef = if ($ListId) { [Guid]$ListId } else { $ListName }
    $esc = $RequestKey.Replace("'", "''")
    $items = @(Get-PnPListItem -List $listRef -PageSize 500 `
            -Query "<View><Query><Where><Eq><FieldRef Name='RequestKey'/><Value Type='Text'>$esc</Value></Eq></Where></Query><RowLimit>500</RowLimit></View>" `
            -ErrorAction SilentlyContinue)
    if ($ListName -eq 'EMI_PAY_Requests' -and $items.Count -eq 0) {
        throw "No Request item for $RequestKey"
    }
    $rows = [System.Collections.Generic.List[object]]::new()
    foreach ($it in $items) {
        $id = Get-EmiPayItemId $it
        foreach ($upn in $Upns) {
            $rows.Add([pscustomobject]@{
                    Action = 'ItemRead'; List = $ListName; Id = $id; User = $upn; Mode = $Mode
                })
            if ($Mode -eq 'Apply') {
                $roleName = Get-EmiPayRoleDefinitionName -Role Read
                Set-PnPListItemPermission -List $listRef -Identity $id -User $upn -AddRole $roleName -ErrorAction Stop
            }
        }
    }
    return $rows
}

function Set-EmiPayFolderRole {
    param(
        [string]$FolderServerRelative,
        $DocsWorkingListId,
        [string]$Upn,
        [ValidateSet('Read', 'Contribute')][string]$Role,
        [ValidateSet('Validate', 'Apply')][string]$Mode
    )
    $listRef = if ($DocsWorkingListId) { [Guid]$DocsWorkingListId } else { 'EMI_PAY_DocsWorking' }
    $row = [pscustomobject]@{
        Action = 'FolderRole'; Folder = $FolderServerRelative; User = $Upn; Role = $Role; Mode = $Mode
    }
    if ($Mode -eq 'Apply') {
        $readName = Get-EmiPayRoleDefinitionName -Role Read
        $contribName = Get-EmiPayRoleDefinitionName -Role Contribute
        $addName = if ($Role -eq 'Contribute') { $contribName } else { $readName }
        try {
            Set-PnPFolderPermission -List $listRef -Identity $FolderServerRelative `
                -User $Upn -RemoveRole $contribName -ErrorAction SilentlyContinue
        }
        catch { }
        try {
            Set-PnPFolderPermission -List $listRef -Identity $FolderServerRelative `
                -User $Upn -RemoveRole $readName -ErrorAction SilentlyContinue
        }
        catch { }
        Set-PnPFolderPermission -List $listRef -Identity $FolderServerRelative `
            -User $Upn -AddRole $addName -ErrorAction Stop
    }
    return $row
}

function Set-EmiPayListContributeForUsers {
    param(
        [string]$ListName,
        $ListId,
        [string[]]$Upns,
        [ValidateSet('Validate', 'Apply')][string]$Mode
    )
    $listRef = if ($ListId) { [Guid]$ListId } else { $ListName }
    $rows = [System.Collections.Generic.List[object]]::new()
    $contribName = Get-EmiPayRoleDefinitionName -Role Contribute
    foreach ($upn in $Upns) {
        if (-not (Test-EmiPayGrantableUpn $upn)) { continue }
        $rows.Add([pscustomobject]@{
                Action = 'ListContribute'; List = $ListName; Id = ''; User = $upn; Role = 'Contribute'; Mode = $Mode
            })
        if ($Mode -eq 'Apply') {
            Set-PnPListPermission -List $listRef -User $upn -AddRole $contribName -ErrorAction Stop
        }
    }
    return $rows
}

function Invoke-EmiPayDynAclPlan {
    param(
        [Parameter(Mandatory)]$Plan,
        [ValidateSet('Validate', 'Apply')][string]$Mode = 'Validate'
    )

    $report = [System.Collections.Generic.List[object]]::new()
    $upns = @($Plan.Principals | ForEach-Object { $_.UPN } | Where-Object { Test-EmiPayGrantableUpn $_ } | Select-Object -Unique)
    $guids = $Plan.Guids

    if ($upns.Count -lt 1) {
        $report.Add([pscustomobject]@{
                Action = 'Skip'; List = ''; Id = ''; User = ''; Mode = $Mode
                Error  = 'No grantable UPN (CreatorUPN/Manager still placeholder). Seed real UPN then re-run.'
            })
        return $report
    }

    if ($Mode -eq 'Apply') {
        Ensure-EmiPayDocsWorkingFolder -RequestKey $Plan.RequestKey | Out-Null
        $report.Add([pscustomobject]@{
                Action = 'EnsureFolder'; Folder = "EMI_PAY_DocsWorking/$($Plan.RequestKey)"; User = ''; Role = ''; Mode = $Mode
            })
    }
    else {
        $report.Add([pscustomobject]@{
                Action = 'EnsureFolder'; Folder = "EMI_PAY_DocsWorking/$($Plan.RequestKey)"; User = ''; Role = ''; Mode = $Mode
            })
    }

    # SPFx ghi chú / đánh giá: Add item StepReviews (USER_NOTE + Pass/Fail) theo UPN hồ sơ.
    try {
        $revRows = Set-EmiPayListContributeForUsers -ListName 'EMI_PAY_StepReviews' `
            -ListId $guids.EMI_PAY_StepReviews -Upns $upns -Mode $Mode
        foreach ($r in $revRows) { $report.Add($r) }
    }
    catch {
        $report.Add([pscustomobject]@{
                Action = 'ListContribute'; List = 'EMI_PAY_StepReviews'; Id = ''; User = ($upns -join ','); Mode = $Mode
                Error  = $_.Exception.Message
            })
    }

    $itemLists = @(
        @{ Name = 'EMI_PAY_Requests'; Id = $guids.EMI_PAY_Requests },
        @{ Name = 'EMI_PAY_WorkItems'; Id = $guids.EMI_PAY_WorkItems },
        @{ Name = 'EMI_PAY_Assignments'; Id = $guids.EMI_PAY_Assignments },
        @{ Name = 'EMI_PAY_ChecklistItems'; Id = $guids.EMI_PAY_ChecklistItems },
        @{ Name = 'EMI_PAY_DocumentIndex'; Id = $guids.EMI_PAY_DocumentIndex },
        @{ Name = 'EMI_PAY_ActivityPublic'; Id = $guids.EMI_PAY_ActivityPublic },
        @{ Name = 'EMI_PAY_StepReviews'; Id = $guids.EMI_PAY_StepReviews }
    )

    foreach ($ln in $itemLists) {
        try {
            $rows = Set-EmiPayItemReadForRequest -ListName $ln.Name -ListId $ln.Id -RequestKey $Plan.RequestKey -Upns $upns -Mode $Mode
            foreach ($r in $rows) { $report.Add($r) }
        }
        catch {
            $report.Add([pscustomobject]@{
                    Action = 'ItemRead'; List = $ln.Name; Id = ''; User = ($upns -join ','); Mode = $Mode; Error = $_.Exception.Message
                })
        }
    }

    $folder = "EMI_PAY_DocsWorking/$($Plan.RequestKey)"
    foreach ($p in $Plan.Principals) {
        if (-not (Test-EmiPayGrantableUpn $p.UPN)) { continue }
        try {
            $row = Set-EmiPayFolderRole -FolderServerRelative $folder -DocsWorkingListId $guids.EMI_PAY_DocsWorking `
                -Upn $p.UPN -Role $p.DocsRole -Mode $Mode
            $report.Add($row)
        }
        catch {
            $report.Add([pscustomobject]@{
                    Action = 'FolderRole'; Folder = $folder; User = $p.UPN; Role = $p.DocsRole; Mode = $Mode; Error = $_.Exception.Message
                })
        }
    }

    return $report
}

Export-ModuleMember -Function @(
    'Build-EmiPayDynAclPlan',
    'Invoke-EmiPayDynAclPlan',
    'Ensure-EmiPayDocsWorkingFolder',
    'Get-EmiPayManagerUpn',
    'Normalize-EmiPayUpn',
    'Test-EmiPayGrantableUpn'
)
