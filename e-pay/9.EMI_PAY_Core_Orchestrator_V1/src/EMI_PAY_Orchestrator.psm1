# EMI PAY Core Orchestrator V1 — code-first command processor
Set-StrictMode -Version Latest

$script:SiteUrl = 'https://emicomvn.sharepoint.com/sites/cecm'
$script:ListGuids = $null
$script:SeedMeta = $null
$script:Connection = $null

function Initialize-EmiPayOrchestrator {
    [CmdletBinding()]
    param(
        [string]$Root = (Split-Path $PSScriptRoot -Parent),
        [string]$SiteUrl = 'https://emicomvn.sharepoint.com/sites/cecm'
    )
    Import-Module PnP.PowerShell -ErrorAction Stop
    $script:Connection = Get-PnPConnection -ErrorAction Stop
    $web = Get-PnPWeb -Connection $script:Connection -Includes Url
    if ($web.Url.TrimEnd('/') -ine $SiteUrl.TrimEnd('/')) {
        throw "Safety stop: connected [$($web.Url)] != expected [$SiteUrl]"
    }
    $script:SiteUrl = $SiteUrl
    $script:ListGuids = Get-Content -LiteralPath (Join-Path $Root 'config\list-guids.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $script:SeedMeta = Get-Content -LiteralPath (Join-Path $Root 'config\seed-config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Get-EmiListId([string]$Name) {
    return [Guid]$script:ListGuids.$Name
}

function New-EmiKey([string]$Prefix) {
    return '{0}-{1:yyyyMMddHHmmss}-{2}' -f $Prefix, (Get-Date).ToUniversalTime(), ([guid]::NewGuid().ToString('N').Substring(0, 8))
}

function Get-EmiItemId {
    param($Item)
    if ($null -eq $Item) { return $null }
    # Unwrap accidental arrays (PowerShell pipeline / @() flattening quirks)
    while ($Item -is [System.Array] -or $Item -is [System.Collections.ArrayList] -or $Item -is [System.Collections.Generic.List[object]]) {
        if ($Item.Count -eq 0) { return $null }
        if ($Item.Count -gt 1) {
            throw "Expected one SharePoint item for Identity, got $($Item.Count)."
        }
        $Item = $Item[0]
    }
    if ($Item.FieldValues -and $Item.FieldValues.ContainsKey('ID')) {
        return [int]$Item.FieldValues['ID']
    }
    $prop = $Item.PSObject.Properties['Id']
    if ($null -ne $prop -and $null -ne $prop.Value) {
        return [int]$prop.Value
    }
    throw 'Cannot resolve list item Id.'
}

function Get-EmiItemsEq {
    param([Guid]$ListId, [string]$Field, [string]$Value, [int]$RowLimit = 50)
    $escaped = [System.Security.SecurityElement]::Escape($Value)
    $query = "<View><Query><Where><Eq><FieldRef Name='$Field' /><Value Type='Text'>$escaped</Value></Eq></Where></Query><RowLimit>$RowLimit</RowLimit></View>"
    $bag = [System.Collections.Generic.List[object]]::new()
    $page = Get-PnPListItem -List $ListId -Query $query -Connection $script:Connection
    if ($null -eq $page) { return $bag }
    foreach ($row in @($page)) {
        if ($null -eq $row) { continue }
        if ($null -eq $row.FieldValues) { continue }
        $bag.Add($row)
    }
    return $bag
}

function Get-EmiPayload($Command) {
    $raw = [string]$Command.FieldValues['PayloadJson']
    if ([string]::IsNullOrWhiteSpace($raw)) { return [pscustomobject]@{} }
    return ($raw | ConvertFrom-Json)
}

function Set-EmiCommandState {
    param($Command, [string]$State, [string]$ErrorMessage = $null)
    $values = @{
        State       = $State
        ProcessedAt = (Get-Date).ToUniversalTime()
    }
    if ($ErrorMessage) { $values['ErrorMessage'] = $ErrorMessage }
    elseif ($State -eq 'Succeeded') { $values['ErrorMessage'] = '' }
    Set-PnPListItem -List (Get-EmiListId 'EMI_PAY_Commands') -Identity (Get-EmiItemId $Command) -Values $values -Connection $script:Connection | Out-Null
}

function Add-EmiActivity {
    param(
        [string]$ListName,
        [string]$RequestKey,
        [string]$EventType,
        [string]$ActorUPN,
        [string]$FromState,
        [string]$ToState,
        [string]$Note,
        [object]$Details,
        [string]$StepInstanceKey = '',
        [int]$ReviewRound = 0,
        [string]$OUCode = ''
    )
    $activityKey = New-EmiKey 'ACT'
    $detailsJson = if ($Details) { $Details | ConvertTo-Json -Compress -Depth 6 } else { '{}' }
    # Live schema: Public has FromState/ToState/Note/DetailsJson; Internal has OUCode/FieldName/OldValue/NewValue/Reason (no DetailsJson).
    if ($ListName -eq 'EMI_PAY_ActivityInternal') {
        $values = @{
            Title           = "$EventType-$activityKey"
            RequestKey      = $RequestKey
            ActivityKey     = $activityKey
            StepInstanceKey = $StepInstanceKey
            OUCode          = $OUCode
            ReviewRound     = [double]$ReviewRound
            EventType       = $EventType
            EventTime       = (Get-Date).ToUniversalTime()
            ActorUPN        = $ActorUPN
            FieldName       = 'DetailsJson'
            OldValue        = $FromState
            NewValue        = $detailsJson
            Reason          = $Note
        }
    }
    else {
        $values = @{
            Title           = "$EventType-$activityKey"
            RequestKey      = $RequestKey
            ActivityKey     = $activityKey
            StepInstanceKey = $StepInstanceKey
            ReviewRound     = [double]$ReviewRound
            EventType       = $EventType
            EventTime       = (Get-Date).ToUniversalTime()
            ActorUPN        = $ActorUPN
            FromState       = $FromState
            ToState         = $ToState
            Note            = $Note
            DetailsJson     = $detailsJson
        }
    }
    Add-PnPListItem -List (Get-EmiListId $ListName) -Values $values -Connection $script:Connection | Out-Null
}

function Get-EmiReturnFromStepKey([string]$RequestKey) {
    $items = Get-EmiItemsEq -ListId (Get-EmiListId 'EMI_PAY_ActivityInternal') -Field 'RequestKey' -Value $RequestKey -RowLimit 200
    $returned = @(
        $items |
            Where-Object { $_ -and $_.FieldValues['EventType'] -eq 'RETURNED' } |
            Sort-Object { $_.FieldValues['EventTime'] } -Descending
    )
    if ($returned.Count -eq 0) {
        # Fallback: Public DetailsJson
        $pub = Get-EmiItemsEq -ListId (Get-EmiListId 'EMI_PAY_ActivityPublic') -Field 'RequestKey' -Value $RequestKey -RowLimit 200
        $returned = @(
            $pub |
                Where-Object { $_ -and $_.FieldValues['EventType'] -eq 'RETURNED' } |
                Sort-Object { $_.FieldValues['EventTime'] } -Descending
        )
        if ($returned.Count -eq 0) { return $null }
        $details = [string]$returned[0].FieldValues['DetailsJson']
    }
    else {
        $details = [string]$returned[0].FieldValues['NewValue']
        if ([string]::IsNullOrWhiteSpace($details)) {
            $details = [string]$returned[0].FieldValues['DetailsJson']
        }
    }
    if ([string]::IsNullOrWhiteSpace($details)) { return $null }
    $obj = $details | ConvertFrom-Json
    return [string]$obj.returnFromStepKey
}

function Get-EmiStepDef([string]$StepKey) {
    $fromList = @(Get-EmiItemsEq -ListId (Get-EmiListId 'EMI_PAY_WorkflowSteps') -Field 'StepKey' -Value $StepKey -RowLimit 20)
    $hit = @($fromList | Where-Object {
            $null -ne $_ -and
            [string]$_.FieldValues['WorkflowCode'] -eq [string]$script:SeedMeta.workflowCode -and
            [bool]$_.FieldValues['IsActive']
        })[0]
    if ($hit) {
        return [pscustomobject]@{
            StepKey   = [string]$hit.FieldValues['StepKey']
            StepOrder = [int]$hit.FieldValues['StepOrder']
            StepName  = [string]$hit.FieldValues['StepName']
            StepKind  = [string]$hit.FieldValues['StepKind']
            IsActive  = [bool]$hit.FieldValues['IsActive']
        }
    }
    return @($script:SeedMeta.workflowSteps | Where-Object { $_.StepKey -eq $StepKey })[0]
}

function Get-EmiRoutePlan($RequestItem) {
    $raw = ''
    if ($RequestItem -and $RequestItem.FieldValues -and $RequestItem.FieldValues.ContainsKey('RoutePlanJson')) {
        $raw = [string]$RequestItem.FieldValues['RoutePlanJson']
    }
    if ([string]::IsNullOrWhiteSpace($raw)) { return [pscustomobject]@{} }
    try { return ($raw | ConvertFrom-Json) } catch { return [pscustomobject]@{} }
}

function ConvertTo-EmiRoutePlanJson($RoutePlan) {
    if ($null -eq $RoutePlan) { return '{}' }
    if ($RoutePlan -is [string]) { return $RoutePlan }
    return ($RoutePlan | ConvertTo-Json -Compress)
}

function Get-EmiRouteOu {
    param($RoutePlan, [string]$StepKey, [string]$Fallback = '')
    if ($RoutePlan -and $RoutePlan.PSObject.Properties.Name -contains $StepKey) {
        $v = [string]$RoutePlan.$StepKey
        if (-not [string]::IsNullOrWhiteSpace($v)) { return $v.Trim() }
    }
    return $Fallback
}

function Resolve-EmiRoutePlan {
    param($Payload, $ExistingRaw = '')
    $plan = @{}
    if (-not [string]::IsNullOrWhiteSpace($ExistingRaw)) {
        try {
            $obj = $ExistingRaw | ConvertFrom-Json
            foreach ($p in $obj.PSObject.Properties) { $plan[$p.Name] = [string]$p.Value }
        } catch {}
    }
    $incoming = $null
    if ($Payload.routePlan) { $incoming = $Payload.routePlan }
    elseif ($Payload.RoutePlan) { $incoming = $Payload.RoutePlan }
    if ($incoming) {
        if ($incoming -is [string]) {
            try { $incoming = $incoming | ConvertFrom-Json } catch { $incoming = $null }
        }
        if ($incoming) {
            foreach ($p in $incoming.PSObject.Properties) {
                if (-not [string]::IsNullOrWhiteSpace([string]$p.Value)) {
                    $plan[$p.Name] = [string]$p.Value
                }
            }
        }
    }
    # Fill missing steps from StepRecipients defaults
    $required = @('BPCM2_TECH', 'BPCM3_PRICE', 'TCKT_CHECK', 'CHAIR_APPROVE', 'TCKT_PAY', 'SYSTEM_ARCHIVE')
    foreach ($sk in $required) {
        if (-not $plan.ContainsKey($sk) -or [string]::IsNullOrWhiteSpace($plan[$sk])) {
            $plan[$sk] = Get-EmiDefaultOu -StepKey $sk
        }
    }
    return [pscustomobject]$plan
}

function Get-EmiDefaultOu {
    param(
        [string]$StepKey,
        [string]$PreferredOU = ''
    )
    if (-not [string]::IsNullOrWhiteSpace($PreferredOU)) {
        return $PreferredOU.Trim()
    }
    $rows = @(Get-EmiItemsEq -ListId (Get-EmiListId 'EMI_PAY_StepRecipients') -Field 'StepKey' -Value $StepKey -RowLimit 50)
    $defaults = @($rows | Where-Object {
            $null -ne $_ -and (
                $_.FieldValues['IsDefault'] -eq $true -or
                $_.FieldValues['IsDefault'] -eq 1 -or
                [string]$_.FieldValues['IsDefault'] -eq '1'
            )
        })
    if ($defaults.Count -gt 0) {
        return [string]$defaults[0].FieldValues['OUCode']
    }
    if ($rows.Count -gt 0) {
        return [string]$rows[0].FieldValues['OUCode']
    }
    $sr = @($script:SeedMeta.stepRecipients | Where-Object { $_.StepKey -eq $StepKey -and $_.IsDefault })[0]
    if (-not $sr) { throw "No StepRecipient for $StepKey (list + seed)" }
    return [string]$sr.OUCode
}

function Get-EmiOrgUnit([string]$OUCode) {
    $items = Get-EmiItemsEq -ListId (Get-EmiListId 'EMI_PAY_OrgUnits') -Field 'OUCode' -Value $OUCode
    if ($items.Count -eq 0) { return $null }
    return $items[0]
}

function Test-EmiActorInOu {
    param([string]$ActorUPN, [string]$OUCode)
    if ([string]::IsNullOrWhiteSpace($ActorUPN)) { return $false }
    $ou = Get-EmiOrgUnit $OUCode
    if ($ou -and [string]$ou.FieldValues['ManagerUPN'] -and ([string]$ou.FieldValues['ManagerUPN'] -ieq $ActorUPN)) {
        return $true
    }
    $members = Get-EmiItemsEq -ListId (Get-EmiListId 'EMI_PAY_OrgMembers') -Field 'OUCode' -Value $OUCode -RowLimit 200
    foreach ($m in $members) {
        if ($null -eq $m) { continue }
        if ([bool]$m.FieldValues['IsActive'] -and [string]$m.FieldValues['MemberUPN'] -ieq $ActorUPN) {
            return $true
        }
    }
    # Pilot: TO_FILL manager + empty members → allow connection operator (demo)
    if ($ou -and [string]$ou.FieldValues['ManagerUPN'] -eq 'TO_FILL' -and $members.Count -eq 0) {
        return $true
    }
    return $false
}

function Get-EmiRequest([string]$RequestKey) {
    $items = Get-EmiItemsEq -ListId (Get-EmiListId 'EMI_PAY_Requests') -Field 'RequestKey' -Value $RequestKey
    if ($items.Count -eq 0) { return $null }
    if ($items.Count -gt 1) { throw "Duplicate RequestKey $RequestKey" }
    return $items[0]
}

function Get-EmiOpenWorkItem {
    param([string]$RequestKey, [string]$StepKey)
    $items = Get-EmiItemsEq -ListId (Get-EmiListId 'EMI_PAY_WorkItems') -Field 'RequestKey' -Value $RequestKey -RowLimit 200
    $open = [System.Collections.Generic.List[object]]::new()
    foreach ($row in $items) {
        if ($null -eq $row) { continue }
        if ($row.FieldValues['StepKey'] -ne $StepKey) { continue }
        if ($row.FieldValues['State'] -in @('Completed', 'Returned', 'Recalled', 'Cancelled')) { continue }
        $open.Add($row)
    }
    if ($open.Count -eq 0) { return $null }
    return $open[0]
}

function New-EmiWorkItem {
    param(
        [string]$RequestKey,
        [int]$ReviewRound,
        [string]$StepKey,
        [string]$State = 'WaitingAcceptance',
        [string]$ResponsibleOUCode = ''
    )
    $step = Get-EmiStepDef $StepKey
    if (-not $step) { throw "Unknown StepKey $StepKey" }
    $ou = Get-EmiDefaultOu -StepKey $StepKey -PreferredOU $ResponsibleOUCode
    $org = Get-EmiOrgUnit $ou
    $manager = if ($org) { [string]$org.FieldValues['ManagerUPN'] } else { '' }
    $stepKind = [string]$step.StepKind
    if ($stepKind -eq 'Initiator') { $stepKind = 'Department' }
    if ($stepKind -eq 'System') { $stepKind = 'Payment' }
    $sik = New-EmiKey 'SI'
    $values = @{
        Title               = "$RequestKey-$StepKey"
        RequestKey          = $RequestKey
        StepInstanceKey     = $sik
        ReviewRound         = [double]$ReviewRound
        StepKey             = $StepKey
        StepOrder           = [double]$step.StepOrder
        StepKind            = $stepKind
        ResponsibleOUCode   = $ou
        ManagerUPN          = $manager
        State               = $State
        Decision            = 'Pending'
    }
    $item = Add-PnPListItem -List (Get-EmiListId 'EMI_PAY_WorkItems') -Values $values -Connection $script:Connection
    return @{ Item = $item; StepInstanceKey = $sik }
}

function Close-EmiWorkItem {
    param($WorkItem, [string]$State, [string]$Decision, [string]$Note = '')
    Set-PnPListItem -List (Get-EmiListId 'EMI_PAY_WorkItems') -Identity (Get-EmiItemId $WorkItem) -Values @{
        State        = $State
        Decision     = $Decision
        DecisionNote = $Note
        ClosedAt     = (Get-Date).ToUniversalTime()
    } -Connection $script:Connection | Out-Null
}

function Test-EmiChecklistReady([string]$RequestKey) {
    $items = Get-EmiItemsEq -ListId (Get-EmiListId 'EMI_PAY_ChecklistItems') -Field 'RequestKey' -Value $RequestKey -RowLimit 200
    foreach ($it in $items) {
        if ($null -eq $it) { continue }
        if ([bool]$it.FieldValues['IsRequired']) {
            $status = [string]$it.FieldValues['ItemStatus']
            $uploaded = [int]$it.FieldValues['UploadedCount']
            $min = [int]$it.FieldValues['MinFileCount']
            if ($status -eq 'Missing' -or $uploaded -lt $min) {
                return $false
            }
        }
    }
    return $true
}

function Invoke-EmiCreateRequest {
    param($Command, $Payload)
    $existingReqKey = [string]$Command.FieldValues['RequestKey']
    if ($existingReqKey) {
        $dup = Get-EmiRequest $existingReqKey
        if ($dup) { throw "RequestKey already exists: $existingReqKey" }
    }
    $paymentTypeCode = if ($Payload.paymentTypeCode) { [string]$Payload.paymentTypeCode } else { [string]$script:SeedMeta.paymentTypeCode }
    $createdOU = if ($Payload.createdOUCode) { [string]$Payload.createdOUCode } else { '' }
    if ([string]::IsNullOrWhiteSpace($createdOU)) {
        throw 'CREATE_REQUEST requires payload.createdOUCode (BPCM1: any active OrgUnit)'
    }
    $creator = if ($Payload.creatorUPN) { [string]$Payload.creatorUPN } else { 'demo@local' }
    $amount = if ($null -ne $Payload.amount) { [double]$Payload.amount } else { 0 }
    $explanation = if ($Payload.explanation) { [string]$Payload.explanation } else { '' }
    $requestKey = if ($existingReqKey) { $existingReqKey } else { New-EmiKey 'REQ' }
    $requestCode = if ($Payload.requestCode) { [string]$Payload.requestCode } else { $requestKey }
    $pt = @($script:SeedMeta.paymentTypes | Where-Object { $_.PaymentTypeCode -eq $paymentTypeCode })[0]
    if (-not $pt) { throw "Unknown PaymentTypeCode $paymentTypeCode" }

    $routePlan = Resolve-EmiRoutePlan -Payload $Payload
    $routeJson = ConvertTo-EmiRoutePlanJson $routePlan
    $wi = New-EmiWorkItem -RequestKey $requestKey -ReviewRound 1 -StepKey 'BPCM1_PREPARE' -State 'InReview' -ResponsibleOUCode $createdOU
    $reqValues = @{
        Title                   = $requestCode
        RequestKey              = $requestKey
        RequestCode             = $requestCode
        CreatedOUCode           = $createdOU
        CreatorUPN              = $creator
        PaymentTypeCode         = $paymentTypeCode
        Amount                  = $amount
        Explanation             = $explanation
        WorkflowCode            = [string]$pt.WorkflowCode
        WorkflowVersion         = 0
        ChecklistVersion        = [double]$pt.ChecklistVersion
        ReviewRound             = 1
        CurrentStepKey          = 'BPCM1_PREPARE'
        CurrentStepInstanceKey  = $wi.StepInstanceKey
        CurrentOUCode           = $createdOU
        Status                  = 'Draft'
        IsLocked                = $false
        ArchiveStatus           = 'NotStarted'
        RoutePlanJson           = $routeJson
    }
    try {
        Add-PnPListItem -List (Get-EmiListId 'EMI_PAY_Requests') -Values $reqValues -Connection $script:Connection | Out-Null
    } catch {
        if ($_.Exception.Message -match 'RoutePlanJson') {
            $reqValues.Remove('RoutePlanJson')
            Add-PnPListItem -List (Get-EmiListId 'EMI_PAY_Requests') -Values $reqValues -Connection $script:Connection | Out-Null
        } else { throw }
    }

    $templates = @($script:SeedMeta.checklistTemplates | Where-Object {
            $_.PaymentTypeCode -eq $paymentTypeCode -and [int]$_.VersionNo -eq [int]$pt.ChecklistVersion
        } | Sort-Object DisplayOrder)
    foreach ($t in $templates) {
        $cik = New-EmiKey 'CI'
        Add-PnPListItem -List (Get-EmiListId 'EMI_PAY_ChecklistItems') -Values @{
            Title            = "$requestKey-$($t.ItemCode)"
            RequestKey       = $requestKey
            ChecklistItemKey = $cik
            ItemCode         = $t.ItemCode
            ItemLabel        = $t.ItemLabel
            IsRequired       = [bool]$t.IsRequired
            MinFileCount     = [double]$t.MinFileCount
            UploadedCount    = 0
            ItemStatus       = 'Missing'
            IsLocked         = $false
        } -Connection $script:Connection | Out-Null
    }

    Set-PnPListItem -List (Get-EmiListId 'EMI_PAY_Commands') -Identity (Get-EmiItemId $Command) -Values @{
        RequestKey      = $requestKey
        StepInstanceKey = $wi.StepInstanceKey
    } -Connection $script:Connection | Out-Null

    Add-EmiActivity -ListName 'EMI_PAY_ActivityPublic' -RequestKey $requestKey -EventType 'CREATED' `
        -ActorUPN $creator -FromState '' -ToState 'Draft' -Note 'CREATE_REQUEST' -Details @{ requestKey = $requestKey } `
        -StepInstanceKey $wi.StepInstanceKey -ReviewRound 1
    Add-EmiActivity -ListName 'EMI_PAY_ActivityInternal' -RequestKey $requestKey -EventType 'CREATED' `
        -ActorUPN $creator -FromState '' -ToState 'Draft' -Note 'CREATE_REQUEST' -Details @{ commandKey = [string]$Command.FieldValues['CommandKey'] } `
        -StepInstanceKey $wi.StepInstanceKey -ReviewRound 1
}

function Invoke-EmiSubmit {
    param($Command, $Payload)
    $requestKey = [string]$Command.FieldValues['RequestKey']
    $req = Get-EmiRequest $requestKey
    if (-not $req) { throw "Request not found: $requestKey" }
    $status = [string]$req.FieldValues['Status']
    if ($status -notin @('Draft', 'Returned')) {
        throw "SUBMIT not allowed from Status=$status"
    }
    $actor = if ($Payload.actorUPN) { [string]$Payload.actorUPN } else { [string]$req.FieldValues['CreatorUPN'] }
    if ($actor -ine [string]$req.FieldValues['CreatorUPN']) {
        # allow demo when creator is demo and actor empty-ish
        if ([string]$req.FieldValues['CreatorUPN'] -ne 'demo@local') {
            throw 'Only creator may SUBMIT'
        }
    }

    # Pilot: treat required checklist as satisfied if UploadedCount patched, else soft-pass when all Missing with MinFileCount and -SkipChecklist not set
    $skipChecklist = [bool]$Payload.skipChecklistForPilot
    if (-not $skipChecklist -and -not (Test-EmiChecklistReady $requestKey)) {
        # Auto-mark required items Uploaded for pilot if flag autoCompleteChecklist
        if ([bool]$Payload.autoCompleteChecklist) {
            $cis = Get-EmiItemsEq -ListId (Get-EmiListId 'EMI_PAY_ChecklistItems') -Field 'RequestKey' -Value $requestKey -RowLimit 200
            foreach ($ci in $cis) {
                if ($null -eq $ci) { continue }
                if ([bool]$ci.FieldValues['IsRequired']) {
                    Set-PnPListItem -List (Get-EmiListId 'EMI_PAY_ChecklistItems') -Identity (Get-EmiItemId $ci) -Values @{
                        UploadedCount = [math]::Max(1, [int]$ci.FieldValues['MinFileCount'])
                        ItemStatus    = 'Uploaded'
                    } -Connection $script:Connection | Out-Null
                }
            }
        }
        elseif (-not (Test-EmiChecklistReady $requestKey)) {
            throw 'Required checklist not ready'
        }
    }

    $round = [int]$req.FieldValues['ReviewRound']
    $from = $status
    if ($status -eq 'Returned') {
        $round = $round + 1
    }

    $existingRoute = ''
    if ($req.FieldValues.ContainsKey('RoutePlanJson')) {
        $existingRoute = [string]$req.FieldValues['RoutePlanJson']
    }
    $routePlan = Resolve-EmiRoutePlan -Payload $Payload -ExistingRaw $existingRoute
    $routeJson = ConvertTo-EmiRoutePlanJson $routePlan

    $openPrep = Get-EmiOpenWorkItem -RequestKey $requestKey -StepKey 'BPCM1_PREPARE'
    if ($openPrep) {
        Close-EmiWorkItem -WorkItem $openPrep -State 'Completed' -Decision 'Accepted' -Note 'SUBMIT→AwaitingManager'
    }

    $wfVersion = [int]$req.FieldValues['WorkflowVersion']
    if ($wfVersion -le 0) {
        $wfVersion = [int]$script:SeedMeta.workflowVersion
    }

    $createdOU = [string]$req.FieldValues['CreatedOUCode']
    $wi = New-EmiWorkItem -RequestKey $requestKey -ReviewRound $round -StepKey 'BPCM1_PREPARE' -State 'InReview' -ResponsibleOUCode $createdOU
    $firstSubmitted = $req.FieldValues['FirstSubmittedAt']
    if (-not $firstSubmitted) { $firstSubmitted = (Get-Date).ToUniversalTime() }

    $patch = @{
        Status                 = 'AwaitingManager'
        CurrentStepKey         = 'BPCM1_PREPARE'
        CurrentStepInstanceKey = $wi.StepInstanceKey
        CurrentOUCode          = $createdOU
        WorkflowVersion        = [double]$wfVersion
        ReviewRound            = [double]$round
        IsLocked               = $true
        FirstSubmittedAt       = $firstSubmitted
        RoutePlanJson          = $routeJson
    }
    try {
        Set-PnPListItem -List (Get-EmiListId 'EMI_PAY_Requests') -Identity (Get-EmiItemId $req) -Values $patch -Connection $script:Connection | Out-Null
    } catch {
        if ($_.Exception.Message -match 'RoutePlanJson|AwaitingManager') {
            $patch.Remove('RoutePlanJson')
            Set-PnPListItem -List (Get-EmiListId 'EMI_PAY_Requests') -Identity (Get-EmiItemId $req) -Values $patch -Connection $script:Connection | Out-Null
        } else { throw }
    }

    Set-PnPListItem -List (Get-EmiListId 'EMI_PAY_Commands') -Identity (Get-EmiItemId $Command) -Values @{ StepInstanceKey = $wi.StepInstanceKey } -Connection $script:Connection | Out-Null
    Add-EmiActivity -ListName 'EMI_PAY_ActivityPublic' -RequestKey $requestKey -EventType 'PRESENTED' `
        -ActorUPN $actor -FromState $from -ToState 'AwaitingManager' -Note 'Trình trưởng phòng phòng tạo' `
        -Details @{ routePlan = $routePlan } -StepInstanceKey $wi.StepInstanceKey -ReviewRound $round
    Add-EmiActivity -ListName 'EMI_PAY_ActivityInternal' -RequestKey $requestKey -EventType 'PRESENTED' `
        -ActorUPN $actor -FromState $from -ToState 'AwaitingManager' -Note 'SUBMIT→AwaitingManager' `
        -Details @{ commandKey = [string]$Command.FieldValues['CommandKey']; routePlan = $routePlan } `
        -StepInstanceKey $wi.StepInstanceKey -ReviewRound $round
}

function Invoke-EmiDecide {
    param($Command, $Payload)
    $requestKey = [string]$Command.FieldValues['RequestKey']
    $req = Get-EmiRequest $requestKey
    if (-not $req) { throw "Request not found: $requestKey" }
    $decision = [string]$Payload.decision
    if ([string]::IsNullOrWhiteSpace($decision)) { $decision = 'PASS' }
    $decision = $decision.ToUpperInvariant()
    $status = [string]$req.FieldValues['Status']
    $currentStep = [string]$req.FieldValues['CurrentStepKey']
    $actor = if ($Payload.actorUPN) { [string]$Payload.actorUPN } else { 'demo@local' }
    $round = [int]$req.FieldValues['ReviewRound']
    $routePlan = Get-EmiRoutePlan $req
    $note = if ($Payload.decisionNote) { [string]$Payload.decisionNote } else { "DECIDE $decision" }

    # --- TP phòng tạo: AwaitingManager ---
    if ($status -eq 'AwaitingManager' -and $currentStep -eq 'BPCM1_PREPARE') {
        $createdOU = [string]$req.FieldValues['CreatedOUCode']
        if (-not (Test-EmiActorInOu -ActorUPN $actor -OUCode $createdOU)) {
            throw "Actor $actor not authorized as manager for OU $createdOU"
        }
        $wi = Get-EmiOpenWorkItem -RequestKey $requestKey -StepKey 'BPCM1_PREPARE'
        if ($wi) {
            Close-EmiWorkItem -WorkItem $wi -State $(if ($decision -eq 'PASS') { 'Completed' } else { 'Returned' }) `
                -Decision $(if ($decision -eq 'PASS') { 'Approved' } else { 'Returned' }) -Note $note
        }
        if ($decision -eq 'PASS') {
            $nextKey = 'BPCM2_TECH'
            $nextOu = Get-EmiRouteOu -RoutePlan $routePlan -StepKey $nextKey -Fallback (Get-EmiDefaultOu $nextKey)
            $newWi = New-EmiWorkItem -RequestKey $requestKey -ReviewRound $round -StepKey $nextKey -ResponsibleOUCode $nextOu
            Set-PnPListItem -List (Get-EmiListId 'EMI_PAY_Requests') -Identity (Get-EmiItemId $req) -Values @{
                Status                 = 'InReview'
                CurrentStepKey         = $nextKey
                CurrentStepInstanceKey = $newWi.StepInstanceKey
                CurrentOUCode          = $nextOu
                IsLocked               = $true
            } -Connection $script:Connection | Out-Null
            $cis = Get-EmiItemsEq -ListId (Get-EmiListId 'EMI_PAY_ChecklistItems') -Field 'RequestKey' -Value $requestKey -RowLimit 200
            foreach ($ci in $cis) {
                if ($null -eq $ci) { continue }
                Set-PnPListItem -List (Get-EmiListId 'EMI_PAY_ChecklistItems') -Identity (Get-EmiItemId $ci) -Values @{ IsLocked = $true } -Connection $script:Connection | Out-Null
            }
            Set-PnPListItem -List (Get-EmiListId 'EMI_PAY_Commands') -Identity (Get-EmiItemId $Command) -Values @{ StepInstanceKey = $newWi.StepInstanceKey } -Connection $script:Connection | Out-Null
            Add-EmiActivity -ListName 'EMI_PAY_ActivityPublic' -RequestKey $requestKey -EventType 'MANAGER_APPROVED' `
                -ActorUPN $actor -FromState 'AwaitingManager' -ToState $nextKey -Note $note `
                -Details @{ nextOu = $nextOu } -StepInstanceKey $newWi.StepInstanceKey -ReviewRound $round
            return
        }
        # REJECT → Draft
        $adjustWi = New-EmiWorkItem -RequestKey $requestKey -ReviewRound $round -StepKey 'BPCM1_PREPARE' -State 'InReview' -ResponsibleOUCode $createdOU
        Set-PnPListItem -List (Get-EmiListId 'EMI_PAY_Requests') -Identity (Get-EmiItemId $req) -Values @{
            Status                 = 'Draft'
            CurrentStepKey         = 'BPCM1_PREPARE'
            CurrentStepInstanceKey = $adjustWi.StepInstanceKey
            CurrentOUCode          = $createdOU
            IsLocked               = $false
        } -Connection $script:Connection | Out-Null
        Add-EmiActivity -ListName 'EMI_PAY_ActivityPublic' -RequestKey $requestKey -EventType 'MANAGER_REJECTED' `
            -ActorUPN $actor -FromState 'AwaitingManager' -ToState 'Draft' -Note $note `
            -Details @{ reason = $note } -StepInstanceKey $adjustWi.StepInstanceKey -ReviewRound $round
        return
    }

    # --- DECIDE PASS/REJECT ở các bước kiểm tra ---
    if ($currentStep -in @('BPCM1_PREPARE', 'SYSTEM_ARCHIVE')) {
        throw "DECIDE not allowed at $currentStep (Status=$status)"
    }
    $ou = [string]$req.FieldValues['CurrentOUCode']
    if (-not (Test-EmiActorInOu -ActorUPN $actor -OUCode $ou)) {
        throw "Actor $actor not authorized for OU $ou"
    }
    if ($decision -eq 'REJECT' -or $decision -eq 'RETURN') {
        Invoke-EmiReturnStep -Command $Command -Payload ([pscustomobject]@{
                actorUPN = $actor
                reason   = $note
            })
        return
    }
    # PASS → next from RoutePlan
    $wi = Get-EmiOpenWorkItem -RequestKey $requestKey -StepKey $currentStep
    if (-not $wi) { throw "No open WorkItem for $currentStep" }
    $step = Get-EmiStepDef $currentStep
    $nextNo = [int]$step.StepOrder + 1
    $next = @($script:SeedMeta.workflowSteps | Where-Object { [int]$_.StepOrder -eq $nextNo })[0]
    if (-not $next) { throw "No next step after $currentStep" }
    Close-EmiWorkItem -WorkItem $wi -State 'Completed' -Decision $(if ($currentStep -eq 'CHAIR_APPROVE') { 'Approved' } else { 'Accepted' }) -Note $note
    $nextOu = Get-EmiRouteOu -RoutePlan $routePlan -StepKey $next.StepKey -Fallback (Get-EmiDefaultOu $next.StepKey)
    $newWi = New-EmiWorkItem -RequestKey $requestKey -ReviewRound $round -StepKey $next.StepKey -ResponsibleOUCode $nextOu
    $newStatus = if ($next.StepKind -eq 'Approval') { 'AwaitManager' }
        elseif ($next.StepKey -eq 'TCKT_PAY') { 'PendingPayment' }
        else { 'InReview' }
    $masterPatch = @{
        Status                 = $newStatus
        CurrentStepKey         = $next.StepKey
        CurrentStepInstanceKey = $newWi.StepInstanceKey
        CurrentOUCode          = $nextOu
    }
    if ($currentStep -eq 'CHAIR_APPROVE' -and $Payload.paymentDueAt) {
        $masterPatch['PaymentDueAt'] = [datetime]$Payload.paymentDueAt
    }
    Set-PnPListItem -List (Get-EmiListId 'EMI_PAY_Requests') -Identity (Get-EmiItemId $req) -Values $masterPatch -Connection $script:Connection | Out-Null
    Set-PnPListItem -List (Get-EmiListId 'EMI_PAY_Commands') -Identity (Get-EmiItemId $Command) -Values @{ StepInstanceKey = $newWi.StepInstanceKey } -Connection $script:Connection | Out-Null
    Add-EmiActivity -ListName 'EMI_PAY_ActivityPublic' -RequestKey $requestKey -EventType 'STEP_COMPLETED' `
        -ActorUPN $actor -FromState $currentStep -ToState $next.StepKey -Note $note `
        -Details @{ nextOu = $nextOu } -StepInstanceKey $newWi.StepInstanceKey -ReviewRound $round
}

