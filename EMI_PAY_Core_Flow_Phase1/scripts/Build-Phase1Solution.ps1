# Build EMI_PAY_CORE_V1 Phase-1 Solution ZIP (happy-path orchestrator)
[CmdletBinding()]
param(
    [string]$OutZip = ''
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) {
    $PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}
$phaseRoot = Split-Path $PSScriptRoot -Parent
$repoRoot = Split-Path $phaseRoot -Parent
if ([string]::IsNullOrWhiteSpace($OutZip)) {
    $OutZip = Join-Path $repoRoot 'EMI_PAY_CORE_V1_1_0_0_9.zip'
}
$staging = Join-Path $phaseRoot '_staging_solution'
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Join-Path $staging 'Workflows') | Out-Null

$site = 'https://emicomvn.sharepoint.com/sites/cecm'
$guidCommands = 'e16b76dc-7686-43e9-b232-18c80e2b31d2'
$guidRequests = '12b3051d-7642-4f90-a39d-5364df561fbf'
$guidWorkItems = 'e21ef6e7-ee31-466a-be3b-65ae30ca7722'
$guidChecklist = 'd02c6a03-9561-4d90-b5d5-ad30a2fef88b'
$guidDocIndex = 'a45c74cd-1f21-454c-9fcc-6812692b801b'
$workflowId = '1703d2f2-46de-f111-84ea-000d3aa191f1'
$workflowFile = "EMI_PAY_CORE_Orchestrator_V1-$($workflowId.ToUpper()).json" -replace '[{}]', ''

