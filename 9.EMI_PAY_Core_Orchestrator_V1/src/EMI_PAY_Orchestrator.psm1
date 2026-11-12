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
    return @($script:SeedMeta.workflowSteps | Where-Object { $_.StepKey -eq $StepKey })[0]
}

function Get-EmiDefaultOu([string]$StepKey) {
    $sr = @($script:SeedMeta.stepRecipients | Where-Object { $_.StepKey -eq $StepKey -and $_.IsDefault })[0]
    if (-not $sr) { throw "No default StepRecipient for $StepKey" }
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
        [string]$State = 'WaitingAcceptance'
    )
    $step = Get-EmiStepDef $StepKey
    $ou = Get-EmiDefaultOu $StepKey
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
    $createdOU = if ($Payload.createdOUCode) { [string]$Payload.createdOUCode } else { 'OU_PBCM' }
    $creator = if ($Payload.creatorUPN) { [string]$Payload.creatorUPN } else { 'demo@local' }
    $amount = if ($null -ne $Payload.amount) { [double]$Payload.amount } else { 0 }
    $explanation = if ($Payload.explanation) { [string]$Payload.explanation } else { '' }
    $requestKey = if ($existingReqKey) { $existingReqKey } else { New-EmiKey 'REQ' }
    $requestCode = if ($Payload.requestCode) { [string]$Payload.requestCode } else { $requestKey }
    $pt = @($script:SeedMeta.paymentTypes | Where-Object { $_.PaymentTypeCode -eq $paymentTypeCode })[0]
    if (-not $pt) { throw "Unknown PaymentTypeCode $paymentTypeCode" }

    $wi = New-EmiWorkItem -RequestKey $requestKey -ReviewRound 1 -StepKey 'PBCM' -State 'InReview'
    Add-PnPListItem -List (Get-EmiListId 'EMI_PAY_Requests') -Values @{
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
        CurrentStepKey          = 'PBCM'
        CurrentStepInstanceKey  = $wi.StepInstanceKey
        CurrentOUCode           = $createdOU
        Status                  = 'Draft'
        IsLocked                = $false
        ArchiveStatus           = 'NotStarted'
    } -Connection $script:Connection | Out-Null

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
    $targetStep = 'PBCM2'
    if ($status -eq 'Returned') {
        $resume = Get-EmiReturnFromStepKey $requestKey
        if (-not $resume) { throw 'Returned request missing returnFromStepKey' }
        $targetStep = $resume
        $round = $round + 1
    }

    # Close open PBCM work item if any
    $openPbcm = Get-EmiOpenWorkItem -RequestKey $requestKey -StepKey 'PBCM'
    if ($openPbcm) {
        Close-EmiWorkItem -WorkItem $openPbcm -State 'Completed' -Decision 'Accepted' -Note 'SUBMIT'
    }

    $wfVersion = [int]$req.FieldValues['WorkflowVersion']
    if ($wfVersion -le 0) {
        $wfVersion = [int]$script:SeedMeta.workflowVersion
    }

    $wi = New-EmiWorkItem -RequestKey $requestKey -ReviewRound $round -StepKey $targetStep
    $ou = Get-EmiDefaultOu $targetStep
    $firstSubmitted = $req.FieldValues['FirstSubmittedAt']
    if (-not $firstSubmitted) { $firstSubmitted = (Get-Date).ToUniversalTime() }
    Set-PnPListItem -List (Get-EmiListId 'EMI_PAY_Requests') -Identity (Get-EmiItemId $req) -Values @{
        Status                 = 'WaitingAcceptance'
        CurrentStepKey         = $targetStep
        CurrentStepInstanceKey = $wi.StepInstanceKey
        CurrentOUCode          = $ou
        WorkflowVersion        = [double]$wfVersion
        ReviewRound            = [double]$round
        IsLocked               = $true
        FirstSubmittedAt       = $firstSubmitted
    } -Connection $script:Connection | Out-Null

    # Lock checklist
    $cis = Get-EmiItemsEq -ListId (Get-EmiListId 'EMI_PAY_ChecklistItems') -Field 'RequestKey' -Value $requestKey -RowLimit 200
    foreach ($ci in $cis) {
        if ($null -eq $ci) { continue }
        Set-PnPListItem -List (Get-EmiListId 'EMI_PAY_ChecklistItems') -Identity (Get-EmiItemId $ci) -Values @{ IsLocked = $true } -Connection $script:Connection | Out-Null
    }

    Set-PnPListItem -List (Get-EmiListId 'EMI_PAY_Commands') -Identity (Get-EmiItemId $Command) -Values @{ StepInstanceKey = $wi.StepInstanceKey } -Connection $script:Connection | Out-Null
    Add-EmiActivity -ListName 'EMI_PAY_ActivityPublic' -RequestKey $requestKey -EventType 'SUBMITTED' `
        -ActorUPN $actor -FromState $from -ToState 'WaitingAcceptance' -Note "→ $targetStep" `
        -Details @{ targetStep = $targetStep } -StepInstanceKey $wi.StepInstanceKey -ReviewRound $round
    Add-EmiActivity -ListName 'EMI_PAY_ActivityInternal' -RequestKey $requestKey -EventType 'SUBMITTED' `
        -ActorUPN $actor -FromState $from -ToState 'WaitingAcceptance' -Note "→ $targetStep" `
        -Details @{ targetStep = $targetStep; commandKey = [string]$Command.FieldValues['CommandKey'] } `
        -StepInstanceKey $wi.StepInstanceKey -ReviewRound $round
}

function Invoke-EmiCompleteStep {
    param($Command, $Payload)
    $requestKey = [string]$Command.FieldValues['RequestKey']
    $req = Get-EmiRequest $requestKey
    if (-not $req) { throw "Request not found: $requestKey" }
    $currentStep = [string]$req.FieldValues['CurrentStepKey']
    if ($currentStep -in @('PBCM', 'PAYMENT_CONFIRM')) {
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
    $note = if ($Payload.decisionNote) { [string]$Payload.decisionNote } else { 'COMPLETE_STEP' }
    $round = [int]$req.FieldValues['ReviewRound']
    Close-EmiWorkItem -WorkItem $wi -State 'Completed' -Decision $(if ($currentStep -eq 'CHAIR_APPROVAL') { 'Approved' } else { 'Accepted' }) -Note $note

    if ($currentStep -eq 'TCKT_UNC') {
        $newWi = New-EmiWorkItem -RequestKey $requestKey -ReviewRound $round -StepKey 'PAYMENT_CONFIRM'
        $newOu = Get-EmiDefaultOu 'PAYMENT_CONFIRM'
        Set-PnPListItem -List (Get-EmiListId 'EMI_PAY_Requests') -Identity (Get-EmiItemId $req) -Values @{
            Status                 = 'PendingPayment'
            CurrentStepKey         = 'PAYMENT_CONFIRM'
            CurrentStepInstanceKey = $newWi.StepInstanceKey
            CurrentOUCode          = $newOu
        } -Connection $script:Connection | Out-Null
        Add-EmiActivity -ListName 'EMI_PAY_ActivityPublic' -RequestKey $requestKey -EventType 'STEP_COMPLETED' `
            -ActorUPN $actor -FromState $currentStep -ToState 'PendingPayment' -Note $note `
            -Details @{ fromStep = $currentStep; toStep = 'PAYMENT_CONFIRM' } `
            -StepInstanceKey $newWi.StepInstanceKey -ReviewRound $round
        return
    }

    if (-not $next) { throw "No next step after $currentStep" }
    $newWi = New-EmiWorkItem -RequestKey $requestKey -ReviewRound $round -StepKey $next.StepKey
    $newOu = Get-EmiDefaultOu $next.StepKey
    $newStatus = if ($next.StepKind -eq 'Approval') { 'AwaitManager' } else { 'InReview' }
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
    if ($currentStep -in @('PBCM', 'PAYMENT_CONFIRM')) {
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
    $adjustWi = New-EmiWorkItem -RequestKey $requestKey -ReviewRound $round -StepKey 'PBCM' -State 'InReview'
    Set-PnPListItem -List (Get-EmiListId 'EMI_PAY_Requests') -Identity (Get-EmiItemId $req) -Values @{
        Status                 = 'Returned'
        CurrentStepKey         = 'PBCM'
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
    if ($status -ne 'PendingPayment' -or $currentStep -ne 'PAYMENT_CONFIRM') {
        throw "CONFIRM_PAYMENT requires PendingPayment/PAYMENT_CONFIRM (got $status/$currentStep)"
    }
    $actor = if ($Payload.actorUPN) { [string]$Payload.actorUPN } else { 'demo@local' }
    $ou = [string]$req.FieldValues['CurrentOUCode']
    if (-not (Test-EmiActorInOu -ActorUPN $actor -OUCode $ou)) {
        throw "Actor $actor not authorized for OU $ou"
    }
    $wi = Get-EmiOpenWorkItem -RequestKey $requestKey -StepKey 'PAYMENT_CONFIRM'
    if (-not $wi) { throw 'No open PAYMENT_CONFIRM WorkItem' }
    $round = [int]$req.FieldValues['ReviewRound']
    Close-EmiWorkItem -WorkItem $wi -State 'Completed' -Decision 'Approved' -Note 'CONFIRM_PAYMENT'
    $paidAt = (Get-Date).ToUniversalTime()
    Set-PnPListItem -List (Get-EmiListId 'EMI_PAY_Requests') -Identity (Get-EmiItemId $req) -Values @{
        Status = 'PaymentConfirmed'
        PaidAt = $paidAt
    } -Connection $script:Connection | Out-Null
    Add-EmiActivity -ListName 'EMI_PAY_ActivityPublic' -RequestKey $requestKey -EventType 'PAYMENT_CONFIRMED' `
        -ActorUPN $actor -FromState 'PendingPayment' -ToState 'PaymentConfirmed' -Note 'CONFIRM_PAYMENT' `
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