function Invoke-EmiCompleteStep {
    param($Command, $Payload)
    $requestKey = [string]$Command.FieldValues['RequestKey']
    $req = Get-EmiRequest $requestKey
    if (-not $req) { throw "Request not found: $requestKey" }
    $currentStep = [string]$req.FieldValues['CurrentStepKey']
    if ($currentStep -in @('BPCM1_PREPARE', 'SYSTEM_ARCHIVE')) {
        throw "COMPLETE_STEP not allowed at $currentStep"
    }
    $actor = if ($Payload.actorUPN) { [string]$Payload.actorUPN } else { 'demo@local' }
    $ou = [string]$req.FieldValues['CurrentOUCode']
    if (-not (Test-EmiActorInOu -ActorUPN $actor -OUCode $ou)) {
        throw "Actor $actor not authorized for OU $ou"
    }
    $wi = Get-EmiOpenWorkItem -RequestKey $requestKey -StepKey $currentStep
    if (-not $wi) { throw "No open WorkItem for $currentStep" }

    $step = Get-EmiStepDef $currentStep
    $nextNo = [int]$step.StepOrder + 1
    $next = @($script:SeedMeta.workflowSteps | Where-Object { [int]$_.StepOrder -eq $nextNo })[0]
    if (-not $next) {
        $allSteps = @(Get-EmiItemsEq -ListId (Get-EmiListId 'EMI_PAY_WorkflowSteps') -Field 'WorkflowCode' -Value ([string]$script:SeedMeta.workflowCode) -RowLimit 50)
        $nextHit = @($allSteps | Where-Object { [int]$_.FieldValues['StepOrder'] -eq $nextNo -and [bool]$_.FieldValues['IsActive'] })[0]
        if ($nextHit) {
            $next = [pscustomobject]@{
                StepKey   = [string]$nextHit.FieldValues['StepKey']
                StepOrder = [int]$nextHit.FieldValues['StepOrder']
                StepKind  = [string]$nextHit.FieldValues['StepKind']
            }
        }
    }
    $note = if ($Payload.decisionNote) { [string]$Payload.decisionNote } else { 'COMPLETE_STEP' }
    $round = [int]$req.FieldValues['ReviewRound']
    Close-EmiWorkItem -WorkItem $wi -State 'Completed' -Decision $(if ($currentStep -eq 'CHAIR_APPROVE') { 'Approved' } else { 'Accepted' }) -Note $note

    if (-not $next) { throw "No next step after $currentStep" }
    $routePlan = Get-EmiRoutePlan $req
    $preferredOu = Get-EmiRouteOu -RoutePlan $routePlan -StepKey $next.StepKey `
        -Fallback $(if ($Payload.targetOUCode) { [string]$Payload.targetOUCode } else { '' })
    $newWi = New-EmiWorkItem -RequestKey $requestKey -ReviewRound $round -StepKey $next.StepKey -ResponsibleOUCode $preferredOu
    $newOu = Get-EmiDefaultOu -StepKey $next.StepKey -PreferredOU $preferredOu
    $newStatus = if ($next.StepKind -eq 'Approval') {
        'AwaitManager'
    }
    elseif ($next.StepKey -eq 'TCKT_PAY') {
        'PendingPayment'
    }
    else {
        'InReview'
    }
    Set-PnPListItem -List (Get-EmiListId 'EMI_PAY_Requests') -Identity (Get-EmiItemId $req) -Values @{
        Status                 = $newStatus
        CurrentStepKey         = $next.StepKey
        CurrentStepInstanceKey = $newWi.StepInstanceKey
        CurrentOUCode          = $newOu
    } -Connection $script:Connection | Out-Null
    Add-EmiActivity -ListName 'EMI_PAY_ActivityPublic' -RequestKey $requestKey -EventType 'STEP_COMPLETED' `
        -ActorUPN $actor -FromState $currentStep -ToState $next.StepKey -Note $note `
        -Details @{ fromStep = $currentStep; toStep = $next.StepKey } `
        -StepInstanceKey $newWi.StepInstanceKey -ReviewRound $round
}