# --- Flow definition (Phase 1 happy path) ---
$definition = [ordered]@{
    '$schema'        = 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#'
    contentVersion   = '1.0.0.0'
    parameters       = [ordered]@{
        '$connections'    = [ordered]@{ defaultvalue = @{}; type = 'object' }
        '$authentication' = [ordered]@{ defaultvalue = @{}; type = 'SecureObject' }
    }
    triggers         = [ordered]@{
        TRG_CommandCreated = [ordered]@{
            type       = 'OpenApiConnection'
            recurrence = [ordered]@{ interval = 1; frequency = 'Minute' }
            splitOn    = "@triggerOutputs()?['body/value']"
            inputs     = [ordered]@{
                host           = [ordered]@{
                    connectionName = 'shared_sharepointonline'
                    operationId    = 'GetOnNewItems'
                    apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                }
                parameters     = [ordered]@{
                    dataset = $site
                    table   = $guidCommands
                }
                authentication = "@parameters('`$authentication')"
            }
        }
    }
    actions          = [ordered]@{
        INIT_CommandKey = [ordered]@{
            type     = 'InitializeVariable'
            inputs   = [ordered]@{
                variables = @(@{
                        name  = 'CommandKey'
                        type = 'string'
                        value = "@coalesce(triggerOutputs()?['body/CommandKey'],'')"
                    })
            }
            runAfter = @{}
        }
        INIT_CommandType = [ordered]@{
            type     = 'InitializeVariable'
            inputs   = [ordered]@{
                variables = @(@{
                        name  = 'CommandType'
                        type = 'string'
                        value = "@coalesce(triggerOutputs()?['body/CommandType'],'')"
                    })
            }
            runAfter = @{ INIT_CommandKey = @('Succeeded') }
        }
        INIT_RequestKey = [ordered]@{
            type     = 'InitializeVariable'
            inputs   = [ordered]@{
                variables = @(@{
                        name  = 'RequestKey'
                        type = 'string'
                        value = "@coalesce(triggerOutputs()?['body/RequestKey'],'')"
                    })
            }
            runAfter = @{ INIT_CommandType = @('Succeeded') }
        }
        INIT_Payload = [ordered]@{
            type     = 'InitializeVariable'
            inputs   = [ordered]@{
                variables = @(@{
                        name  = 'Payload'
                        type = 'object'
                        value = "@json(if(empty(coalesce(triggerOutputs()?['body/PayloadJson'],'')),'{}',coalesce(triggerOutputs()?['body/PayloadJson'],'{}')))"
                    })
            }
            runAfter = @{ INIT_RequestKey = @('Succeeded') }
        }
        INIT_NextStepKey = [ordered]@{
            type     = 'InitializeVariable'
            inputs   = [ordered]@{
                variables = @(@{ name = 'NextStepKey'; type = 'string'; value = '' })
            }
            runAfter = @{ INIT_Payload = @('Succeeded') }
        }
        INIT_NextStepOrder = [ordered]@{
            type     = 'InitializeVariable'
            inputs   = [ordered]@{
                variables = @(@{ name = 'NextStepOrder'; type = 'integer'; value = 0 })
            }
            runAfter = @{ INIT_NextStepKey = @('Succeeded') }
        }
        INIT_NextStepKind = [ordered]@{
            type     = 'InitializeVariable'
            inputs   = [ordered]@{
                variables = @(@{ name = 'NextStepKind'; type = 'string'; value = 'Department' })
            }
            runAfter = @{ INIT_NextStepOrder = @('Succeeded') }
        }
        INIT_NextReqStatus = [ordered]@{
            type     = 'InitializeVariable'
            inputs   = [ordered]@{
                variables = @(@{ name = 'NextReqStatus'; type = 'string'; value = 'InReview' })
            }
            runAfter = @{ INIT_NextStepKind = @('Succeeded') }
        }
        INIT_NextWiState = [ordered]@{
            type     = 'InitializeVariable'
            inputs   = [ordered]@{
                variables = @(@{ name = 'NextWiState'; type = 'string'; value = 'InReview' })
            }
            runAfter = @{ INIT_NextReqStatus = @('Succeeded') }
        }
        INIT_NextOU = [ordered]@{
            type     = 'InitializeVariable'
            inputs   = [ordered]@{
                variables = @(@{ name = 'NextOU'; type = 'string'; value = '' })
            }
            runAfter = @{ INIT_NextWiState = @('Succeeded') }
        }
        INIT_StepInstanceKey = [ordered]@{
            type     = 'InitializeVariable'
            inputs   = [ordered]@{
                variables = @(@{ name = 'StepInstanceKey'; type = 'string'; value = '' })
            }
            runAfter = @{ INIT_NextOU = @('Succeeded') }
        }
        INIT_MasterId = [ordered]@{
            type     = 'InitializeVariable'
            inputs   = [ordered]@{
                variables = @(@{ name = 'MasterId'; type = 'string'; value = '' })
            }
            runAfter = @{ INIT_StepInstanceKey = @('Succeeded') }
        }
        INIT_WorkItemId = [ordered]@{
            type     = 'InitializeVariable'
            inputs   = [ordered]@{
                variables = @(@{ name = 'WorkItemId'; type = 'string'; value = '' })
            }
            runAfter = @{ INIT_MasterId = @('Succeeded') }
        }
        INIT_ReviewRound = [ordered]@{
            type     = 'InitializeVariable'
            inputs   = [ordered]@{
                variables = @(@{ name = 'ReviewRound'; type = 'integer'; value = 1 })
            }
            runAfter = @{ INIT_WorkItemId = @('Succeeded') }
        }
        INIT_Error = [ordered]@{
            type     = 'InitializeVariable'
            inputs   = [ordered]@{
                variables = @(@{ name = 'ErrorMessage'; type = 'string'; value = '' })
            }
            runAfter = @{ INIT_ReviewRound = @('Succeeded') }
        }

        IF_AlreadyDone = [ordered]@{
            type       = 'If'
            runAfter   = @{ INIT_Error = @('Succeeded') }
            expression = [ordered]@{
                and = @(
                    [ordered]@{
                        equals = @(
                            "@coalesce(triggerOutputs()?['body/State'], triggerOutputs()?['body/State/Value'], '')"
                            'Succeeded'
                        )
                    }
                )
            }
            actions    = [ordered]@{
                TERM_AlreadySucceeded = [ordered]@{
                    type   = 'Terminate'
                    # runError only allowed when runStatus = Failed
                    inputs = [ordered]@{ runStatus = 'Succeeded' }
                }
            }
            else       = [ordered]@{
                actions = [ordered]@{
                    HTTP_ClaimProcessing = [ordered]@{
                        type   = 'OpenApiConnection'
                        inputs = [ordered]@{
                            host           = [ordered]@{
                                connectionName = 'shared_sharepointonline'
                                operationId    = 'HttpRequest'
                                apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                            }
                            parameters     = [ordered]@{
                                dataset             = $site
                                'parameters/method'  = 'POST'
                                'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(triggerOutputs()?['body/ID']), ')')"
                                'parameters/headers' = [ordered]@{
                                    Accept          = 'application/json;odata=nometadata'
                                    'Content-Type'  = 'application/json;odata=nometadata'
                                    'IF-MATCH'      = '*'
                                    'X-HTTP-Method' = 'MERGE'
                                }
                                'parameters/body'    = '{"State":"Processing"}'
                            }
                            authentication = "@parameters('`$authentication')"
                        }
                    }
                    SW_CommandType = [ordered]@{
                        type       = 'Switch'
                        expression = "@variables('CommandType')"
                        runAfter   = @{ HTTP_ClaimProcessing = @('Succeeded') }
                        cases      = [ordered]@{
                            Case_CREATE = [ordered]@{
                                case    = 'CREATE_REQUEST'
                                actions = [ordered]@{
                                    SET_CreateKeys = [ordered]@{
                                        type   = 'SetVariable'
                                        inputs = [ordered]@{
                                            name  = 'RequestKey'
                                            value = "@concat('PAY-', variables('CommandKey'))"
                                        }
                                    }
                                    SET_CreateSIK = [ordered]@{
                                        type     = 'SetVariable'
                                        runAfter = @{ SET_CreateKeys = @('Succeeded') }
                                        inputs   = [ordered]@{
                                            name  = 'StepInstanceKey'
                                            value = "@concat(variables('RequestKey'),'|BPCM1_PREPARE|',variables('CommandKey'))"
                                        }
                                    }
                                    HTTP_CreateMaster = [ordered]@{
                                        type     = 'OpenApiConnection'
                                        runAfter = @{ SET_CreateSIK = @('Succeeded') }
                                        inputs   = [ordered]@{
                                            host           = [ordered]@{
                                                connectionName = 'shared_sharepointonline'
                                                operationId    = 'HttpRequest'
                                                apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                            }
                                            parameters     = [ordered]@{
                                                dataset             = $site
                                                'parameters/method'  = 'POST'
                                                'parameters/uri'     = "_api/web/lists(guid'$guidRequests')/items"
                                                'parameters/headers' = [ordered]@{
                                                    Accept         = 'application/json;odata=nometadata'
                                                    'Content-Type' = 'application/json;odata=nometadata'
                                                }
                                                'parameters/body'    = "@json(concat('{""Title"":""', variables('RequestKey'), '"",""RequestKey"":""', variables('RequestKey'), '"",""CreatedOUCode"":""', coalesce(variables('Payload')?['createdOUCode'],'OU_BPCM1'), '"",""CreatorUPN"":""', coalesce(variables('Payload')?['creatorUPN'],'admin@local'), '"",""PaymentTypeCode"":""', coalesce(variables('Payload')?['paymentTypeCode'],'SPV_PAYMENT'), '"",""WorkflowCode"":""EMI_PAY_SPV"",""WorkflowVersion"":1,""ChecklistVersion"":1,""ReviewRound"":1,""CurrentStepKey"":""BPCM1_PREPARE"",""CurrentStepInstanceKey"":""', variables('StepInstanceKey'), '"",""CurrentOUCode"":""', coalesce(variables('Payload')?['createdOUCode'],'OU_BPCM1'), '"",""Status"":""Draft"",""IsLocked"":false,""ArchiveStatus"":""NotStarted"",""Explanation"":""Phase1 CREATE""}'))"
                                            }
                                            authentication = "@parameters('`$authentication')"
                                        }
                                    }
                                    HTTP_CreateWorkItem = [ordered]@{
                                        type     = 'OpenApiConnection'
                                        runAfter = @{ HTTP_CreateMaster = @('Succeeded') }
                                        inputs   = [ordered]@{
                                            host           = [ordered]@{
                                                connectionName = 'shared_sharepointonline'
                                                operationId    = 'HttpRequest'
                                                apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                            }
                                            parameters     = [ordered]@{
                                                dataset             = $site
                                                'parameters/method'  = 'POST'
                                                'parameters/uri'     = "_api/web/lists(guid'$guidWorkItems')/items"
                                                'parameters/headers' = [ordered]@{
                                                    Accept         = 'application/json;odata=nometadata'
                                                    'Content-Type' = 'application/json;odata=nometadata'
                                                }
                                                'parameters/body'    = "@json(concat('{""Title"":""', variables('RequestKey'), '-BPCM1_PREPARE"",""RequestKey"":""', variables('RequestKey'), '"",""StepInstanceKey"":""', variables('StepInstanceKey'), '"",""ReviewRound"":1,""StepKey"":""BPCM1_PREPARE"",""StepOrder"":1,""StepKind"":""Department"",""ResponsibleOUCode"":""', coalesce(variables('Payload')?['createdOUCode'],'OU_BPCM1'), '"",""State"":""InReview"",""Decision"":""Pending""}'))"
                                            }
                                            authentication = "@parameters('`$authentication')"
                                        }
                                    }
                                    HTTP_CreateChecklist_DOC_REQUEST = [ordered]@{
                                        type     = 'OpenApiConnection'
                                        runAfter = @{ HTTP_CreateWorkItem = @('Succeeded') }
                                        inputs   = [ordered]@{
                                            host           = [ordered]@{
                                                connectionName = 'shared_sharepointonline'
                                                operationId    = 'HttpRequest'
                                                apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                            }
                                            parameters     = [ordered]@{
                                                dataset             = $site
                                                'parameters/method'  = 'POST'
                                                'parameters/uri'     = "_api/web/lists(guid'$guidChecklist')/items"
                                                'parameters/headers' = [ordered]@{
                                                    Accept         = 'application/json;odata=nometadata'
                                                    'Content-Type' = 'application/json;odata=nometadata'
                                                }
                                                'parameters/body'    = "@json(concat('{""Title"":""', variables('RequestKey'), '-DOC_REQUEST"",""RequestKey"":""', variables('RequestKey'), '"",""ChecklistItemKey"":""', variables('RequestKey'), '|DOC_REQUEST"",""ItemCode"":""DOC_REQUEST"",""ItemLabel"":""De nghi thanh toan"",""IsRequired"":true,""MinFileCount"":1,""UploadedCount"":0,""ItemStatus"":""Missing"",""IsLocked"":false}'))"
                                            }
                                            authentication = "@parameters('`$authentication')"
                                        }
                                    }
                                    HTTP_CreateChecklist_DOC_INVOICE = [ordered]@{
                                        type     = 'OpenApiConnection'
                                        runAfter = @{ HTTP_CreateChecklist_DOC_REQUEST = @('Succeeded') }
                                        inputs   = [ordered]@{
                                            host           = [ordered]@{
                                                connectionName = 'shared_sharepointonline'
                                                operationId    = 'HttpRequest'
                                                apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                            }
                                            parameters     = [ordered]@{
                                                dataset             = $site
                                                'parameters/method'  = 'POST'
                                                'parameters/uri'     = "_api/web/lists(guid'$guidChecklist')/items"
                                                'parameters/headers' = [ordered]@{
                                                    Accept         = 'application/json;odata=nometadata'
                                                    'Content-Type' = 'application/json;odata=nometadata'
                                                }
                                                'parameters/body'    = "@json(concat('{""Title"":""', variables('RequestKey'), '-DOC_INVOICE"",""RequestKey"":""', variables('RequestKey'), '"",""ChecklistItemKey"":""', variables('RequestKey'), '|DOC_INVOICE"",""ItemCode"":""DOC_INVOICE"",""ItemLabel"":""Hoa don / chung tu"",""IsRequired"":true,""MinFileCount"":1,""UploadedCount"":0,""ItemStatus"":""Missing"",""IsLocked"":false}'))"
                                            }
                                            authentication = "@parameters('`$authentication')"
                                        }
                                    }
                                    HTTP_MarkSucceeded_Create = [ordered]@{
                                        type     = 'OpenApiConnection'
                                        runAfter = @{ HTTP_CreateChecklist_DOC_INVOICE = @('Succeeded') }
                                        inputs   = [ordered]@{
                                            host           = [ordered]@{
                                                connectionName = 'shared_sharepointonline'
                                                operationId    = 'HttpRequest'
                                                apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                            }
                                            parameters     = [ordered]@{
                                                dataset             = $site
                                                'parameters/method'  = 'POST'
                                                'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(triggerOutputs()?['body/ID']), ')')"
                                                'parameters/headers' = [ordered]@{
                                                    Accept          = 'application/json;odata=nometadata'
                                                    'Content-Type'  = 'application/json;odata=nometadata'
                                                    'IF-MATCH'      = '*'
                                                    'X-HTTP-Method' = 'MERGE'
                                                }
                                                'parameters/body'    = "@json(concat('{""State"":""Succeeded"",""RequestKey"":""', variables('RequestKey'), '"",""StepInstanceKey"":""', variables('StepInstanceKey'), '"",""ProcessedAt"":""', utcNow(), '"",""ErrorMessage"":""""}'))"
                                            }
                                            authentication = "@parameters('`$authentication')"
                                        }
                                    }
                                }
                            }
                            Case_SUBMIT = [ordered]@{
                                case    = 'SUBMIT'
                                actions = [ordered]@{
                                    HTTP_FindMaster_Submit = [ordered]@{
                                        type   = 'OpenApiConnection'
                                        inputs = [ordered]@{
                                            host           = [ordered]@{
                                                connectionName = 'shared_sharepointonline'
                                                operationId    = 'HttpRequest'
                                                apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                            }
                                            parameters     = [ordered]@{
                                                dataset             = $site
                                                'parameters/method'  = 'GET'
                                                'parameters/uri'     = "@concat('_api/web/lists(guid''$guidRequests'')/items?`$filter=RequestKey eq ''', replace(variables('RequestKey'),'''',''''''), '''&`$top=2')"
                                                'parameters/headers' = [ordered]@{ Accept = 'application/json;odata=nometadata' }
                                            }
                                            authentication = "@parameters('`$authentication')"
                                        }
                                    }
                                    IF_SubmitValid = [ordered]@{
                                        type       = 'If'
                                        runAfter   = @{ HTTP_FindMaster_Submit = @('Succeeded') }
                                        expression = [ordered]@{
                                            and = @(
                                                [ordered]@{ equals = @("@length(body('HTTP_FindMaster_Submit')?['value'])", 1) }
                                                [ordered]@{
                                                    or = @(
                                                        [ordered]@{ equals = @("@first(body('HTTP_FindMaster_Submit')?['value'])?['Status']", 'Draft') }
                                                        [ordered]@{ equals = @("@first(body('HTTP_FindMaster_Submit')?['value'])?['Status']", 'Returned') }
                                                    )
                                                }
                                                [ordered]@{ equals = @("@first(body('HTTP_FindMaster_Submit')?['value'])?['CurrentStepKey']", 'BPCM1_PREPARE') }
                                            )
                                        }
                                        actions    = [ordered]@{
                                            SET_MasterId_Submit = [ordered]@{
                                                type   = 'SetVariable'
                                                inputs = [ordered]@{
                                                    name  = 'MasterId'
                                                    value = "@string(first(body('HTTP_FindMaster_Submit')?['value'])?['Id'])"
                                                }
                                            }
                                            SET_Round_Submit = [ordered]@{
                                                type     = 'SetVariable'
                                                runAfter = @{ SET_MasterId_Submit = @('Succeeded') }
                                                inputs   = [ordered]@{
                                                    name  = 'ReviewRound'
                                                    # Kit: chỉ tăng ReviewRound khi SUBMIT lại từ Returned
                                                    value = "@if(equals(first(body('HTTP_FindMaster_Submit')?['value'])?['Status'],'Returned'),add(int(coalesce(first(body('HTTP_FindMaster_Submit')?['value'])?['ReviewRound'],1)),1),int(coalesce(first(body('HTTP_FindMaster_Submit')?['value'])?['ReviewRound'],1)))"
                                                }
                                            }
                                            SET_OldSIK_Submit = [ordered]@{
                                                type     = 'SetVariable'
                                                runAfter = @{ SET_Round_Submit = @('Succeeded') }
                                                inputs   = [ordered]@{
                                                    name  = 'StepInstanceKey'
                                                    value = "@coalesce(first(body('HTTP_FindMaster_Submit')?['value'])?['CurrentStepInstanceKey'],'')"
                                                }
                                            }
                                            HTTP_GetChecklist_Submit = [ordered]@{
                                                type     = 'OpenApiConnection'
                                                runAfter = @{ SET_OldSIK_Submit = @('Succeeded') }
                                                inputs   = [ordered]@{
                                                    host           = [ordered]@{
                                                        connectionName = 'shared_sharepointonline'
                                                        operationId    = 'HttpRequest'
                                                        apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                    }
                                                    parameters     = [ordered]@{
                                                        dataset             = $site
                                                        'parameters/method'  = 'GET'
                                                        'parameters/uri'     = "@concat('_api/web/lists(guid''$guidChecklist'')/items?`$filter=RequestKey eq ''', replace(variables('RequestKey'),'''',''''''), ''' and IsRequired eq 1&`$top=50')"
                                                        'parameters/headers' = [ordered]@{ Accept = 'application/json;odata=nometadata' }
                                                    }
                                                    authentication = "@parameters('`$authentication')"
                                                }
                                            }
                                            FILTER_IncompleteChecklist = [ordered]@{
                                                type     = 'Query'
                                                runAfter = @{ HTTP_GetChecklist_Submit = @('Succeeded') }
                                                inputs   = [ordered]@{
                                                    from  = "@body('HTTP_GetChecklist_Submit')?['value']"
                                                    where = "@less(int(coalesce(item()?['UploadedCount'],0)),int(coalesce(item()?['MinFileCount'],1)))"
                                                }
                                            }
                                            IF_ChecklistReady = [ordered]@{
                                                type       = 'If'
                                                runAfter   = @{ FILTER_IncompleteChecklist = @('Succeeded') }
                                                expression = [ordered]@{
                                                    or = @(
                                                        [ordered]@{ equals = @("@variables('Payload')?['skipChecklistForPilot']", $true) }
                                                        [ordered]@{
                                                            and = @(
                                                                [ordered]@{ greater = @("@length(body('HTTP_GetChecklist_Submit')?['value'])", 0) }
                                                                [ordered]@{ equals = @("@length(body('FILTER_IncompleteChecklist'))", 0) }
                                                            )
                                                        }
                                                    )
                                                }
                                                actions    = [ordered]@{
                                                    HTTP_FindWI_Submit = [ordered]@{
                                                        type   = 'OpenApiConnection'
                                                        inputs = [ordered]@{
                                                            host           = [ordered]@{
                                                                connectionName = 'shared_sharepointonline'
                                                                operationId    = 'HttpRequest'
                                                                apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                            }
                                                            parameters     = [ordered]@{
                                                                dataset             = $site
                                                                'parameters/method'  = 'GET'
                                                                'parameters/uri'     = "@concat('_api/web/lists(guid''$guidWorkItems'')/items?`$filter=StepInstanceKey eq ''', replace(variables('StepInstanceKey'),'''',''''''), '''&`$top=2')"
                                                                'parameters/headers' = [ordered]@{ Accept = 'application/json;odata=nometadata' }
                                                            }
                                                            authentication = "@parameters('`$authentication')"
                                                        }
                                                    }
                                                    HTTP_CloseWI_Submit = [ordered]@{
                                                        type     = 'OpenApiConnection'
                                                        runAfter = @{ HTTP_FindWI_Submit = @('Succeeded') }
                                                        inputs   = [ordered]@{
                                                            host           = [ordered]@{
                                                                connectionName = 'shared_sharepointonline'
                                                                operationId    = 'HttpRequest'
                                                                apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                            }
                                                            parameters     = [ordered]@{
                                                                dataset             = $site
                                                                'parameters/method'  = 'POST'
                                                                'parameters/uri'     = "@concat('_api/web/lists(guid''$guidWorkItems'')/items(', string(first(body('HTTP_FindWI_Submit')?['value'])?['Id']), ')')"
                                                                'parameters/headers' = [ordered]@{
                                                                    Accept          = 'application/json;odata=nometadata'
                                                                    'Content-Type'  = 'application/json;odata=nometadata'
                                                                    'IF-MATCH'      = '*'
                                                                    'X-HTTP-Method' = 'MERGE'
                                                                }
                                                                'parameters/body'    = "@json(concat('{""State"":""Completed"",""Decision"":""Accepted"",""ClosedAt"":""', utcNow(), '""}'))"
                                                            }
                                                            authentication = "@parameters('`$authentication')"
                                                        }
                                                    }
                                                    SET_NewSIK_Submit = [ordered]@{
                                                        type     = 'SetVariable'
                                                        runAfter = @{ HTTP_CloseWI_Submit = @('Succeeded', 'Failed') }
                                                        inputs   = [ordered]@{
                                                            name  = 'StepInstanceKey'
                                                            value = "@concat(variables('RequestKey'),'|BPCM2_TECH|',variables('CommandKey'))"
                                                        }
                                                    }
                                                    HTTP_OpenWI_Submit = [ordered]@{
                                                        type     = 'OpenApiConnection'
                                                        runAfter = @{ SET_NewSIK_Submit = @('Succeeded') }
                                                        inputs   = [ordered]@{
                                                            host           = [ordered]@{
                                                                connectionName = 'shared_sharepointonline'
                                                                operationId    = 'HttpRequest'
                                                                apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                            }
                                                            parameters     = [ordered]@{
                                                                dataset             = $site
                                                                'parameters/method'  = 'POST'
                                                                'parameters/uri'     = "_api/web/lists(guid'$guidWorkItems')/items"
                                                                'parameters/headers' = [ordered]@{
                                                                    Accept         = 'application/json;odata=nometadata'
                                                                    'Content-Type' = 'application/json;odata=nometadata'
                                                                }
                                                                'parameters/body'    = "@json(concat('{""Title"":""', variables('RequestKey'), '-BPCM2_TECH"",""RequestKey"":""', variables('RequestKey'), '"",""StepInstanceKey"":""', variables('StepInstanceKey'), '"",""ReviewRound"":', string(variables('ReviewRound')), ',""StepKey"":""BPCM2_TECH"",""StepOrder"":2,""StepKind"":""Department"",""ResponsibleOUCode"":""OU_BPCM2"",""State"":""InReview"",""Decision"":""Pending""}'))"
                                                            }
                                                            authentication = "@parameters('`$authentication')"
                                                        }
                                                    }
                                                    HTTP_UpdateMaster_Submit = [ordered]@{
                                                        type     = 'OpenApiConnection'
                                                        runAfter = @{ HTTP_OpenWI_Submit = @('Succeeded') }
                                                        inputs   = [ordered]@{
                                                            host           = [ordered]@{
                                                                connectionName = 'shared_sharepointonline'
                                                                operationId    = 'HttpRequest'
                                                                apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                            }
                                                            parameters     = [ordered]@{
                                                                dataset             = $site
                                                                'parameters/method'  = 'POST'
                                                                'parameters/uri'     = "@concat('_api/web/lists(guid''$guidRequests'')/items(', variables('MasterId'), ')')"
                                                                'parameters/headers' = [ordered]@{
                                                                    Accept          = 'application/json;odata=nometadata'
                                                                    'Content-Type'  = 'application/json;odata=nometadata'
                                                                    'IF-MATCH'      = '*'
                                                                    'X-HTTP-Method' = 'MERGE'
                                                                }
                                                                'parameters/body'    = "@json(concat('{""Status"":""InReview"",""CurrentStepKey"":""BPCM2_TECH"",""CurrentStepInstanceKey"":""', variables('StepInstanceKey'), '"",""CurrentOUCode"":""OU_BPCM2"",""IsLocked"":true,""ReviewRound"":', string(variables('ReviewRound')), '}'))"
                                                            }
                                                            authentication = "@parameters('`$authentication')"
                                                        }
                                                    }
                                                    HTTP_MarkSucceeded_Submit = [ordered]@{
                                                        type     = 'OpenApiConnection'
                                                        runAfter = @{ HTTP_UpdateMaster_Submit = @('Succeeded') }
                                                        inputs   = [ordered]@{
                                                            host           = [ordered]@{
                                                                connectionName = 'shared_sharepointonline'
                                                                operationId    = 'HttpRequest'
                                                                apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                            }
                                                            parameters     = [ordered]@{
                                                                dataset             = $site
                                                                'parameters/method'  = 'POST'
                                                                'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(triggerOutputs()?['body/ID']), ')')"
                                                                'parameters/headers' = [ordered]@{
                                                                    Accept          = 'application/json;odata=nometadata'
                                                                    'Content-Type'  = 'application/json;odata=nometadata'
                                                                    'IF-MATCH'      = '*'
                                                                    'X-HTTP-Method' = 'MERGE'
                                                                }
                                                                'parameters/body'    = "@json(concat('{""State"":""Succeeded"",""StepInstanceKey"":""', variables('StepInstanceKey'), '"",""ProcessedAt"":""', utcNow(), '"",""ErrorMessage"":""""}'))"
                                                            }
                                                            authentication = "@parameters('`$authentication')"
                                                        }
                                                    }
                                                }
                                                else       = [ordered]@{
                                                    actions = [ordered]@{
                                                        HTTP_Reject_Checklist = [ordered]@{
                                                            type   = 'OpenApiConnection'
                                                            inputs = [ordered]@{
                                                                host           = [ordered]@{
                                                                    connectionName = 'shared_sharepointonline'
                                                                    operationId    = 'HttpRequest'
                                                                    apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                                }
                                                                parameters     = [ordered]@{
                                                                    dataset             = $site
                                                                    'parameters/method'  = 'POST'
                                                                    'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(triggerOutputs()?['body/ID']), ')')"
                                                                    'parameters/headers' = [ordered]@{
                                                                        Accept          = 'application/json;odata=nometadata'
                                                                        'Content-Type'  = 'application/json;odata=nometadata'
                                                                        'IF-MATCH'      = '*'
                                                                        'X-HTTP-Method' = 'MERGE'
                                                                    }
                                                                    'parameters/body'    = "@json(concat('{""State"":""Rejected"",""ErrorMessage"":""SUBMIT blocked: required checklist incomplete"",""ProcessedAt"":""', utcNow(), '""}'))"
                                                                }
                                                                authentication = "@parameters('`$authentication')"
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        else       = [ordered]@{
                                            actions = [ordered]@{
                                                HTTP_Reject_Submit = [ordered]@{
                                                    type   = 'OpenApiConnection'
                                                    inputs = [ordered]@{
                                                        host           = [ordered]@{
                                                            connectionName = 'shared_sharepointonline'
                                                            operationId    = 'HttpRequest'
                                                            apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                        }
                                                        parameters     = [ordered]@{
                                                            dataset             = $site
                                                            'parameters/method'  = 'POST'
                                                            'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(triggerOutputs()?['body/ID']), ')')"
                                                            'parameters/headers' = [ordered]@{
                                                                Accept          = 'application/json;odata=nometadata'
                                                                'Content-Type'  = 'application/json;odata=nometadata'
                                                                'IF-MATCH'      = '*'
                                                                'X-HTTP-Method' = 'MERGE'
                                                            }
                                                            'parameters/body'    = "@json(concat('{""State"":""Rejected"",""ErrorMessage"":""SUBMIT requires Draft|Returned at BPCM1_PREPARE"",""ProcessedAt"":""', utcNow(), '""}'))"
                                                        }
                                                        authentication = "@parameters('`$authentication')"
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            Case_DECIDE = [ordered]@{
                                case    = 'DECIDE'
                                actions = [ordered]@{
                                    IF_DecidePass = [ordered]@{
                                        type       = 'If'
                                        expression = [ordered]@{
                                            equals = @("@toUpper(string(coalesce(variables('Payload')?['decision'],'PASS')))", 'PASS')
                                        }
                                        actions    = [ordered]@{
                                            HTTP_FindMaster_Decide = [ordered]@{
                                                type   = 'OpenApiConnection'
                                                inputs = [ordered]@{
                                                    host           = [ordered]@{
                                                        connectionName = 'shared_sharepointonline'
                                                        operationId    = 'HttpRequest'
                                                        apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                    }
                                                    parameters     = [ordered]@{
                                                        dataset             = $site
                                                        'parameters/method'  = 'GET'
                                                        'parameters/uri'     = "@concat('_api/web/lists(guid''$guidRequests'')/items?`$filter=RequestKey eq ''', replace(variables('RequestKey'),'''',''''''), '''&`$top=2')"
                                                        'parameters/headers' = [ordered]@{ Accept = 'application/json;odata=nometadata' }
                                                    }
                                                    authentication = "@parameters('`$authentication')"
                                                }
                                            }
                                            COMPOSE_Next_Decide = [ordered]@{
                                                type     = 'Compose'
                                                runAfter = @{ HTTP_FindMaster_Decide = @('Succeeded') }
                                                inputs   = "@first(body('HTTP_FindMaster_Decide')?['value'])?['CurrentStepKey']"
                                            }
                                            SET_Next_Decide = [ordered]@{
                                                type     = 'SetVariable'
                                                runAfter = @{ COMPOSE_Next_Decide = @('Succeeded') }
                                                inputs   = [ordered]@{
                                                    name  = 'NextStepKey'
                                                    value = "@if(equals(outputs('COMPOSE_Next_Decide'),'BPCM2_TECH'),'BPCM3_PRICE',if(equals(outputs('COMPOSE_Next_Decide'),'BPCM3_PRICE'),'TCKT_CHECK',if(equals(outputs('COMPOSE_Next_Decide'),'TCKT_CHECK'),'CHAIR_APPROVE',if(equals(outputs('COMPOSE_Next_Decide'),'CHAIR_APPROVE'),'TCKT_PAY','INVALID'))))"
                                                }
                                            }
                                            SET_Meta_Decide = [ordered]@{
                                                type     = 'Compose'
                                                runAfter = @{ SET_Next_Decide = @('Succeeded') }
                                                inputs   = [ordered]@{
                                                    order  = "@if(equals(variables('NextStepKey'),'BPCM3_PRICE'),3,if(equals(variables('NextStepKey'),'TCKT_CHECK'),4,if(equals(variables('NextStepKey'),'CHAIR_APPROVE'),5,if(equals(variables('NextStepKey'),'TCKT_PAY'),6,0))))"
                                                    kind   = "@if(equals(variables('NextStepKey'),'CHAIR_APPROVE'),'Approval',if(equals(variables('NextStepKey'),'TCKT_PAY'),'Payment','Department'))"
                                                    status = "@if(equals(variables('NextStepKey'),'CHAIR_APPROVE'),'AwaitManager',if(equals(variables('NextStepKey'),'TCKT_PAY'),'PendingPayment','InReview'))"
                                                    wi     = "@if(equals(variables('NextStepKey'),'CHAIR_APPROVE'),'AwaitManager','InReview')"
                                                    ou     = "@if(equals(variables('NextStepKey'),'BPCM3_PRICE'),'OU_BPCM3',if(equals(variables('NextStepKey'),'TCKT_CHECK'),'OU_TCKT',if(equals(variables('NextStepKey'),'CHAIR_APPROVE'),'OU_CHAIR',if(equals(variables('NextStepKey'),'TCKT_PAY'),'OU_TCKT',''))))"
                                                }
                                            }
                                            IF_NextValid = [ordered]@{
                                                type       = 'If'
                                                runAfter   = @{ SET_Meta_Decide = @('Succeeded') }
                                                expression = [ordered]@{
                                                    and = @(
                                                        [ordered]@{ equals = @("@length(body('HTTP_FindMaster_Decide')?['value'])", 1) }
                                                        [ordered]@{ not = [ordered]@{ equals = @("@variables('NextStepKey')", 'INVALID') } }
                                                        [ordered]@{
                                                            or = @(
                                                                [ordered]@{ equals = @("@outputs('COMPOSE_Next_Decide')", 'BPCM2_TECH') }
                                                                [ordered]@{ equals = @("@outputs('COMPOSE_Next_Decide')", 'BPCM3_PRICE') }
                                                                [ordered]@{ equals = @("@outputs('COMPOSE_Next_Decide')", 'TCKT_CHECK') }
                                                                [ordered]@{ equals = @("@outputs('COMPOSE_Next_Decide')", 'CHAIR_APPROVE') }
                                                            )
                                                        }
                                                    )
                                                }
                                                actions    = [ordered]@{
                                                    SET_MasterId_Decide = [ordered]@{
                                                        type   = 'SetVariable'
                                                        inputs = [ordered]@{
                                                            name  = 'MasterId'
                                                            value = "@string(first(body('HTTP_FindMaster_Decide')?['value'])?['Id'])"
                                                        }
                                                    }
                                                    SET_Round_Decide = [ordered]@{
                                                        type     = 'SetVariable'
                                                        runAfter = @{ SET_MasterId_Decide = @('Succeeded') }
                                                        inputs   = [ordered]@{
                                                            name  = 'ReviewRound'
                                                            value = "@int(coalesce(first(body('HTTP_FindMaster_Decide')?['value'])?['ReviewRound'],1))"
                                                        }
                                                    }
                                                    SET_OldSIK_Decide = [ordered]@{
                                                        type     = 'SetVariable'
                                                        runAfter = @{ SET_Round_Decide = @('Succeeded') }
                                                        inputs   = [ordered]@{
                                                            name  = 'StepInstanceKey'
                                                            value = "@coalesce(first(body('HTTP_FindMaster_Decide')?['value'])?['CurrentStepInstanceKey'],'')"
                                                        }
                                                    }
                                                    IF_ChairDueReady = [ordered]@{
                                                        type       = 'If'
                                                        runAfter   = @{ SET_OldSIK_Decide = @('Succeeded') }
                                                        expression = [ordered]@{
                                                            or = @(
                                                                [ordered]@{ not = [ordered]@{ equals = @("@outputs('COMPOSE_Next_Decide')", 'CHAIR_APPROVE') } }
                                                                [ordered]@{ equals = @("@variables('Payload')?['skipPaymentDueAtForPilot']", $true) }
                                                                [ordered]@{ not = [ordered]@{ empty = @("@coalesce(variables('Payload')?['paymentDueAt'],'')") } }
                                                            )
                                                        }
                                                        actions    = [ordered]@{
                                                            HTTP_FindWI_Decide = [ordered]@{
                                                                type   = 'OpenApiConnection'
                                                                inputs = [ordered]@{
                                                                    host           = [ordered]@{
                                                                        connectionName = 'shared_sharepointonline'
                                                                        operationId    = 'HttpRequest'
                                                                        apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                                    }
                                                                    parameters     = [ordered]@{
                                                                        dataset             = $site
                                                                        'parameters/method'  = 'GET'
                                                                        'parameters/uri'     = "@concat('_api/web/lists(guid''$guidWorkItems'')/items?`$filter=StepInstanceKey eq ''', replace(variables('StepInstanceKey'),'''',''''''), '''&`$top=2')"
                                                                        'parameters/headers' = [ordered]@{ Accept = 'application/json;odata=nometadata' }
                                                                    }
                                                                    authentication = "@parameters('`$authentication')"
                                                                }
                                                            }
                                                            HTTP_CloseWI_Decide = [ordered]@{
                                                                type     = 'OpenApiConnection'
                                                                runAfter = @{ HTTP_FindWI_Decide = @('Succeeded') }
                                                                inputs   = [ordered]@{
                                                                    host           = [ordered]@{
                                                                        connectionName = 'shared_sharepointonline'
                                                                        operationId    = 'HttpRequest'
                                                                        apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                                    }
                                                                    parameters     = [ordered]@{
                                                                        dataset             = $site
                                                                        'parameters/method'  = 'POST'
                                                                        'parameters/uri'     = "@concat('_api/web/lists(guid''$guidWorkItems'')/items(', string(first(body('HTTP_FindWI_Decide')?['value'])?['Id']), ')')"
                                                                        'parameters/headers' = [ordered]@{
                                                                            Accept          = 'application/json;odata=nometadata'
                                                                            'Content-Type'  = 'application/json;odata=nometadata'
                                                                            'IF-MATCH'      = '*'
                                                                            'X-HTTP-Method' = 'MERGE'
                                                                        }
                                                                        'parameters/body'    = "@json(concat('{""State"":""Completed"",""Decision"":""', if(equals(outputs('COMPOSE_Next_Decide'),'CHAIR_APPROVE'),'Approved','Accepted'), '"",""ClosedAt"":""', utcNow(), '""}'))"
                                                                    }
                                                                    authentication = "@parameters('`$authentication')"
                                                                }
                                                            }
                                                            SET_NewSIK_Decide = [ordered]@{
                                                                type     = 'SetVariable'
                                                                runAfter = @{ HTTP_CloseWI_Decide = @('Succeeded', 'Failed') }
                                                                inputs   = [ordered]@{
                                                                    name  = 'StepInstanceKey'
                                                                    value = "@concat(variables('RequestKey'),'|',variables('NextStepKey'),'|',variables('CommandKey'))"
                                                                }
                                                            }
                                                            HTTP_OpenWI_Decide = [ordered]@{
                                                                type     = 'OpenApiConnection'
                                                                runAfter = @{ SET_NewSIK_Decide = @('Succeeded') }
                                                                inputs   = [ordered]@{
                                                                    host           = [ordered]@{
                                                                        connectionName = 'shared_sharepointonline'
                                                                        operationId    = 'HttpRequest'
                                                                        apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                                    }
                                                                    parameters     = [ordered]@{
                                                                        dataset             = $site
                                                                        'parameters/method'  = 'POST'
                                                                        'parameters/uri'     = "_api/web/lists(guid'$guidWorkItems')/items"
                                                                        'parameters/headers' = [ordered]@{
                                                                            Accept         = 'application/json;odata=nometadata'
                                                                            'Content-Type' = 'application/json;odata=nometadata'
                                                                        }
                                                                        'parameters/body'    = "@json(concat('{""Title"":""', variables('RequestKey'), '-', variables('NextStepKey'), '"",""RequestKey"":""', variables('RequestKey'), '"",""StepInstanceKey"":""', variables('StepInstanceKey'), '"",""ReviewRound"":', string(variables('ReviewRound')), ',""StepKey"":""', variables('NextStepKey'), '"",""StepOrder"":', string(outputs('SET_Meta_Decide')?['order']), ',""StepKind"":""', outputs('SET_Meta_Decide')?['kind'], '"",""ResponsibleOUCode"":""', outputs('SET_Meta_Decide')?['ou'], '"",""State"":""', outputs('SET_Meta_Decide')?['wi'], '"",""Decision"":""Pending""}'))"
                                                                    }
                                                                    authentication = "@parameters('`$authentication')"
                                                                }
                                                            }
                                                            HTTP_UpdateMaster_Decide = [ordered]@{
                                                                type     = 'OpenApiConnection'
                                                                runAfter = @{ HTTP_OpenWI_Decide = @('Succeeded') }
                                                                inputs   = [ordered]@{
                                                                    host           = [ordered]@{
                                                                        connectionName = 'shared_sharepointonline'
                                                                        operationId    = 'HttpRequest'
                                                                        apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                                    }
                                                                    parameters     = [ordered]@{
                                                                        dataset             = $site
                                                                        'parameters/method'  = 'POST'
                                                                        'parameters/uri'     = "@concat('_api/web/lists(guid''$guidRequests'')/items(', variables('MasterId'), ')')"
                                                                        'parameters/headers' = [ordered]@{
                                                                            Accept          = 'application/json;odata=nometadata'
                                                                            'Content-Type'  = 'application/json;odata=nometadata'
                                                                            'IF-MATCH'      = '*'
                                                                            'X-HTTP-Method' = 'MERGE'
                                                                        }
                                                                        'parameters/body'    = "@json(concat('{""Status"":""', outputs('SET_Meta_Decide')?['status'], '"",""CurrentStepKey"":""', variables('NextStepKey'), '"",""CurrentStepInstanceKey"":""', variables('StepInstanceKey'), '"",""CurrentOUCode"":""', outputs('SET_Meta_Decide')?['ou'], '""', if(equals(outputs('COMPOSE_Next_Decide'),'CHAIR_APPROVE'), concat(',""PaymentDueAt"":""', string(variables('Payload')?['paymentDueAt']), '""'), ''), '}'))"
                                                                    }
                                                                    authentication = "@parameters('`$authentication')"
                                                                }
                                                            }
                                                            HTTP_MarkSucceeded_Decide = [ordered]@{
                                                                type     = 'OpenApiConnection'
                                                                runAfter = @{ HTTP_UpdateMaster_Decide = @('Succeeded') }
                                                                inputs   = [ordered]@{
                                                                    host           = [ordered]@{
                                                                        connectionName = 'shared_sharepointonline'
                                                                        operationId    = 'HttpRequest'
                                                                        apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                                    }
                                                                    parameters     = [ordered]@{
                                                                        dataset             = $site
                                                                        'parameters/method'  = 'POST'
                                                                        'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(triggerOutputs()?['body/ID']), ')')"
                                                                        'parameters/headers' = [ordered]@{
                                                                            Accept          = 'application/json;odata=nometadata'
                                                                            'Content-Type'  = 'application/json;odata=nometadata'
                                                                            'IF-MATCH'      = '*'
                                                                            'X-HTTP-Method' = 'MERGE'
                                                                        }
                                                                        'parameters/body'    = "@json(concat('{""State"":""Succeeded"",""StepInstanceKey"":""', variables('StepInstanceKey'), '"",""ProcessedAt"":""', utcNow(), '"",""ErrorMessage"":""""}'))"
                                                                    }
                                                                    authentication = "@parameters('`$authentication')"
                                                                }
                                                            }
                                                        }
                                                        else       = [ordered]@{
                                                            actions = [ordered]@{
                                                                HTTP_Reject_ChairDue = [ordered]@{
                                                                    type   = 'OpenApiConnection'
                                                                    inputs = [ordered]@{
                                                                        host           = [ordered]@{
                                                                            connectionName = 'shared_sharepointonline'
                                                                            operationId    = 'HttpRequest'
                                                                            apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                                        }
                                                                        parameters     = [ordered]@{
                                                                            dataset             = $site
                                                                            'parameters/method'  = 'POST'
                                                                            'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(triggerOutputs()?['body/ID']), ')')"
                                                                            'parameters/headers' = [ordered]@{
                                                                                Accept          = 'application/json;odata=nometadata'
                                                                                'Content-Type'  = 'application/json;odata=nometadata'
                                                                                'IF-MATCH'      = '*'
                                                                                'X-HTTP-Method' = 'MERGE'
                                                                            }
                                                                            'parameters/body'    = "@json(concat('{""State"":""Rejected"",""ErrorMessage"":""CHAIR PASS requires paymentDueAt"",""ProcessedAt"":""', utcNow(), '""}'))"
                                                                        }
                                                                        authentication = "@parameters('`$authentication')"
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                                else       = [ordered]@{
                                                    actions = [ordered]@{
                                                        HTTP_Reject_DecideInvalid = [ordered]@{
                                                            type   = 'OpenApiConnection'
                                                            inputs = [ordered]@{
                                                                host           = [ordered]@{
                                                                    connectionName = 'shared_sharepointonline'
                                                                    operationId    = 'HttpRequest'
                                                                    apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                                }
                                                                parameters     = [ordered]@{
                                                                    dataset             = $site
                                                                    'parameters/method'  = 'POST'
                                                                    'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(triggerOutputs()?['body/ID']), ')')"
                                                                    'parameters/headers' = [ordered]@{
                                                                        Accept          = 'application/json;odata=nometadata'
                                                                        'Content-Type'  = 'application/json;odata=nometadata'
                                                                        'IF-MATCH'      = '*'
                                                                        'X-HTTP-Method' = 'MERGE'
                                                                    }
                                                                    'parameters/body'    = "@json(concat('{""State"":""Rejected"",""ErrorMessage"":""DECIDE PASS not allowed at current step"",""ProcessedAt"":""', utcNow(), '""}'))"
                                                                }
                                                                authentication = "@parameters('`$authentication')"
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        else       = [ordered]@{
                                            actions = [ordered]@{
                                                # Phase 2: DECIDE REJECT -> BPCM1_PREPARE / Returned (ReviewRound giữ nguyên)
                                                HTTP_FindMaster_Reject = [ordered]@{
                                                    type   = 'OpenApiConnection'
                                                    inputs = [ordered]@{
                                                        host           = [ordered]@{
                                                            connectionName = 'shared_sharepointonline'
                                                            operationId    = 'HttpRequest'
                                                            apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                        }
                                                        parameters     = [ordered]@{
                                                            dataset             = $site
                                                            'parameters/method'  = 'GET'
                                                            'parameters/uri'     = "@concat('_api/web/lists(guid''$guidRequests'')/items?`$filter=RequestKey eq ''', replace(variables('RequestKey'),'''',''''''), '''&`$top=2')"
                                                            'parameters/headers' = [ordered]@{ Accept = 'application/json;odata=nometadata' }
                                                        }
                                                        authentication = "@parameters('`$authentication')"
                                                    }
                                                }
                                                COMPOSE_RejectStep = [ordered]@{
                                                    type     = 'Compose'
                                                    runAfter = @{ HTTP_FindMaster_Reject = @('Succeeded') }
                                                    inputs   = "@first(body('HTTP_FindMaster_Reject')?['value'])?['CurrentStepKey']"
                                                }
                                                COMPOSE_RejectReason = [ordered]@{
                                                    type     = 'Compose'
                                                    runAfter = @{ COMPOSE_RejectStep = @('Succeeded') }
                                                    inputs   = "@coalesce(variables('Payload')?['reason'], variables('Payload')?['note'], '')"
                                                }
                                                IF_RejectValid = [ordered]@{
                                                    type       = 'If'
                                                    runAfter   = @{ COMPOSE_RejectReason = @('Succeeded') }
                                                    expression = [ordered]@{
                                                        and = @(
                                                            [ordered]@{ equals = @("@length(body('HTTP_FindMaster_Reject')?['value'])", 1) }
                                                            [ordered]@{
                                                                or = @(
                                                                    [ordered]@{ equals = @("@outputs('COMPOSE_RejectStep')", 'BPCM2_TECH') }
                                                                    [ordered]@{ equals = @("@outputs('COMPOSE_RejectStep')", 'BPCM3_PRICE') }
                                                                    [ordered]@{ equals = @("@outputs('COMPOSE_RejectStep')", 'TCKT_CHECK') }
                                                                    [ordered]@{ equals = @("@outputs('COMPOSE_RejectStep')", 'CHAIR_APPROVE') }
                                                                )
                                                            }
                                                            [ordered]@{ not = [ordered]@{ equals = @("@outputs('COMPOSE_RejectReason')", '') } }
                                                        )
                                                    }
                                                    actions    = [ordered]@{
                                                        SET_MasterId_Reject = [ordered]@{
                                                            type   = 'SetVariable'
                                                            inputs = [ordered]@{
                                                                name  = 'MasterId'
                                                                value = "@string(first(body('HTTP_FindMaster_Reject')?['value'])?['Id'])"
                                                            }
                                                        }
                                                        SET_Round_Reject = [ordered]@{
                                                            type     = 'SetVariable'
                                                            runAfter = @{ SET_MasterId_Reject = @('Succeeded') }
                                                            inputs   = [ordered]@{
                                                                name  = 'ReviewRound'
                                                                value = "@int(coalesce(first(body('HTTP_FindMaster_Reject')?['value'])?['ReviewRound'],1))"
                                                            }
                                                        }
                                                        SET_OldSIK_Reject = [ordered]@{
                                                            type     = 'SetVariable'
                                                            runAfter = @{ SET_Round_Reject = @('Succeeded') }
                                                            inputs   = [ordered]@{
                                                                name  = 'StepInstanceKey'
                                                                value = "@coalesce(first(body('HTTP_FindMaster_Reject')?['value'])?['CurrentStepInstanceKey'],'')"
                                                            }
                                                        }
                                                        HTTP_FindWI_Reject = [ordered]@{
                                                            type     = 'OpenApiConnection'
                                                            runAfter = @{ SET_OldSIK_Reject = @('Succeeded') }
                                                            inputs   = [ordered]@{
                                                                host           = [ordered]@{
                                                                    connectionName = 'shared_sharepointonline'
                                                                    operationId    = 'HttpRequest'
                                                                    apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                                }
                                                                parameters     = [ordered]@{
                                                                    dataset             = $site
                                                                    'parameters/method'  = 'GET'
                                                                    'parameters/uri'     = "@concat('_api/web/lists(guid''$guidWorkItems'')/items?`$filter=StepInstanceKey eq ''', replace(variables('StepInstanceKey'),'''',''''''), '''&`$top=2')"
                                                                    'parameters/headers' = [ordered]@{ Accept = 'application/json;odata=nometadata' }
                                                                }
                                                                authentication = "@parameters('`$authentication')"
                                                            }
                                                        }
                                                        HTTP_CloseWI_Reject = [ordered]@{
                                                            type     = 'OpenApiConnection'
                                                            runAfter = @{ HTTP_FindWI_Reject = @('Succeeded') }
                                                            inputs   = [ordered]@{
                                                                host           = [ordered]@{
                                                                    connectionName = 'shared_sharepointonline'
                                                                    operationId    = 'HttpRequest'
                                                                    apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                                }
                                                                parameters     = [ordered]@{
                                                                    dataset             = $site
                                                                    'parameters/method'  = 'POST'
                                                                    'parameters/uri'     = "@concat('_api/web/lists(guid''$guidWorkItems'')/items(', string(first(body('HTTP_FindWI_Reject')?['value'])?['Id']), ')')"
                                                                    'parameters/headers' = [ordered]@{
                                                                        Accept          = 'application/json;odata=nometadata'
                                                                        'Content-Type'  = 'application/json;odata=nometadata'
                                                                        'IF-MATCH'      = '*'
                                                                        'X-HTTP-Method' = 'MERGE'
                                                                    }
                                                                    'parameters/body'    = "@json(concat('{""State"":""Returned"",""Decision"":""Returned"",""ClosedAt"":""', utcNow(), '""}'))"
                                                                }
                                                                authentication = "@parameters('`$authentication')"
                                                            }
                                                        }
                                                        SET_NewSIK_Reject = [ordered]@{
                                                            type     = 'SetVariable'
                                                            runAfter = @{ HTTP_CloseWI_Reject = @('Succeeded', 'Failed') }
                                                            inputs   = [ordered]@{
                                                                name  = 'StepInstanceKey'
                                                                value = "@concat(variables('RequestKey'),'|BPCM1_PREPARE|',variables('CommandKey'))"
                                                            }
                                                        }
                                                        HTTP_OpenWI_Reject = [ordered]@{
                                                            type     = 'OpenApiConnection'
                                                            runAfter = @{ SET_NewSIK_Reject = @('Succeeded') }
                                                            inputs   = [ordered]@{
                                                                host           = [ordered]@{
                                                                    connectionName = 'shared_sharepointonline'
                                                                    operationId    = 'HttpRequest'
                                                                    apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                                }
                                                                parameters     = [ordered]@{
                                                                    dataset             = $site
                                                                    'parameters/method'  = 'POST'
                                                                    'parameters/uri'     = "_api/web/lists(guid'$guidWorkItems')/items"
                                                                    'parameters/headers' = [ordered]@{
                                                                        Accept         = 'application/json;odata=nometadata'
                                                                        'Content-Type' = 'application/json;odata=nometadata'
                                                                    }
                                                                    'parameters/body'    = "@json(concat('{""Title"":""', variables('RequestKey'), '-BPCM1_PREPARE"",""RequestKey"":""', variables('RequestKey'), '"",""StepInstanceKey"":""', variables('StepInstanceKey'), '"",""ReviewRound"":', string(variables('ReviewRound')), ',""StepKey"":""BPCM1_PREPARE"",""StepOrder"":1,""StepKind"":""Department"",""ResponsibleOUCode"":""', coalesce(first(body('HTTP_FindMaster_Reject')?['value'])?['CreatedOUCode'],'OU_BPCM1'), '"",""State"":""InReview"",""Decision"":""Pending""}'))"
                                                                }
                                                                authentication = "@parameters('`$authentication')"
                                                            }
                                                        }
                                                        HTTP_UpdateMaster_Reject = [ordered]@{
                                                            type     = 'OpenApiConnection'
                                                            runAfter = @{ HTTP_OpenWI_Reject = @('Succeeded') }
                                                            inputs   = [ordered]@{
                                                                host           = [ordered]@{
                                                                    connectionName = 'shared_sharepointonline'
                                                                    operationId    = 'HttpRequest'
                                                                    apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                                }
                                                                parameters     = [ordered]@{
                                                                    dataset             = $site
                                                                    'parameters/method'  = 'POST'
                                                                    'parameters/uri'     = "@concat('_api/web/lists(guid''$guidRequests'')/items(', variables('MasterId'), ')')"
                                                                    'parameters/headers' = [ordered]@{
                                                                        Accept          = 'application/json;odata=nometadata'
                                                                        'Content-Type'  = 'application/json;odata=nometadata'
                                                                        'IF-MATCH'      = '*'
                                                                        'X-HTTP-Method' = 'MERGE'
                                                                    }
                                                                    'parameters/body'    = "@json(concat('{""Status"":""Returned"",""CurrentStepKey"":""BPCM1_PREPARE"",""CurrentStepInstanceKey"":""', variables('StepInstanceKey'), '"",""CurrentOUCode"":""', coalesce(first(body('HTTP_FindMaster_Reject')?['value'])?['CreatedOUCode'],'OU_BPCM1'), '"",""IsLocked"":false}'))"
                                                                }
                                                                authentication = "@parameters('`$authentication')"
                                                            }
                                                        }
                                                        HTTP_MarkSucceeded_Reject = [ordered]@{
                                                            type     = 'OpenApiConnection'
                                                            runAfter = @{ HTTP_UpdateMaster_Reject = @('Succeeded') }
                                                            inputs   = [ordered]@{
                                                                host           = [ordered]@{
                                                                    connectionName = 'shared_sharepointonline'
                                                                    operationId    = 'HttpRequest'
                                                                    apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                                }
                                                                parameters     = [ordered]@{
                                                                    dataset             = $site
                                                                    'parameters/method'  = 'POST'
                                                                    'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(triggerOutputs()?['body/ID']), ')')"
                                                                    'parameters/headers' = [ordered]@{
                                                                        Accept          = 'application/json;odata=nometadata'
                                                                        'Content-Type'  = 'application/json;odata=nometadata'
                                                                        'IF-MATCH'      = '*'
                                                                        'X-HTTP-Method' = 'MERGE'
                                                                    }
                                                                    'parameters/body'    = "@json(concat('{""State"":""Succeeded"",""StepInstanceKey"":""', variables('StepInstanceKey'), '"",""ProcessedAt"":""', utcNow(), '"",""ErrorMessage"":""""}'))"
                                                                }
                                                                authentication = "@parameters('`$authentication')"
                                                            }
                                                        }
                                                    }
                                                    else       = [ordered]@{
                                                        actions = [ordered]@{
                                                            HTTP_Reject_DecideRejectInvalid = [ordered]@{
                                                                type   = 'OpenApiConnection'
                                                                inputs = [ordered]@{
                                                                    host           = [ordered]@{
                                                                        connectionName = 'shared_sharepointonline'
                                                                        operationId    = 'HttpRequest'
                                                                        apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                                    }
                                                                    parameters     = [ordered]@{
                                                                        dataset             = $site
                                                                        'parameters/method'  = 'POST'
                                                                        'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(triggerOutputs()?['body/ID']), ')')"
                                                                        'parameters/headers' = [ordered]@{
                                                                            Accept          = 'application/json;odata=nometadata'
                                                                            'Content-Type'  = 'application/json;odata=nometadata'
                                                                            'IF-MATCH'      = '*'
                                                                            'X-HTTP-Method' = 'MERGE'
                                                                        }
                                                                        'parameters/body'    = "@json(concat('{""State"":""Rejected"",""ErrorMessage"":""DECIDE REJECT requires reason/note and step BPCM2|BPCM3|TCKT_CHECK|CHAIR"",""ProcessedAt"":""', utcNow(), '""}'))"
                                                                    }
                                                                    authentication = "@parameters('`$authentication')"
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            Case_CONFIRM = [ordered]@{
                                case    = 'CONFIRM_PAYMENT'
                                actions = [ordered]@{
                                    HTTP_FindMaster_Confirm = [ordered]@{
                                        type   = 'OpenApiConnection'
                                        inputs = [ordered]@{
                                            host           = [ordered]@{
                                                connectionName = 'shared_sharepointonline'
                                                operationId    = 'HttpRequest'
                                                apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                            }
                                            parameters     = [ordered]@{
                                                dataset             = $site
                                                'parameters/method'  = 'GET'
                                                'parameters/uri'     = "@concat('_api/web/lists(guid''$guidRequests'')/items?`$filter=RequestKey eq ''', replace(variables('RequestKey'),'''',''''''), '''&`$top=2')"
                                                'parameters/headers' = [ordered]@{ Accept = 'application/json;odata=nometadata' }
                                            }
                                            authentication = "@parameters('`$authentication')"
                                        }
                                    }
                                    IF_ConfirmValid = [ordered]@{
                                        type       = 'If'
                                        runAfter   = @{ HTTP_FindMaster_Confirm = @('Succeeded') }
                                        expression = [ordered]@{
                                            and = @(
                                                [ordered]@{ equals = @("@length(body('HTTP_FindMaster_Confirm')?['value'])", 1) }
                                                [ordered]@{ equals = @("@first(body('HTTP_FindMaster_Confirm')?['value'])?['CurrentStepKey']", 'TCKT_PAY') }
                                                [ordered]@{
                                                    or = @(
                                                        [ordered]@{ equals = @("@first(body('HTTP_FindMaster_Confirm')?['value'])?['Status']", 'PendingPayment') }
                                                        [ordered]@{ equals = @("@first(body('HTTP_FindMaster_Confirm')?['value'])?['Status']", 'InReview') }
                                                    )
                                                }
                                            )
                                        }
                                        actions    = [ordered]@{
                                            SET_MasterId_Confirm = [ordered]@{
                                                type   = 'SetVariable'
                                                inputs = [ordered]@{
                                                    name  = 'MasterId'
                                                    value = "@string(first(body('HTTP_FindMaster_Confirm')?['value'])?['Id'])"
                                                }
                                            }
                                            SET_OldSIK_Confirm = [ordered]@{
                                                type     = 'SetVariable'
                                                runAfter = @{ SET_MasterId_Confirm = @('Succeeded') }
                                                inputs   = [ordered]@{
                                                    name  = 'StepInstanceKey'
                                                    value = "@coalesce(first(body('HTTP_FindMaster_Confirm')?['value'])?['CurrentStepInstanceKey'],'')"
                                                }
                                            }
                                            HTTP_GetUnc_Confirm = [ordered]@{
                                                type     = 'OpenApiConnection'
                                                runAfter = @{ SET_OldSIK_Confirm = @('Succeeded') }
                                                inputs   = [ordered]@{
                                                    host           = [ordered]@{
                                                        connectionName = 'shared_sharepointonline'
                                                        operationId    = 'HttpRequest'
                                                        apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                    }
                                                    parameters     = [ordered]@{
                                                        dataset             = $site
                                                        'parameters/method'  = 'GET'
                                                        'parameters/uri'     = "@if(empty(coalesce(variables('Payload')?['uncDocumentKey'],'')), concat('_api/web/lists(guid''$guidDocIndex'')/items?`$filter=RequestKey eq ''', replace(variables('RequestKey'),'''',''''''), ''' and IsCurrent eq 1 and DocClass eq ''UNC''&`$top=10'), concat('_api/web/lists(guid''$guidDocIndex'')/items?`$filter=RequestKey eq ''', replace(variables('RequestKey'),'''',''''''), ''' and DocumentKey eq ''', replace(string(variables('Payload')?['uncDocumentKey']),'''',''''''), ''' and IsCurrent eq 1&`$top=2'))"
                                                        'parameters/headers' = [ordered]@{ Accept = 'application/json;odata=nometadata' }
                                                    }
                                                    authentication = "@parameters('`$authentication')"
                                                }
                                            }
                                            FILTER_UncWithFileUrl = [ordered]@{
                                                type     = 'Query'
                                                runAfter = @{ HTTP_GetUnc_Confirm = @('Succeeded') }
                                                inputs   = [ordered]@{
                                                    from  = "@body('HTTP_GetUnc_Confirm')?['value']"
                                                    where = "@not(empty(coalesce(item()?['FileUrl']?['Url'], item()?['FileUrl'], '')))"
                                                }
                                            }
                                            IF_UncReady = [ordered]@{
                                                type       = 'If'
                                                runAfter   = @{ FILTER_UncWithFileUrl = @('Succeeded') }
                                                expression = [ordered]@{
                                                    or = @(
                                                        [ordered]@{ equals = @("@variables('Payload')?['skipUncForPilot']", $true) }
                                                        [ordered]@{
                                                            and = @(
                                                                [ordered]@{ greater = @("@length(body('HTTP_GetUnc_Confirm')?['value'])", 0) }
                                                                [ordered]@{ greater = @("@length(body('FILTER_UncWithFileUrl'))", 0) }
                                                            )
                                                        }
                                                    )
                                                }
                                                actions    = [ordered]@{
                                                    HTTP_FindWI_Confirm = [ordered]@{
                                                        type   = 'OpenApiConnection'
                                                        inputs = [ordered]@{
                                                            host           = [ordered]@{
                                                                connectionName = 'shared_sharepointonline'
                                                                operationId    = 'HttpRequest'
                                                                apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                            }
                                                            parameters     = [ordered]@{
                                                                dataset             = $site
                                                                'parameters/method'  = 'GET'
                                                                'parameters/uri'     = "@concat('_api/web/lists(guid''$guidWorkItems'')/items?`$filter=StepInstanceKey eq ''', replace(variables('StepInstanceKey'),'''',''''''), '''&`$top=2')"
                                                                'parameters/headers' = [ordered]@{ Accept = 'application/json;odata=nometadata' }
                                                            }
                                                            authentication = "@parameters('`$authentication')"
                                                        }
                                                    }
                                                    HTTP_CloseWI_Confirm = [ordered]@{
                                                        type     = 'OpenApiConnection'
                                                        runAfter = @{ HTTP_FindWI_Confirm = @('Succeeded') }
                                                        inputs   = [ordered]@{
                                                            host           = [ordered]@{
                                                                connectionName = 'shared_sharepointonline'
                                                                operationId    = 'HttpRequest'
                                                                apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                            }
                                                            parameters     = [ordered]@{
                                                                dataset             = $site
                                                                'parameters/method'  = 'POST'
                                                                'parameters/uri'     = "@concat('_api/web/lists(guid''$guidWorkItems'')/items(', string(first(body('HTTP_FindWI_Confirm')?['value'])?['Id']), ')')"
                                                                'parameters/headers' = [ordered]@{
                                                                    Accept          = 'application/json;odata=nometadata'
                                                                    'Content-Type'  = 'application/json;odata=nometadata'
                                                                    'IF-MATCH'      = '*'
                                                                    'X-HTTP-Method' = 'MERGE'
                                                                }
                                                                'parameters/body'    = "@json(concat('{""State"":""Completed"",""Decision"":""Approved"",""ClosedAt"":""', utcNow(), '""}'))"
                                                            }
                                                            authentication = "@parameters('`$authentication')"
                                                        }
                                                    }
                                                    SET_ArchiveSIK = [ordered]@{
                                                        type     = 'SetVariable'
                                                        runAfter = @{ HTTP_CloseWI_Confirm = @('Succeeded', 'Failed') }
                                                        inputs   = [ordered]@{
                                                            name  = 'StepInstanceKey'
                                                            value = "@concat(variables('RequestKey'),'|SYSTEM_ARCHIVE|',variables('CommandKey'))"
                                                        }
                                                    }
                                                    HTTP_UpdateMaster_Confirm = [ordered]@{
                                                        type     = 'OpenApiConnection'
                                                        runAfter = @{ SET_ArchiveSIK = @('Succeeded') }
                                                        inputs   = [ordered]@{
                                                            host           = [ordered]@{
                                                                connectionName = 'shared_sharepointonline'
                                                                operationId    = 'HttpRequest'
                                                                apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                            }
                                                            parameters     = [ordered]@{
                                                                dataset             = $site
                                                                'parameters/method'  = 'POST'
                                                                'parameters/uri'     = "@concat('_api/web/lists(guid''$guidRequests'')/items(', variables('MasterId'), ')')"
                                                                'parameters/headers' = [ordered]@{
                                                                    Accept          = 'application/json;odata=nometadata'
                                                                    'Content-Type'  = 'application/json;odata=nometadata'
                                                                    'IF-MATCH'      = '*'
                                                                    'X-HTTP-Method' = 'MERGE'
                                                                }
                                                                'parameters/body'    = "@json(concat('{""Status"":""Archiving"",""ArchiveStatus"":""Pending"",""CurrentStepKey"":""SYSTEM_ARCHIVE"",""CurrentStepInstanceKey"":""', variables('StepInstanceKey'), '"",""PaidAt"":""', utcNow(), '""}'))"
                                                            }
                                                            authentication = "@parameters('`$authentication')"
                                                        }
                                                    }
                                                    HTTP_MarkSucceeded_Confirm = [ordered]@{
                                                        type     = 'OpenApiConnection'
                                                        runAfter = @{ HTTP_UpdateMaster_Confirm = @('Succeeded') }
                                                        inputs   = [ordered]@{
                                                            host           = [ordered]@{
                                                                connectionName = 'shared_sharepointonline'
                                                                operationId    = 'HttpRequest'
                                                                apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                            }
                                                            parameters     = [ordered]@{
                                                                dataset             = $site
                                                                'parameters/method'  = 'POST'
                                                                'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(triggerOutputs()?['body/ID']), ')')"
                                                                'parameters/headers' = [ordered]@{
                                                                    Accept          = 'application/json;odata=nometadata'
                                                                    'Content-Type'  = 'application/json;odata=nometadata'
                                                                    'IF-MATCH'      = '*'
                                                                    'X-HTTP-Method' = 'MERGE'
                                                                }
                                                                'parameters/body'    = "@json(concat('{""State"":""Succeeded"",""StepInstanceKey"":""', variables('StepInstanceKey'), '"",""ProcessedAt"":""', utcNow(), '"",""ErrorMessage"":""""}'))"
                                                            }
                                                            authentication = "@parameters('`$authentication')"
                                                        }
                                                    }
                                                }
                                                else       = [ordered]@{
                                                    actions = [ordered]@{
                                                        HTTP_Reject_Unc = [ordered]@{
                                                            type   = 'OpenApiConnection'
                                                            inputs = [ordered]@{
                                                                host           = [ordered]@{
                                                                    connectionName = 'shared_sharepointonline'
                                                                    operationId    = 'HttpRequest'
                                                                    apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                                }
                                                                parameters     = [ordered]@{
                                                                    dataset             = $site
                                                                    'parameters/method'  = 'POST'
                                                                    'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(triggerOutputs()?['body/ID']), ')')"
                                                                    'parameters/headers' = [ordered]@{
                                                                        Accept          = 'application/json;odata=nometadata'
                                                                        'Content-Type'  = 'application/json;odata=nometadata'
                                                                        'IF-MATCH'      = '*'
                                                                        'X-HTTP-Method' = 'MERGE'
                                                                    }
                                                                    'parameters/body'    = "@json(concat('{""State"":""Rejected"",""ErrorMessage"":""CONFIRM blocked: UNC missing in DocumentIndex (DocClass=UNC, IsCurrent, FileUrl)"",""ProcessedAt"":""', utcNow(), '""}'))"
                                                                }
                                                                authentication = "@parameters('`$authentication')"
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        else       = [ordered]@{
                                            actions = [ordered]@{
                                                HTTP_Reject_Confirm = [ordered]@{
                                                    type   = 'OpenApiConnection'
                                                    inputs = [ordered]@{
                                                        host           = [ordered]@{
                                                            connectionName = 'shared_sharepointonline'
                                                            operationId    = 'HttpRequest'
                                                            apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                        }
                                                        parameters     = [ordered]@{
                                                            dataset             = $site
                                                            'parameters/method'  = 'POST'
                                                            'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(triggerOutputs()?['body/ID']), ')')"
                                                            'parameters/headers' = [ordered]@{
                                                                Accept          = 'application/json;odata=nometadata'
                                                                'Content-Type'  = 'application/json;odata=nometadata'
                                                                'IF-MATCH'      = '*'
                                                                'X-HTTP-Method' = 'MERGE'
                                                            }
                                                            'parameters/body'    = "@json(concat('{""State"":""Rejected"",""ErrorMessage"":""CONFIRM_PAYMENT requires TCKT_PAY / PendingPayment"",""ProcessedAt"":""', utcNow(), '""}'))"
                                                        }
                                                        authentication = "@parameters('`$authentication')"
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        default    = [ordered]@{
                            actions = [ordered]@{
                                HTTP_Reject_Unknown = [ordered]@{
                                    type   = 'OpenApiConnection'
                                    inputs = [ordered]@{
                                        host           = [ordered]@{
                                            connectionName = 'shared_sharepointonline'
                                            operationId    = 'HttpRequest'
                                            apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                        }
                                        parameters     = [ordered]@{
                                            dataset             = $site
                                            'parameters/method'  = 'POST'
                                            'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(triggerOutputs()?['body/ID']), ')')"
                                            'parameters/headers' = [ordered]@{
                                                Accept          = 'application/json;odata=nometadata'
                                                'Content-Type'  = 'application/json;odata=nometadata'
                                                'IF-MATCH'      = '*'
                                                'X-HTTP-Method' = 'MERGE'
                                            }
                                            'parameters/body'    = "@json(concat('{""State"":""Rejected"",""ErrorMessage"":""Unknown CommandType: ', variables('CommandType'), '"",""ProcessedAt"":""', utcNow(), '""}'))"
                                        }
                                        authentication = "@parameters('`$authentication')"
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

$workflowDoc = [ordered]@{
    properties    = [ordered]@{
        connectionReferences = [ordered]@{
            shared_sharepointonline = [ordered]@{
                runtimeSource = 'embedded'
                connection    = [ordered]@{ connectionReferenceLogicalname = 'tfime_sharedsharepointonline_5e343' }
                api           = [ordered]@{ name = 'shared_sharepointonline' }
            }
        }
        definition           = $definition
        templateName         = $null
    }
    schemaVersion = '1.0.0.0'
}

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
function Write-Utf8NoBom([string]$Path, [string]$Content) {
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

$wfPath = Join-Path $staging "Workflows\$workflowFile"
# IMPORTANT: Power Automate rejects UTF-8 BOM ("Unexpected character ﻿")
$jsonText = $workflowDoc | ConvertTo-Json -Depth 100 -Compress:$false
Write-Utf8NoBom -Path $wfPath -Content $jsonText
Write-Utf8NoBom -Path (Join-Path $phaseRoot 'EMI_PAY_CORE_Orchestrator_V1.definition.json') -Content $jsonText

$customizations = @"
<ImportExportXml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" OrganizationVersion="9.2.26103.153" OrganizationSchemaType="Standard" CRMServerServiceabilityVersion="9.2.26103.00153">
  <Entities></Entities>
  <Roles></Roles>
  <Workflows>
    <Workflow WorkflowId="{$workflowId}" Name="EMI_PAY_CORE_Orchestrator_V1">
      <JsonFileName>/Workflows/$workflowFile</JsonFileName>
      <Type>1</Type>
      <Subprocess>0</Subprocess>
      <Category>5</Category>
      <Mode>0</Mode>
      <Scope>4</Scope>
      <OnDemand>0</OnDemand>
      <TriggerOnCreate>0</TriggerOnCreate>
      <TriggerOnDelete>0</TriggerOnDelete>
      <AsyncAutodelete>0</AsyncAutodelete>
      <SyncWorkflowLogOnFailure>0</SyncWorkflowLogOnFailure>
      <StateCode>0</StateCode>
      <StatusCode>1</StatusCode>
      <RunAs>1</RunAs>
      <IsTransacted>1</IsTransacted>
      <IntroducedVersion>1.0.0.2</IntroducedVersion>
      <IsCustomizable>1</IsCustomizable>
      <BusinessProcessType>0</BusinessProcessType>
      <IsCustomProcessingStepAllowedForOtherPublishers>1</IsCustomProcessingStepAllowedForOtherPublishers>
      <ModernFlowType>0</ModernFlowType>
      <PrimaryEntity>none</PrimaryEntity>
      <LocalizedNames>
        <LocalizedName languagecode="1033" description="EMI_PAY_CORE_Orchestrator_V1" />
      </LocalizedNames>
    </Workflow>
  </Workflows>
  <FieldSecurityProfiles></FieldSecurityProfiles>
  <Templates />
  <EntityMaps />
  <EntityRelationships />
  <OrganizationSettings />
  <optionsets />
  <CustomControls />
  <EntityDataProviders />
  <connectionreferences>
    <connectionreference connectionreferencelogicalname="tfime_sharedsharepointonline_5e343">
      <connectionreferencedisplayname>SharePoint EMI_PAY_CORE_V1-5e343</connectionreferencedisplayname>
      <connectorid>/providers/Microsoft.PowerApps/apis/shared_sharepointonline</connectorid>
      <iscustomizable>1</iscustomizable>
      <promptingbehavior>0</promptingbehavior>
      <statecode>0</statecode>
      <statuscode>1</statuscode>
    </connectionreference>
  </connectionreferences>
  <Languages>
    <Language>1033</Language>
  </Languages>
</ImportExportXml>
"@
Write-Utf8NoBom -Path (Join-Path $staging 'customizations.xml') -Content $customizations

$solution = @"
<ImportExportXml version="9.2.26103.153" SolutionPackageVersion="9.2" languagecode="1033" generatedBy="CrmLive" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" OrganizationVersion="9.2.26103.153" OrganizationSchemaType="Standard" CRMServerServiceabilityVersion="9.2.26103.00153">
  <SolutionManifest>
    <UniqueName>EMI_PAY_CORE_V1</UniqueName>
    <LocalizedNames>
      <LocalizedName description="EMI_PAY_CORE_V1" languagecode="1033" />
    </LocalizedNames>
    <Descriptions>
      <Description description="Core Orchestrator: checklist+UNC+CHAIR PaymentDueAt, DECIDE PASS/REJECT, CONFIRM" languagecode="1033" />
    </Descriptions>
    <Version>1.0.0.9</Version>
    <Managed>0</Managed>
    <Publisher>
      <UniqueName>tfime</UniqueName>
      <LocalizedNames>
        <LocalizedName description="tfime" languagecode="1033" />
      </LocalizedNames>
      <Descriptions />
      <EMailAddress xsi:nil="true"></EMailAddress>
      <SupportingWebsiteUrl xsi:nil="true"></SupportingWebsiteUrl>
      <CustomizationPrefix>tfime</CustomizationPrefix>
      <CustomizationOptionValuePrefix>93743</CustomizationOptionValuePrefix>
      <Addresses />
    </Publisher>
    <RootComponents>
      <RootComponent type="29" id="{$workflowId}" behavior="0" />
    </RootComponents>
    <MissingDependencies />
  </SolutionManifest>
</ImportExportXml>
"@
Write-Utf8NoBom -Path (Join-Path $staging 'solution.xml') -Content $solution

$contentTypes = '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/octet-stream" /><Default Extension="json" ContentType="application/octet-stream" /></Types>'
Write-Utf8NoBom -Path (Join-Path $staging '[Content_Types].xml') -Content $contentTypes

if (Test-Path $OutZip) { Remove-Item $OutZip -Force }

# Dataverse expects ZIP entry paths with forward slashes (Compress-Archive uses backslash on Windows).
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$fs = [System.IO.File]::Open($OutZip, [System.IO.FileMode]::Create)
$archive = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($f in @(Get-ChildItem -LiteralPath $staging -Recurse -File)) {
        $rel = $f.FullName.Substring($staging.Length).TrimStart('\', '/')
        $entryName = $rel -replace '\\', '/'
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive, $f.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal)
    }
}
finally {
    $archive.Dispose()
    $fs.Dispose()
}

Write-Host "Built: $OutZip" -ForegroundColor Green
Write-Host "Definition: $(Join-Path $phaseRoot 'EMI_PAY_CORE_Orchestrator_V1.definition.json')" -ForegroundColor Green
Get-Item $OutZip | Select-Object FullName, Length, LastWriteTime