function Invoke-EmiReturnStep {
    param($Command, $Payload)
    $requestKey = [string]$Command.FieldValues['RequestKey']
    $req = Get-EmiRequest $requestKey
    if (-not $req) { throw "Request not found: $requestKey" }
    $reason = [string]$Payload.reason
    if ([string]::IsNullOrWhiteSpace($reason)) { throw 'RETURN_STEP requires reason' }
    $currentStep = [string]$req.FieldValues['CurrentStepKey']
    if ($currentStep -in @('BPCM1_PREPARE', 'SYSTEM_ARCHIVE')) {
        throw "RETURN_STEP not allowed at $currentStep"
    }
    $actor = if ($Payload.actorUPN) { [string]$Payload.actorUPN } else { 'demo@local' }
    $ou = [string]$req.FieldValues['CurrentOUCode']
    if (-not (Test-EmiActorInOu -ActorUPN $actor -OUCode $ou)) {
        throw "Actor $actor not authorized for OU $ou"
    }
    $wi = Get-EmiOpenWorkItem -RequestKey $requestKey -StepKey $currentStep
    if (-not $wi) { throw "No open WorkItem for $currentStep" }
    $round = [int]$req.FieldValues['ReviewRound']
    $sik = [string]$wi.FieldValues['StepInstanceKey']
    Close-EmiWorkItem -WorkItem $wi -State 'Returned' -Decision 'Returned' -Note $reason

    $creatorOu = [string]$req.FieldValues['CreatedOUCode']
    $adjustWi = New-EmiWorkItem -RequestKey $requestKey -ReviewRound $round -StepKey 'BPCM1_PREPARE' -State 'InReview' -ResponsibleOUCode $creatorOu
    Set-PnPListItem -List (Get-EmiListId 'EMI_PAY_Requests') -Identity (Get-EmiItemId $req) -Values @{
        Status                 = 'Returned'
        CurrentStepKey         = 'BPCM1_PREPARE'
        CurrentStepInstanceKey = $adjustWi.StepInstanceKey
        CurrentOUCode          = $creatorOu
        IsLocked               = $false
    } -Connection $script:Connection | Out-Null

    $cis = Get-EmiItemsEq -ListId (Get-EmiListId 'EMI_PAY_ChecklistItems') -Field 'RequestKey' -Value $requestKey -RowLimit 200
    foreach ($ci in $cis) {
        if ($null -eq $ci) { continue }
        Set-PnPListItem -List (Get-EmiListId 'EMI_PAY_ChecklistItems') -Identity (Get-EmiItemId $ci) -Values @{ IsLocked = $false } -Connection $script:Connection | Out-Null
    }

    $details = @{ returnFromStepKey = $currentStep; reason = $reason }
    Add-EmiActivity -ListName 'EMI_PAY_ActivityPublic' -RequestKey $requestKey -EventType 'RETURNED' `
        -ActorUPN $actor -FromState $currentStep -ToState 'Returned' -Note $reason `
        -Details $details -StepInstanceKey $sik -ReviewRound $round
    Add-EmiActivity -ListName 'EMI_PAY_ActivityInternal' -RequestKey $requestKey -EventType 'RETURNED' `
        -ActorUPN $actor -FromState $currentStep -ToState 'Returned' -Note $reason `
        -Details $details -StepInstanceKey $sik -ReviewRound $round
}

function Invoke-EmiConfirmPayment {
    param($Command, $Payload)
    $requestKey = [string]$Command.FieldValues['RequestKey']
    $req = Get-EmiRequest $requestKey
    if (-not $req) { throw "Request not found: $requestKey" }
    $status = [string]$req.FieldValues['Status']
    $currentStep = [string]$req.FieldValues['CurrentStepKey']
    if ($status -ne 'PendingPayment' -or $currentStep -ne 'TCKT_PAY') {
        throw "CONFIRM_PAYMENT requires PendingPayment/TCKT_PAY (got $status/$currentStep)"
    }
    $actor = if ($Payload.actorUPN) { [string]$Payload.actorUPN } else { 'demo@local' }
    $ou = [string]$req.FieldValues['CurrentOUCode']
    if (-not (Test-EmiActorInOu -ActorUPN $actor -OUCode $ou)) {
        throw "Actor $actor not authorized for OU $ou"
    }
    $wi = Get-EmiOpenWorkItem -RequestKey $requestKey -StepKey 'TCKT_PAY'
    if (-not $wi) { throw 'No open TCKT_PAY WorkItem' }
    $round = [int]$req.FieldValues['ReviewRound']
    Close-EmiWorkItem -WorkItem $wi -State 'Completed' -Decision 'Approved' -Note 'CONFIRM_PAYMENT'
    $paidAt = (Get-Date).ToUniversalTime()
    $archiveWi = New-EmiWorkItem -RequestKey $requestKey -ReviewRound $round -StepKey 'SYSTEM_ARCHIVE'
    Set-PnPListItem -List (Get-EmiListId 'EMI_PAY_Requests') -Identity (Get-EmiItemId $req) -Values @{
        Status                 = 'Archiving'
        ArchiveStatus          = 'Pending'
        CurrentStepKey         = 'SYSTEM_ARCHIVE'
        CurrentStepInstanceKey = $archiveWi.StepInstanceKey
        PaidAt                 = $paidAt
    } -Connection $script:Connection | Out-Null
    Add-EmiActivity -ListName 'EMI_PAY_ActivityPublic' -RequestKey $requestKey -EventType 'PAYMENT_CONFIRMED' `
        -ActorUPN $actor -FromState 'PendingPayment' -ToState 'Archiving' -Note 'CONFIRM_PAYMENT' `
        -Details @{ paidAt = $paidAt.ToString('o') } -StepInstanceKey ([string]$wi.FieldValues['StepInstanceKey']) -ReviewRound $round
}

function Invoke-EmiPayCommand {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        $Command
    )
    $commandKey = [string]$Command.FieldValues['CommandKey']
    $dedupe = [string]$Command.FieldValues['DedupeKey']
    $state = [string]$Command.FieldValues['State']

    if ($state -eq 'Succeeded') {
        Write-Host "SKIP already Succeeded: $commandKey" -ForegroundColor Yellow
        return
    }
    if ($dedupe) {
        $siblings = Get-EmiItemsEq -ListId (Get-EmiListId 'EMI_PAY_Commands') -Field 'DedupeKey' -Value $dedupe -RowLimit 20
        $won = @($siblings | Where-Object { $_ -and $_.FieldValues['State'] -eq 'Succeeded' -and $_.Id -ne $Command.Id })
        if ($won.Count -gt 0) {
            Set-EmiCommandState -Command $Command -State 'Rejected' -ErrorMessage "DedupeKey already succeeded: $dedupe"
            return
        }
    }

    $commandId = Get-EmiItemId $Command
    Set-EmiCommandState -Command $Command -State 'Processing'
    # reload
    $Command = Get-PnPListItem -List (Get-EmiListId 'EMI_PAY_Commands') -Id $commandId -Connection $script:Connection
    $type = [string]$Command.FieldValues['CommandType']
    $payload = Get-EmiPayload $Command

    try {
        switch ($type) {
            'CREATE_REQUEST' { Invoke-EmiCreateRequest -Command $Command -Payload $payload }
            'SUBMIT' { Invoke-EmiSubmit -Command $Command -Payload $payload }
            'DECIDE' { Invoke-EmiDecide -Command $Command -Payload $payload }
            'COMPLETE_STEP' { Invoke-EmiCompleteStep -Command $Command -Payload $payload }
            'RETURN_STEP' { Invoke-EmiReturnStep -Command $Command -Payload $payload }
            'CONFIRM_PAYMENT' { Invoke-EmiConfirmPayment -Command $Command -Payload $payload }
            default { throw "Unknown CommandType: $type" }
        }
        Set-EmiCommandState -Command $Command -State 'Succeeded'
        Write-Host "OK $type $commandKey" -ForegroundColor Green
    }
    catch {
        $msg = [string]$_.Exception.Message
        $reject = $msg -match 'not allowed|not authorized|requires|not ready|Unknown|Only creator|missing return'
        $final = if ($reject) { 'Rejected' } else { 'Failed' }
        Set-EmiCommandState -Command $Command -State $final -ErrorMessage $msg
        $rk = [string]$Command.FieldValues['RequestKey']
        if ([string]::IsNullOrWhiteSpace($rk)) { $rk = 'NONE' }
        Add-EmiActivity -ListName 'EMI_PAY_ActivityInternal' -RequestKey $rk `
            -EventType 'COMMAND_ERROR' -ActorUPN 'system' -FromState $type -ToState $final -Note $msg `
            -Details @{ commandKey = $commandKey; error = $msg } -ReviewRound 0
        Write-Host "$final $type $commandKey : $msg" -ForegroundColor Red
        if (-not $reject) { throw }
    }
}

function Get-EmiPendingCommands {
    param([int]$Top = 10)
    $query = @"
<View>
  <Query>
    <Where>
      <Eq><FieldRef Name='State' /><Value Type='Choice'>Pending</Value></Eq>
    </Where>
    <OrderBy><FieldRef Name='ID' Ascending='TRUE' /></OrderBy>
  </Query>
  <RowLimit>$Top</RowLimit>
</View>
"@
    $bag = [System.Collections.Generic.List[object]]::new()
    $page = Get-PnPListItem -List (Get-EmiListId 'EMI_PAY_Commands') -Query $query -Connection $script:Connection
    if ($null -ne $page) {
        foreach ($row in @($page)) {
            if ($null -ne $row) { $bag.Add($row) }
        }
    }
    return $bag
}

function Invoke-EmiPayOrchestratorBatch {
    [CmdletBinding()]
    param([int]$Top = 10)
    $pending = Get-EmiPendingCommands -Top $Top
    Write-Host "Pending commands: $($pending.Count)" -ForegroundColor Cyan
    foreach ($cmd in $pending) {
        if ($null -eq $cmd) { continue }
        Invoke-EmiPayCommand -Command $cmd
    }
}

Export-ModuleMember -Function Initialize-EmiPayOrchestrator, Invoke-EmiPayCommand, Invoke-EmiPayOrchestratorBatch, Get-EmiPendingCommands, Get-EmiRequest
