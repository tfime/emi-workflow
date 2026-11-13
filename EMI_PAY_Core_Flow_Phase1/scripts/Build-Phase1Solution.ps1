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
    $OutZip = Join-Path $repoRoot 'EMI_PAY_CORE_V1_1_0_0_22.zip'
}
$staging = Join-Path $phaseRoot '_staging_solution'
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Join-Path $staging 'Workflows') | Out-Null

$site = 'https://emicomvn.sharepoint.com/sites/cecm'
$guidCommands = 'e16b76dc-7686-43e9-b232-18c80e2b31d2'
$guidRequests = '12b3051d-7642-4f90-a39d-5364df561fbf'
$guidWorkItems = 'e21ef6e7-ee31-466a-be3b-65ae30ca7722'
$guidChecklist = 'd02c6a03-9561-4d90-b5d5-ad30a2fef88b'
$guidChecklistTemplates = '81b94541-2e8e-4457-af28-e47f4d284477'
$guidDocIndex = 'a45c74cd-1f21-454c-9fcc-6812692b801b'
$guidStepRecipients = '7ebac733-193d-4216-bf63-785c6a5f06a2'
$guidWorkflowSteps    = '0135b54a-f4a3-4edc-a738-a64e12feb9ad'
$guidActivityPublic   = '84b57c9e-6b90-4a6b-a200-b3afb4499895'
$guidActivityInternal = 'b8ceb7ed-3925-4292-af35-4027f41c9d6a'
$guidOrgMembers       = '58db4d66-1299-4edb-893e-50c8fe459253'
$sysadmUpn            = 'tinh.pt@emi.com.vn'

# CREATE Master: Title/Explanation/Amount/RoutePlanJson từ payload (Perf Gói 2).
# Title/Explanation: thay " → ' .
# RoutePlanJson: escape \ rồi " (thứ tự bắt buộc) — tránh _biz / dấu \ làm vỡ json().
$createMasterBody = @'
@json(concat('{"Title":"', replace(string(coalesce(variables('Payload')?['title'], variables('RequestKey'))), '"', ''''), '","RequestKey":"', variables('RequestKey'), '","CreatedOUCode":"', coalesce(variables('Payload')?['createdOUCode'],''), '","CreatorUPN":"', coalesce(variables('Payload')?['creatorUPN'],'admin@local'), '","PaymentTypeCode":"', coalesce(variables('Payload')?['paymentTypeCode'],'SPV_PAYMENT'), '","WorkflowCode":"EMI_PAY_SPV","WorkflowVersion":1,"ChecklistVersion":', string(int(coalesce(variables('Payload')?['checklistVersion'], 1))), ',"ReviewRound":1,"CurrentStepKey":"BPCM1_PREPARE","CurrentStepInstanceKey":"', variables('StepInstanceKey'), '","CurrentOUCode":"', coalesce(variables('Payload')?['createdOUCode'],''), '","Status":"Draft","IsLocked":false,"ArchiveStatus":"NotStarted","Explanation":"', replace(string(coalesce(variables('Payload')?['explanation'], '')), '"', ''''), '","Amount":', string(coalesce(variables('Payload')?['amount'], 0)), ',"RoutePlanJson":"', replace(replace(string(coalesce(variables('Payload')?['routePlanJson'], '{}')), '\', '\\'), '"', '\"'), '"}'))
'@.Trim()

function New-SpHttpGet([string]$UriExpr) {
    return [ordered]@{
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
                'parameters/uri'     = $UriExpr
                'parameters/headers' = [ordered]@{ Accept = 'application/json;odata=nometadata' }
            }
            authentication = "@parameters('`$authentication')"
        }
    }
}

function New-SpHttpMerge([string]$UriExpr, [string]$BodyExpr) {
    return [ordered]@{
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
                'parameters/uri'     = $UriExpr
                'parameters/headers' = [ordered]@{
                    Accept          = 'application/json;odata=nometadata'
                    'Content-Type'  = 'application/json;odata=nometadata'
                    'IF-MATCH'      = '*'
                    'X-HTTP-Method' = 'MERGE'
                }
                'parameters/body'    = $BodyExpr
            }
            authentication = "@parameters('`$authentication')"
        }
    }
}

function New-SetVar([string]$Name, [string]$Type, $Value) {
    return [ordered]@{
        type   = 'SetVariable'
        inputs = [ordered]@{
            name  = $Name
            value = $Value
        }
    }
}
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
        # API sync: SPFx POST { commandId } → process Commands → HTTP Response (CORS).
        # Replaces SharePoint GetOnNewItems poll (~1 min latency).
        # Sync HTTP + Response: KHÔNG được bật trigger concurrency.runs
        # (InvalidConcurrencyConfiguration — Response cần operationOptions=Asynchronous).
        # Song song vẫn chạy mặc định; an toàn nhờ Dedupe + Claim/Master ETag.
        TRG_HttpCommand = [ordered]@{
            type   = 'Request'
            kind   = 'Http'
            inputs = [ordered]@{
                method = 'POST'
                schema = [ordered]@{
                    type       = 'object'
                    properties = [ordered]@{
                        commandId = [ordered]@{ type = 'integer' }
                    }
                    required   = @('commandId')
                }
            }
        }
    }
    actions          = [ordered]@{
        INIT_CommandId = [ordered]@{
            type     = 'InitializeVariable'
            inputs   = [ordered]@{
                variables = @(@{
                        name  = 'CommandId'
                        type  = 'integer'
                        value = "@int(coalesce(triggerBody()?['commandId'],0))"
                    })
            }
            runAfter = @{}
        }
        HTTP_LoadCommand = [ordered]@{
            type     = 'OpenApiConnection'
            runAfter = @{ INIT_CommandId = @('Succeeded') }
            inputs   = [ordered]@{
                host           = [ordered]@{
                    connectionName = 'shared_sharepointonline'
                    operationId    = 'HttpRequest'
                    apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                }
                parameters     = [ordered]@{
                    dataset             = $site
                    'parameters/method'  = 'GET'
                    'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(variables('CommandId')), ')?`$select=Id,CommandKey,CommandType,RequestKey,PayloadJson,State,ErrorMessage,StepInstanceKey,DedupeKey,Author/EMail,Author/Email&`$expand=Author')"
                    'parameters/headers' = [ordered]@{
                        Accept = 'application/json;odata=nometadata'
                    }
                }
                authentication = "@parameters('`$authentication')"
            }
        }
        INIT_CommandKey = [ordered]@{
            type     = 'InitializeVariable'
            inputs   = [ordered]@{
                variables = @(@{
                        name  = 'CommandKey'
                        type  = 'string'
                        value = "@coalesce(body('HTTP_LoadCommand')?['CommandKey'],'')"
                    })
            }
            runAfter = @{ HTTP_LoadCommand = @('Succeeded') }
        }
        INIT_CommandType = [ordered]@{
            type     = 'InitializeVariable'
            inputs   = [ordered]@{
                variables = @(@{
                        name  = 'CommandType'
                        type  = 'string'
                        value = "@coalesce(body('HTTP_LoadCommand')?['CommandType'],'')"
                    })
            }
            runAfter = @{ INIT_CommandKey = @('Succeeded') }
        }
        INIT_RequestKey = [ordered]@{
            type     = 'InitializeVariable'
            inputs   = [ordered]@{
                variables = @(@{
                        name  = 'RequestKey'
                        type  = 'string'
                        value = "@coalesce(body('HTTP_LoadCommand')?['RequestKey'],'')"
                    })
            }
            runAfter = @{ INIT_CommandType = @('Succeeded') }
        }
        INIT_Payload = [ordered]@{
            type     = 'InitializeVariable'
            inputs   = [ordered]@{
                variables = @(@{
                        name  = 'Payload'
                        type  = 'object'
                        value = "@json(if(empty(coalesce(body('HTTP_LoadCommand')?['PayloadJson'],'')),'{}',coalesce(body('HTTP_LoadCommand')?['PayloadJson'],'{}')))"
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
                variables = @(@{
                        name  = 'StepInstanceKey'
                        type  = 'string'
                        value = "@coalesce(body('HTTP_LoadCommand')?['StepInstanceKey'],'')"
                    })
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
                variables = @(@{
                        name  = 'ErrorMessage'
                        type  = 'string'
                        value = "@coalesce(body('HTTP_LoadCommand')?['ErrorMessage'],'')"
                    })
            }
            runAfter = @{ INIT_ReviewRound = @('Succeeded') }
        }
        INIT_AuthorEmail = [ordered]@{
            type     = 'InitializeVariable'
            inputs   = [ordered]@{
                variables = @(@{
                        name  = 'AuthorEmail'
                        type  = 'string'
                        value = "@toLower(trim(coalesce(body('HTTP_LoadCommand')?['Author']?['EMail'], body('HTTP_LoadCommand')?['Author']?['Email'], body('HTTP_LoadCommand')?['Author']?['Email'], '')))"
                    })
            }
            runAfter = @{ INIT_Error = @('Succeeded') }
        }
        INIT_EffectiveActor = [ordered]@{
            type     = 'InitializeVariable'
            inputs   = [ordered]@{
                variables = @(@{ name = 'EffectiveActorUPN'; type = 'string'; value = '' })
            }
            runAfter = @{ INIT_AuthorEmail = @('Succeeded') }
        }
        INIT_AuthError = [ordered]@{
            type     = 'InitializeVariable'
            inputs   = [ordered]@{
                variables = @(@{ name = 'AuthError'; type = 'string'; value = '' })
            }
            runAfter = @{ INIT_EffectiveActor = @('Succeeded') }
        }
        INIT_DedupeKey = [ordered]@{
            type     = 'InitializeVariable'
            inputs   = [ordered]@{
                variables = @(@{
                        name  = 'DedupeKey'
                        type  = 'string'
                        value = "@coalesce(body('HTTP_LoadCommand')?['DedupeKey'],'')"
                    })
            }
            runAfter = @{ INIT_AuthError = @('Succeeded') }
        }
        INIT_CommandETag = [ordered]@{
            type     = 'InitializeVariable'
            inputs   = [ordered]@{
                variables = @(@{
                        name  = 'CommandETag'
                        type  = 'string'
                        value = "@coalesce(body('HTTP_LoadCommand')?['@odata.etag'],'*')"
                    })
            }
            runAfter = @{ INIT_DedupeKey = @('Succeeded') }
        }
        INIT_MasterETag = [ordered]@{
            type     = 'InitializeVariable'
            inputs   = [ordered]@{
                variables = @(@{ name = 'MasterETag'; type = 'string'; value = '*' })
            }
            runAfter = @{ INIT_CommandETag = @('Succeeded') }
        }

        # Terminal → Response ngay (không Claim lại). Processing xử lý ở else → IF_AlreadyProcessing.
        IF_AlreadyDone = [ordered]@{
            type       = 'If'
            runAfter   = @{ INIT_MasterETag = @('Succeeded') }
            expression = [ordered]@{
                or = @(
                    [ordered]@{
                        equals = @(
                            "@toLower(trim(string(coalesce(body('HTTP_LoadCommand')?['State'], body('HTTP_LoadCommand')?['State/Value'], ''))))"
                            'succeeded'
                        )
                    }
                    [ordered]@{
                        equals = @(
                            "@toLower(trim(string(coalesce(body('HTTP_LoadCommand')?['State'], body('HTTP_LoadCommand')?['State/Value'], ''))))"
                            'rejected'
                        )
                    }
                    [ordered]@{
                        equals = @(
                            "@toLower(trim(string(coalesce(body('HTTP_LoadCommand')?['State'], body('HTTP_LoadCommand')?['State/Value'], ''))))"
                            'failed'
                        )
                    }
                )
            }
            actions    = [ordered]@{
                RESP_AlreadyTerminal = [ordered]@{
                    type   = 'Response'
                    kind   = 'Http'
                    inputs = [ordered]@{
                        statusCode = 200
                        headers    = [ordered]@{
                            'Access-Control-Allow-Origin'  = '*'
                            'Access-Control-Allow-Methods' = 'POST, OPTIONS'
                            'Access-Control-Allow-Headers' = 'Content-Type'
                            'Content-Type'                 = 'application/json'
                        }
                        body       = [ordered]@{
                            commandId       = "@variables('CommandId')"
                            state           = "@coalesce(body('HTTP_LoadCommand')?['State'], body('HTTP_LoadCommand')?['State/Value'], '')"
                            requestKey      = "@coalesce(body('HTTP_LoadCommand')?['RequestKey'], variables('RequestKey'))"
                            stepInstanceKey = "@coalesce(body('HTTP_LoadCommand')?['StepInstanceKey'], variables('StepInstanceKey'))"
                            errorMessage    = "@coalesce(body('HTTP_LoadCommand')?['ErrorMessage'], '')"
                            commandType     = "@coalesce(body('HTTP_LoadCommand')?['CommandType'], variables('CommandType'))"
                        }
                    }
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
                                'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(variables('CommandId')), ')')"
                                'parameters/headers' = [ordered]@{
                                    Accept          = 'application/json;odata=nometadata'
                                    'Content-Type'  = 'application/json;odata=nometadata'
                                    # Claim dùng * — CommandETag dễ 412 → nhánh fail + RESP_Api (Skipped) = dual Response.
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
                                                'parameters/body'    = $createMasterBody
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
                                                'parameters/body'    = "@json(concat('{""Title"":""', variables('RequestKey'), '-BPCM1_PREPARE"",""RequestKey"":""', variables('RequestKey'), '"",""StepInstanceKey"":""', variables('StepInstanceKey'), '"",""ReviewRound"":1,""StepKey"":""BPCM1_PREPARE"",""StepOrder"":1,""StepKind"":""Department"",""ResponsibleOUCode"":""', coalesce(variables('Payload')?['createdOUCode'],''), '"",""State"":""InReview"",""Decision"":""Pending""}'))"
                                            }
                                            authentication = "@parameters('`$authentication')"
                                        }
                                    }
                                    # Seed checklist từ EMI_PAY_ChecklistTemplates; fallback 2 stub nếu thiếu seed.
                                    HTTP_GetChecklistTemplates_Create = [ordered]@{
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
                                                'parameters/method'  = 'GET'
                                                'parameters/uri'     = "@concat('_api/web/lists(guid''$guidChecklistTemplates'')/items?`$filter=PaymentTypeCode eq ''', replace(string(coalesce(variables('Payload')?['paymentTypeCode'],'SPV_PAYMENT')),'''',''''''), ''' and VersionNo eq ', string(int(coalesce(variables('Payload')?['checklistVersion'], 1))), '&`$select=ItemCode,ItemLabel,IsRequired,MinFileCount,DisplayOrder&`$orderby=DisplayOrder&`$top=50')"
                                                'parameters/headers' = [ordered]@{
                                                    Accept = 'application/json;odata=nometadata'
                                                }
                                            }
                                            authentication = "@parameters('`$authentication')"
                                        }
                                    }
                                    IF_CreateChecklistFromTemplates = [ordered]@{
                                        type       = 'If'
                                        runAfter   = @{ HTTP_GetChecklistTemplates_Create = @('Succeeded') }
                                        expression = [ordered]@{
                                            greater = @(
                                                "@length(body('HTTP_GetChecklistTemplates_Create')?['value'])"
                                                0
                                            )
                                        }
                                        actions    = [ordered]@{
                                            FOREACH_CreateChecklist = [ordered]@{
                                                type                  = 'Foreach'
                                                foreach               = "@body('HTTP_GetChecklistTemplates_Create')?['value']"
                                                runtimeConfiguration  = [ordered]@{
                                                    concurrency = [ordered]@{ repetitions = 4 }
                                                }
                                                actions               = [ordered]@{
                                                    HTTP_CreateChecklistFromTpl = [ordered]@{
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
                                                                'parameters/uri'     = "_api/web/lists(guid'$guidChecklist')/items"
                                                                'parameters/headers' = [ordered]@{
                                                                    Accept         = 'application/json;odata=nometadata'
                                                                    'Content-Type' = 'application/json;odata=nometadata'
                                                                }
                                                                'parameters/body'    = "@json(concat('{""Title"":""', variables('RequestKey'), '-', replace(string(items('FOREACH_CreateChecklist')?['ItemCode']), '""', ''''), '"",""RequestKey"":""', variables('RequestKey'), '"",""ChecklistItemKey"":""', variables('RequestKey'), '|', replace(string(items('FOREACH_CreateChecklist')?['ItemCode']), '""', ''''), '"",""ItemCode"":""', replace(string(items('FOREACH_CreateChecklist')?['ItemCode']), '""', ''''), '"",""ItemLabel"":""', replace(string(coalesce(items('FOREACH_CreateChecklist')?['ItemLabel'], items('FOREACH_CreateChecklist')?['ItemCode'])), '""', ''''), '"",""IsRequired"":', if(equals(items('FOREACH_CreateChecklist')?['IsRequired'], true), 'true', 'false'), ',""MinFileCount"":', string(int(coalesce(items('FOREACH_CreateChecklist')?['MinFileCount'], 0))), ',""UploadedCount"":0,""ItemStatus"":""Missing"",""IsLocked"":false}'))"
                                                            }
                                                            authentication = "@parameters('`$authentication')"
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        else       = [ordered]@{
                                            actions = [ordered]@{
                                                HTTP_CreateChecklist_DOC_REQUEST = [ordered]@{
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
                                            }
                                        }
                                    }
                                    HTTP_MarkSucceeded_Create = [ordered]@{
                                        type     = 'OpenApiConnection'
                                        runAfter = @{ IF_CreateChecklistFromTemplates = @('Succeeded') }
                                        inputs   = [ordered]@{
                                            host           = [ordered]@{
                                                connectionName = 'shared_sharepointonline'
                                                operationId    = 'HttpRequest'
                                                apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                            }
                                            parameters     = [ordered]@{
                                                dataset             = $site
                                                'parameters/method'  = 'POST'
                                                'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(variables('CommandId')), ')')"
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
                                    # Activity: REQUEST_CREATED (idempotent via ActivityKey)
                                    HTTP_WriteActivity_Create = [ordered]@{
                                        type     = 'OpenApiConnection'
                                        runAfter = @{ HTTP_MarkSucceeded_Create = @('Succeeded') }
                                        inputs   = [ordered]@{
                                            host           = [ordered]@{
                                                connectionName = 'shared_sharepointonline'
                                                operationId    = 'HttpRequest'
                                                apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                            }
                                            parameters     = [ordered]@{
                                                dataset             = $site
                                                'parameters/method'  = 'POST'
                                                'parameters/uri'     = "_api/web/lists(guid'$guidActivityPublic')/items"
                                                'parameters/headers' = [ordered]@{
                                                    Accept         = 'application/json;odata=nometadata'
                                                    'Content-Type' = 'application/json;odata=nometadata'
                                                }
                                                'parameters/body'    = "@json(concat('{""Title"":""', variables('CommandKey'), '|REQUEST_CREATED"",""ActivityKey"":""', variables('CommandKey'), '|REQUEST_CREATED"",""RequestKey"":""', variables('RequestKey'), '"",""StepInstanceKey"":""', variables('StepInstanceKey'), '"",""ReviewRound"":1,""EventType"":""REQUEST_CREATED"",""EventTime"":""', utcNow(), '"",""ActorUPN"":""', coalesce(variables('Payload')?['creatorUPN'],''), '"",""ToState"":""Draft"",""Note"":""Ho so duoc tao""}'))"
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
                                                            value = "@concat(variables('RequestKey'),'|BPCM1_PREPARE|MGR|',variables('CommandKey'))"
                                                        }
                                                    }
                                                    SET_NextOU_Submit = [ordered]@{
                                                        type     = 'SetVariable'
                                                        runAfter = @{ SET_NewSIK_Submit = @('Succeeded') }
                                                        inputs   = [ordered]@{
                                                            name  = 'NextOU'
                                                            value = "@coalesce(first(body('HTTP_FindMaster_Submit')?['value'])?['CreatedOUCode'], variables('Payload')?['createdOUCode'], '')"
                                                        }
                                                    }
                                                    HTTP_OpenWI_Submit = [ordered]@{
                                                        type     = 'OpenApiConnection'
                                                        runAfter = @{ SET_NextOU_Submit = @('Succeeded') }
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
                                                                'parameters/body'    = "@json(concat('{""Title"":""', variables('RequestKey'), '-BPCM1-MGR"",""RequestKey"":""', variables('RequestKey'), '"",""StepInstanceKey"":""', variables('StepInstanceKey'), '"",""ReviewRound"":', string(variables('ReviewRound')), ',""StepKey"":""BPCM1_PREPARE"",""StepOrder"":1,""StepKind"":""Department"",""ResponsibleOUCode"":""', variables('NextOU'), '"",""State"":""InReview"",""Decision"":""Pending""}'))"
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
                                                                'parameters/body'    = "@json(concat('{""Status"":""AwaitingManager"",""CurrentStepKey"":""BPCM1_PREPARE"",""CurrentStepInstanceKey"":""', variables('StepInstanceKey'), '"",""CurrentOUCode"":""', variables('NextOU'), '"",""IsLocked"":true,""ReviewRound"":', string(variables('ReviewRound')), '}'))"
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
                                                                'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(variables('CommandId')), ')')"
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
                                                    # Activity: SUBMITTED_TO_MANAGER
                                                    HTTP_WriteActivity_Submit = [ordered]@{
                                                        type     = 'OpenApiConnection'
                                                        runAfter = @{ HTTP_MarkSucceeded_Submit = @('Succeeded') }
                                                        inputs   = [ordered]@{
                                                            host           = [ordered]@{
                                                                connectionName = 'shared_sharepointonline'
                                                                operationId    = 'HttpRequest'
                                                                apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                            }
                                                            parameters     = [ordered]@{
                                                                dataset             = $site
                                                                'parameters/method'  = 'POST'
                                                                'parameters/uri'     = "_api/web/lists(guid'$guidActivityPublic')/items"
                                                                'parameters/headers' = [ordered]@{
                                                                    Accept         = 'application/json;odata=nometadata'
                                                                    'Content-Type' = 'application/json;odata=nometadata'
                                                                }
                                                                'parameters/body'    = "@json(concat('{""Title"":""', variables('CommandKey'), '|SUBMITTED_TO_MANAGER"",""ActivityKey"":""', variables('CommandKey'), '|SUBMITTED_TO_MANAGER"",""RequestKey"":""', variables('RequestKey'), '"",""StepInstanceKey"":""', variables('StepInstanceKey'), '"",""ReviewRound"":', string(variables('ReviewRound')), ',""EventType"":""SUBMITTED_TO_MANAGER"",""EventTime"":""', utcNow(), '"",""ActorUPN"":""', coalesce(variables('Payload')?['actorUPN'],''), '"",""FromState"":""', coalesce(first(body('HTTP_FindMaster_Submit')?['value'])?['Status'],'Draft'), '"",""ToState"":""AwaitingManager"",""Note"":""Trinh truong phong""}'))"
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
                                                                    'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(variables('CommandId')), ')')"
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
                                                            'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(variables('CommandId')), ')')"
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
                                            # RoutePlan trước NextStep — BPCM2/3 vắng key = bỏ qua
                                            COMPOSE_RoutePlan = [ordered]@{
                                                type     = 'Compose'
                                                runAfter = @{ COMPOSE_Next_Decide = @('Succeeded') }
                                                inputs   = "@json(if(empty(coalesce(first(body('HTTP_FindMaster_Decide')?['value'])?['RoutePlanJson'],'')),'{}',coalesce(first(body('HTTP_FindMaster_Decide')?['value'])?['RoutePlanJson'],'{}')))"
                                            }
                                            SET_Next_Decide = [ordered]@{
                                                type     = 'SetVariable'
                                                runAfter = @{ COMPOSE_RoutePlan = @('Succeeded') }
                                                inputs   = [ordered]@{
                                                    name  = 'NextStepKey'
                                                    # Optional BPCM: có key trong RoutePlan mới qua; CHAIR hai bước giữ nguyên
                                                    value = "@if(and(equals(first(body('HTTP_FindMaster_Decide')?['value'])?['Status'],'AwaitingManager'),equals(outputs('COMPOSE_Next_Decide'),'BPCM1_PREPARE')),if(not(empty(coalesce(outputs('COMPOSE_RoutePlan')?['BPCM2_TECH'],''))),'BPCM2_TECH',if(not(empty(coalesce(outputs('COMPOSE_RoutePlan')?['BPCM3_PRICE'],''))),'BPCM3_PRICE','TCKT_CHECK')),if(equals(outputs('COMPOSE_Next_Decide'),'BPCM2_TECH'),if(not(empty(coalesce(outputs('COMPOSE_RoutePlan')?['BPCM3_PRICE'],''))),'BPCM3_PRICE','TCKT_CHECK'),if(equals(outputs('COMPOSE_Next_Decide'),'BPCM3_PRICE'),'TCKT_CHECK',if(equals(outputs('COMPOSE_Next_Decide'),'TCKT_CHECK'),'CHAIR_APPROVE',if(equals(outputs('COMPOSE_Next_Decide'),'CHAIR_APPROVE'),if(empty(coalesce(variables('Payload')?['paymentDueAt'],'')),'CHAIR_APPROVE','TCKT_PAY'),'INVALID')))))"
                                                }
                                            }
                                            HTTP_GetWS_Decide = [ordered]@{
                                                type     = 'OpenApiConnection'
                                                runAfter = @{ SET_Next_Decide = @('Succeeded') }
                                                inputs   = [ordered]@{
                                                    host           = [ordered]@{
                                                        connectionName = 'shared_sharepointonline'
                                                        operationId    = 'HttpRequest'
                                                        apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                    }
                                                    parameters     = [ordered]@{
                                                        dataset             = $site
                                                        'parameters/method'  = 'GET'
                                                        'parameters/uri'     = "@concat('_api/web/lists(guid''$guidWorkflowSteps'')/items?`$filter=StepKey eq ''', replace(variables('NextStepKey'),'''',''''''), ''' and WorkflowCode eq ''EMI_PAY_SPV''&`$select=StepKey,StepOrder,StepKind&`$top=2')"
                                                        'parameters/headers' = [ordered]@{ Accept = 'application/json;odata=nometadata' }
                                                    }
                                                    authentication = "@parameters('`$authentication')"
                                                }
                                            }
                                            SET_Meta_Decide = [ordered]@{
                                                type     = 'Compose'
                                                runAfter = @{ HTTP_GetWS_Decide = @('Succeeded') }
                                                inputs   = [ordered]@{
                                                    order  = "@int(coalesce(first(body('HTTP_GetWS_Decide')?['value'])?['StepOrder'],0))"
                                                    kind   = "@if(equals(coalesce(first(body('HTTP_GetWS_Decide')?['value'])?['StepKind'],'Department'),'Initiator'),'Department',if(equals(coalesce(first(body('HTTP_GetWS_Decide')?['value'])?['StepKind'],''),'System'),'Payment',coalesce(first(body('HTTP_GetWS_Decide')?['value'])?['StepKind'],'Department')))"
                                                    status = "@if(equals(variables('NextStepKey'),'TCKT_PAY'),'PendingPayment',if(equals(coalesce(first(body('HTTP_GetWS_Decide')?['value'])?['StepKind'],''),'Approval'),'AwaitManager','InReview'))"
                                                    wi     = "@if(equals(coalesce(first(body('HTTP_GetWS_Decide')?['value'])?['StepKind'],''),'Approval'),'AwaitManager','InReview')"
                                                    ou     = "@coalesce(variables('Payload')?['targetOUCode'], if(equals(variables('NextStepKey'),'BPCM2_TECH'),outputs('COMPOSE_RoutePlan')?['BPCM2_TECH'],if(equals(variables('NextStepKey'),'BPCM3_PRICE'),outputs('COMPOSE_RoutePlan')?['BPCM3_PRICE'],if(equals(variables('NextStepKey'),'TCKT_CHECK'),outputs('COMPOSE_RoutePlan')?['TCKT_CHECK'],if(equals(variables('NextStepKey'),'CHAIR_APPROVE'),outputs('COMPOSE_RoutePlan')?['CHAIR_APPROVE'],if(equals(variables('NextStepKey'),'TCKT_PAY'),outputs('COMPOSE_RoutePlan')?['TCKT_PAY'],outputs('COMPOSE_RoutePlan')?['SYSTEM_ARCHIVE']))))), '')"
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
                                                                [ordered]@{
                                                                    and = @(
                                                                        [ordered]@{ equals = @("@first(body('HTTP_FindMaster_Decide')?['value'])?['Status']", 'AwaitingManager') }
                                                                        [ordered]@{ equals = @("@outputs('COMPOSE_Next_Decide')", 'BPCM1_PREPARE') }
                                                                    )
                                                                }
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
                                                    # ACCEPT gate: lấy WI hiện tại để kiểm tra AcceptedAt
                                                    HTTP_GetWI_AcceptCheck = [ordered]@{
                                                        type     = 'OpenApiConnection'
                                                        runAfter = @{ SET_OldSIK_Decide = @('Succeeded') }
                                                        inputs   = [ordered]@{
                                                            host           = [ordered]@{
                                                                connectionName = 'shared_sharepointonline'
                                                                operationId    = 'HttpRequest'
                                                                apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                            }
                                                            parameters     = [ordered]@{
                                                                dataset             = $site
                                                                'parameters/method'  = 'GET'
                                                                'parameters/uri'     = "@concat('_api/web/lists(guid''$guidWorkItems'')/items?`$filter=StepInstanceKey eq ''', replace(variables('StepInstanceKey'),'''',''''''), '''&`$select=Id,AcceptedAt,State&`$top=2')"
                                                                'parameters/headers' = [ordered]@{ Accept = 'application/json;odata=nometadata' }
                                                            }
                                                            authentication = "@parameters('`$authentication')"
                                                        }
                                                    }
                                                    # WI CHAIR đã Approved (lần 1 duyệt hồ sơ) — bắt buộc trước khi PASS + paymentDueAt
                                                    HTTP_GetChairDossierApproved = [ordered]@{
                                                        type     = 'OpenApiConnection'
                                                        runAfter = @{ HTTP_GetWI_AcceptCheck = @('Succeeded') }
                                                        inputs   = [ordered]@{
                                                            host           = [ordered]@{
                                                                connectionName = 'shared_sharepointonline'
                                                                operationId    = 'HttpRequest'
                                                                apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                            }
                                                            parameters     = [ordered]@{
                                                                dataset             = $site
                                                                'parameters/method'  = 'GET'
                                                                'parameters/uri'     = "@concat('_api/web/lists(guid''$guidWorkItems'')/items?`$filter=RequestKey eq ''', replace(variables('RequestKey'),'''',''''''), ''' and StepKey eq ''CHAIR_APPROVE'' and Decision eq ''Approved''&`$select=Id,Decision,State&`$top=5')"
                                                                'parameters/headers' = [ordered]@{ Accept = 'application/json;odata=nometadata' }
                                                            }
                                                            authentication = "@parameters('`$authentication')"
                                                        }
                                                    }
                                                    # IF_ChairDueReady: ACCEPT gate + CHAIR hai bước (hồ sơ / thanh toán)
                                                    IF_ChairDueReady = [ordered]@{
                                                        type       = 'If'
                                                        runAfter   = @{ HTTP_GetChairDossierApproved = @('Succeeded') }
                                                        expression = [ordered]@{
                                                            and = @(
                                                                # Gate 1: ACCEPT — bỏ qua nếu TP duyệt gửi (AwaitingManager) hoặc bước CHAIR
                                                                [ordered]@{
                                                                    or = @(
                                                                        [ordered]@{ and = @([ordered]@{ equals = @("@first(body('HTTP_FindMaster_Decide')?['value'])?['Status']", 'AwaitingManager') }, [ordered]@{ equals = @("@outputs('COMPOSE_Next_Decide')", 'BPCM1_PREPARE') }) }
                                                                        [ordered]@{ equals = @("@outputs('COMPOSE_Next_Decide')", 'CHAIR_APPROVE') }
                                                                        [ordered]@{ not = [ordered]@{ empty = @("@coalesce(first(body('HTTP_GetWI_AcceptCheck')?['value'])?['AcceptedAt'],'')") } }
                                                                    )
                                                                }
                                                                # Gate 2: CHAIR + paymentDueAt chỉ khi đã duyệt hồ sơ (WI Approved); không due = duyệt hồ sơ OK
                                                                [ordered]@{
                                                                    or = @(
                                                                        [ordered]@{ not = [ordered]@{ equals = @("@outputs('COMPOSE_Next_Decide')", 'CHAIR_APPROVE') } }
                                                                        [ordered]@{ empty = @("@coalesce(variables('Payload')?['paymentDueAt'],'')") }
                                                                        [ordered]@{ equals = @("@variables('Payload')?['skipPaymentDueAtForPilot']", $true) }
                                                                        [ordered]@{ greater = @("@length(body('HTTP_GetChairDossierApproved')?['value'])", 0) }
                                                                    )
                                                                }
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
                                                                        'parameters/body'    = "@json(concat('{""Status"":""', outputs('SET_Meta_Decide')?['status'], '"",""CurrentStepKey"":""', variables('NextStepKey'), '"",""CurrentStepInstanceKey"":""', variables('StepInstanceKey'), '"",""CurrentOUCode"":""', outputs('SET_Meta_Decide')?['ou'], '""', if(equals(variables('NextStepKey'),'TCKT_PAY'), concat(',""PaymentDueAt"":""', string(variables('Payload')?['paymentDueAt']), '""'), ''), '}'))"
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
                                                                        'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(variables('CommandId')), ')')"
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
                                                            # Activity: DECIDE PASS (EventType động theo FromState)
                                                            HTTP_WriteActivity_DecidePass = [ordered]@{
                                                                type     = 'OpenApiConnection'
                                                                runAfter = @{ HTTP_MarkSucceeded_Decide = @('Succeeded') }
                                                                inputs   = [ordered]@{
                                                                    host           = [ordered]@{
                                                                        connectionName = 'shared_sharepointonline'
                                                                        operationId    = 'HttpRequest'
                                                                        apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                                    }
                                                                    parameters     = [ordered]@{
                                                                        dataset             = $site
                                                                        'parameters/method'  = 'POST'
                                                                        'parameters/uri'     = "_api/web/lists(guid'$guidActivityPublic')/items"
                                                                        'parameters/headers' = [ordered]@{
                                                                            Accept         = 'application/json;odata=nometadata'
                                                                            'Content-Type' = 'application/json;odata=nometadata'
                                                                        }
                                                                        'parameters/body'    = "@json(concat('{""Title"":""', variables('CommandKey'), '|', if(and(equals(first(body('HTTP_FindMaster_Decide')?['value'])?['Status'],'AwaitingManager'),equals(outputs('COMPOSE_Next_Decide'),'BPCM1_PREPARE')),'MANAGER_APPROVED',if(and(equals(outputs('COMPOSE_Next_Decide'),'CHAIR_APPROVE'),equals(variables('NextStepKey'),'CHAIR_APPROVE')),'CHAIR_APPROVED',if(and(equals(outputs('COMPOSE_Next_Decide'),'CHAIR_APPROVE'),equals(variables('NextStepKey'),'TCKT_PAY')),'STEP_PASSED','STEP_PASSED'))), '"",""ActivityKey"":""', variables('CommandKey'), '|', if(and(equals(first(body('HTTP_FindMaster_Decide')?['value'])?['Status'],'AwaitingManager'),equals(outputs('COMPOSE_Next_Decide'),'BPCM1_PREPARE')),'MANAGER_APPROVED',if(and(equals(outputs('COMPOSE_Next_Decide'),'CHAIR_APPROVE'),equals(variables('NextStepKey'),'CHAIR_APPROVE')),'CHAIR_APPROVED','STEP_PASSED')), '"",""RequestKey"":""', variables('RequestKey'), '"",""StepInstanceKey"":""', variables('StepInstanceKey'), '"",""ReviewRound"":', string(variables('ReviewRound')), ',""EventType"":""', if(and(equals(first(body('HTTP_FindMaster_Decide')?['value'])?['Status'],'AwaitingManager'),equals(outputs('COMPOSE_Next_Decide'),'BPCM1_PREPARE')),'MANAGER_APPROVED',if(and(equals(outputs('COMPOSE_Next_Decide'),'CHAIR_APPROVE'),equals(variables('NextStepKey'),'CHAIR_APPROVE')),'CHAIR_APPROVED','STEP_PASSED')), '"",""EventTime"":""', utcNow(), '"",""ActorUPN"":""', coalesce(variables('Payload')?['actorUPN'],''), '"",""FromState"":""', outputs('COMPOSE_Next_Decide'), '"",""ToState"":""', variables('NextStepKey'), '"",""Note"":""', if(and(equals(outputs('COMPOSE_Next_Decide'),'CHAIR_APPROVE'),equals(variables('NextStepKey'),'CHAIR_APPROVE')),'CHAIR dossier approved',if(and(equals(outputs('COMPOSE_Next_Decide'),'CHAIR_APPROVE'),equals(variables('NextStepKey'),'TCKT_PAY')),'CHAIR payment approved','DECIDE PASS')), '""}'))"
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
                                                                            'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(variables('CommandId')), ')')"
                                                                            'parameters/headers' = [ordered]@{
                                                                                Accept          = 'application/json;odata=nometadata'
                                                                                'Content-Type'  = 'application/json;odata=nometadata'
                                                                                'IF-MATCH'      = '*'
                                                                                'X-HTTP-Method' = 'MERGE'
                                                                            }
                                                                            # Phân biệt lỗi: thiếu ACCEPT hoặc CHAIR chưa duyệt hồ sơ mà đã gửi paymentDueAt
                                                                            'parameters/body'    = "@json(concat('{""State"":""Rejected"",""ErrorMessage"":""', if(and(equals(outputs('COMPOSE_Next_Decide'),'CHAIR_APPROVE'),not(empty(coalesce(variables('Payload')?['paymentDueAt'],''))),equals(length(body('HTTP_GetChairDossierApproved')?['value']),0)),'CHAIR dossier approve required before paymentDueAt',if(or(and(equals(first(body('HTTP_FindMaster_Decide')?['value'])?['Status'],'AwaitingManager'),equals(outputs('COMPOSE_Next_Decide'),'BPCM1_PREPARE')),equals(outputs('COMPOSE_Next_Decide'),'CHAIR_APPROVE'),not(empty(coalesce(first(body('HTTP_GetWI_AcceptCheck')?['value'])?['AcceptedAt'],'')))),'DECIDE gate failed','ACCEPT required before DECIDE')), '"",""ProcessedAt"":""', utcNow(), '""}'))"
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
                                                                    'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(variables('CommandId')), ')')"
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
                                                                    [ordered]@{
                                                                        and = @(
                                                                            [ordered]@{ equals = @("@first(body('HTTP_FindMaster_Reject')?['value'])?['Status']", 'AwaitingManager') }
                                                                            [ordered]@{ equals = @("@outputs('COMPOSE_RejectStep')", 'BPCM1_PREPARE') }
                                                                        )
                                                                    }
                                                                    [ordered]@{ equals = @("@outputs('COMPOSE_RejectStep')", 'BPCM2_TECH') }
                                                                    [ordered]@{ equals = @("@outputs('COMPOSE_RejectStep')", 'BPCM3_PRICE') }
                                                                    [ordered]@{ equals = @("@outputs('COMPOSE_RejectStep')", 'TCKT_CHECK') }
                                                                    [ordered]@{ equals = @("@outputs('COMPOSE_RejectStep')", 'CHAIR_APPROVE') }
                                                                )
                                                            }
                                                            [ordered]@{
                                                                or = @(
                                                                    [ordered]@{ equals = @("@first(body('HTTP_FindMaster_Reject')?['value'])?['Status']", 'AwaitingManager') }
                                                                    [ordered]@{ not = [ordered]@{ equals = @("@outputs('COMPOSE_RejectReason')", '') } }
                                                                )
                                                            }
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
                                                                    'parameters/body'    = "@json(concat('{""Title"":""', variables('RequestKey'), '-BPCM1_PREPARE"",""RequestKey"":""', variables('RequestKey'), '"",""StepInstanceKey"":""', variables('StepInstanceKey'), '"",""ReviewRound"":', string(variables('ReviewRound')), ',""StepKey"":""BPCM1_PREPARE"",""StepOrder"":1,""StepKind"":""Department"",""ResponsibleOUCode"":""', coalesce(first(body('HTTP_FindMaster_Reject')?['value'])?['CreatedOUCode'],''), '"",""State"":""InReview"",""Decision"":""Pending""}'))"
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
                                                                    'parameters/body'    = "@json(concat('{""Status"":""', if(equals(first(body('HTTP_FindMaster_Reject')?['value'])?['Status'],'AwaitingManager'),'Draft','Returned'), '"",""CurrentStepKey"":""BPCM1_PREPARE"",""CurrentStepInstanceKey"":""', variables('StepInstanceKey'), '"",""CurrentOUCode"":""', coalesce(first(body('HTTP_FindMaster_Reject')?['value'])?['CreatedOUCode'],''), '"",""IsLocked"":false}'))"
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
                                                                    'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(variables('CommandId')), ')')"
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
                                                        # Activity: DECIDE REJECT (ghi ActivityPublic vì là hành động chủ ý)
                                                        HTTP_WriteActivity_Reject = [ordered]@{
                                                            type     = 'OpenApiConnection'
                                                            runAfter = @{ HTTP_MarkSucceeded_Reject = @('Succeeded') }
                                                            inputs   = [ordered]@{
                                                                host           = [ordered]@{
                                                                    connectionName = 'shared_sharepointonline'
                                                                    operationId    = 'HttpRequest'
                                                                    apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                                }
                                                                parameters     = [ordered]@{
                                                                    dataset             = $site
                                                                    'parameters/method'  = 'POST'
                                                                    'parameters/uri'     = "_api/web/lists(guid'$guidActivityPublic')/items"
                                                                    'parameters/headers' = [ordered]@{
                                                                        Accept         = 'application/json;odata=nometadata'
                                                                        'Content-Type' = 'application/json;odata=nometadata'
                                                                    }
                                                                    # EventType: MANAGER_REJECTED nếu đang ở AwaitingManager, STEP_REJECTED nếu bước KT
                                                                    # Phải dùng HTTP_FindMaster_Reject (cùng nhánh) — không tham chiếu HTTP_FindMaster_Decide (nhánh PASS).
                                                                    'parameters/body'    = "@json(concat('{""Title"":""', variables('CommandKey'), '|', if(equals(first(body('HTTP_FindMaster_Reject')?['value'])?['Status'],'AwaitingManager'),'MANAGER_REJECTED','STEP_REJECTED'), '"",""ActivityKey"":""', variables('CommandKey'), '|', if(equals(first(body('HTTP_FindMaster_Reject')?['value'])?['Status'],'AwaitingManager'),'MANAGER_REJECTED','STEP_REJECTED'), '"",""RequestKey"":""', variables('RequestKey'), '"",""StepInstanceKey"":""', variables('StepInstanceKey'), '"",""ReviewRound"":', string(variables('ReviewRound')), ',""EventType"":""', if(equals(first(body('HTTP_FindMaster_Reject')?['value'])?['Status'],'AwaitingManager'),'MANAGER_REJECTED','STEP_REJECTED'), '"",""EventTime"":""', utcNow(), '"",""ActorUPN"":""', coalesce(variables('Payload')?['actorUPN'],''), '"",""FromState"":""', coalesce(first(body('HTTP_FindMaster_Reject')?['value'])?['Status'], outputs('COMPOSE_RejectStep'),''), '"",""ToState"":""', if(equals(first(body('HTTP_FindMaster_Reject')?['value'])?['Status'],'AwaitingManager'),'Draft','Returned'), '"",""Note"":""', replace(coalesce(outputs('COMPOSE_RejectReason'), variables('Payload')?['note'],''), '""', ''), '""}'))"
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
                                                                        'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(variables('CommandId')), ')')"
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
                            Case_ACCEPT = [ordered]@{
                                case    = 'ACCEPT'
                                actions = [ordered]@{
                                    HTTP_FindMaster_Accept = [ordered]@{
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
                                    IF_AcceptValid = [ordered]@{
                                        type       = 'If'
                                        runAfter   = @{ HTTP_FindMaster_Accept = @('Succeeded') }
                                        expression = [ordered]@{
                                            and = @(
                                                [ordered]@{ equals = @("@length(body('HTTP_FindMaster_Accept')?['value'])", 1) }
                                                [ordered]@{
                                                    or = @(
                                                        [ordered]@{ equals = @("@first(body('HTTP_FindMaster_Accept')?['value'])?['CurrentStepKey']", 'BPCM2_TECH') }
                                                        [ordered]@{ equals = @("@first(body('HTTP_FindMaster_Accept')?['value'])?['CurrentStepKey']", 'BPCM3_PRICE') }
                                                        [ordered]@{ equals = @("@first(body('HTTP_FindMaster_Accept')?['value'])?['CurrentStepKey']", 'TCKT_CHECK') }
                                                        [ordered]@{ equals = @("@first(body('HTTP_FindMaster_Accept')?['value'])?['CurrentStepKey']", 'TCKT_PAY') }
                                                    )
                                                }
                                                [ordered]@{ not = [ordered]@{ empty = @("@coalesce(variables('Payload')?['dueAt'],'')") } }
                                            )
                                        }
                                        actions    = [ordered]@{
                                            SET_OldSIK_Accept = [ordered]@{
                                                type   = 'SetVariable'
                                                inputs = [ordered]@{
                                                    name  = 'StepInstanceKey'
                                                    value = "@coalesce(first(body('HTTP_FindMaster_Accept')?['value'])?['CurrentStepInstanceKey'],'')"
                                                }
                                            }
                                            SET_Round_Accept = [ordered]@{
                                                type     = 'SetVariable'
                                                runAfter = @{ SET_OldSIK_Accept = @('Succeeded') }
                                                inputs   = [ordered]@{
                                                    name  = 'ReviewRound'
                                                    value = "@int(coalesce(first(body('HTTP_FindMaster_Accept')?['value'])?['ReviewRound'],1))"
                                                }
                                            }
                                            HTTP_FindWI_Accept = [ordered]@{
                                                type     = 'OpenApiConnection'
                                                runAfter = @{ SET_Round_Accept = @('Succeeded') }
                                                inputs   = [ordered]@{
                                                    host           = [ordered]@{
                                                        connectionName = 'shared_sharepointonline'
                                                        operationId    = 'HttpRequest'
                                                        apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                    }
                                                    parameters     = [ordered]@{
                                                        dataset             = $site
                                                        'parameters/method'  = 'GET'
                                                        'parameters/uri'     = "@concat('_api/web/lists(guid''$guidWorkItems'')/items?`$filter=StepInstanceKey eq ''', replace(variables('StepInstanceKey'),'''',''''''), '''&`$select=Id,AcceptedAt,State&`$top=2')"
                                                        'parameters/headers' = [ordered]@{ Accept = 'application/json;odata=nometadata' }
                                                    }
                                                    authentication = "@parameters('`$authentication')"
                                                }
                                            }
                                            IF_AcceptWiReady = [ordered]@{
                                                type       = 'If'
                                                runAfter   = @{ HTTP_FindWI_Accept = @('Succeeded') }
                                                expression = [ordered]@{
                                                    and = @(
                                                        [ordered]@{ equals = @("@length(body('HTTP_FindWI_Accept')?['value'])", 1) }
                                                        [ordered]@{ empty = @("@coalesce(first(body('HTTP_FindWI_Accept')?['value'])?['AcceptedAt'],'')") }
                                                    )
                                                }
                                                actions    = [ordered]@{
                                                    HTTP_MergeWI_Accept = [ordered]@{
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
                                                                'parameters/uri'     = "@concat('_api/web/lists(guid''$guidWorkItems'')/items(', string(first(body('HTTP_FindWI_Accept')?['value'])?['Id']), ')')"
                                                                'parameters/headers' = [ordered]@{
                                                                    Accept          = 'application/json;odata=nometadata'
                                                                    'Content-Type'  = 'application/json;odata=nometadata'
                                                                    'IF-MATCH'      = '*'
                                                                    'X-HTTP-Method' = 'MERGE'
                                                                }
                                                                'parameters/body'    = "@json(concat('{""AcceptedByUPN"":""', coalesce(variables('Payload')?['actorUPN'],''), '"",""AcceptedAt"":""', utcNow(), '"",""DueAt"":""', string(variables('Payload')?['dueAt']), '""}'))"
                                                            }
                                                            authentication = "@parameters('`$authentication')"
                                                        }
                                                    }
                                                    HTTP_MarkSucceeded_Accept = [ordered]@{
                                                        type     = 'OpenApiConnection'
                                                        runAfter = @{ HTTP_MergeWI_Accept = @('Succeeded') }
                                                        inputs   = [ordered]@{
                                                            host           = [ordered]@{
                                                                connectionName = 'shared_sharepointonline'
                                                                operationId    = 'HttpRequest'
                                                                apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                            }
                                                            parameters     = [ordered]@{
                                                                dataset             = $site
                                                                'parameters/method'  = 'POST'
                                                                'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(variables('CommandId')), ')')"
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
                                                    HTTP_WriteActivity_Accept = [ordered]@{
                                                        type     = 'OpenApiConnection'
                                                        runAfter = @{ HTTP_MarkSucceeded_Accept = @('Succeeded') }
                                                        inputs   = [ordered]@{
                                                            host           = [ordered]@{
                                                                connectionName = 'shared_sharepointonline'
                                                                operationId    = 'HttpRequest'
                                                                apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                            }
                                                            parameters     = [ordered]@{
                                                                dataset             = $site
                                                                'parameters/method'  = 'POST'
                                                                'parameters/uri'     = "_api/web/lists(guid'$guidActivityPublic')/items"
                                                                'parameters/headers' = [ordered]@{
                                                                    Accept         = 'application/json;odata=nometadata'
                                                                    'Content-Type' = 'application/json;odata=nometadata'
                                                                }
                                                                'parameters/body'    = "@json(concat('{""Title"":""', variables('CommandKey'), '|STEP_ACCEPTED"",""ActivityKey"":""', variables('CommandKey'), '|STEP_ACCEPTED"",""RequestKey"":""', variables('RequestKey'), '"",""StepInstanceKey"":""', variables('StepInstanceKey'), '"",""ReviewRound"":', string(variables('ReviewRound')), ',""EventType"":""STEP_ACCEPTED"",""EventTime"":""', utcNow(), '"",""ActorUPN"":""', coalesce(variables('Payload')?['actorUPN'],''), '"",""FromState"":""', coalesce(first(body('HTTP_FindMaster_Accept')?['value'])?['CurrentStepKey'],''), '"",""ToState"":""', coalesce(first(body('HTTP_FindMaster_Accept')?['value'])?['CurrentStepKey'],''), '"",""Note"":""Tiep nhan DueAt=', string(variables('Payload')?['dueAt']), '""}'))"
                                                            }
                                                            authentication = "@parameters('`$authentication')"
                                                        }
                                                    }
                                                }
                                                else       = [ordered]@{
                                                    actions = [ordered]@{
                                                        HTTP_Reject_AcceptWi = [ordered]@{
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
                                                                    'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(variables('CommandId')), ')')"
                                                                    'parameters/headers' = [ordered]@{
                                                                        Accept          = 'application/json;odata=nometadata'
                                                                        'Content-Type'  = 'application/json;odata=nometadata'
                                                                        'IF-MATCH'      = '*'
                                                                        'X-HTTP-Method' = 'MERGE'
                                                                    }
                                                                    'parameters/body'    = "@json(concat('{""State"":""Rejected"",""ErrorMessage"":""ACCEPT requires open WorkItem without AcceptedAt"",""ProcessedAt"":""', utcNow(), '""}'))"
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
                                                HTTP_Reject_Accept = [ordered]@{
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
                                                            'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(variables('CommandId')), ')')"
                                                            'parameters/headers' = [ordered]@{
                                                                Accept          = 'application/json;odata=nometadata'
                                                                'Content-Type'  = 'application/json;odata=nometadata'
                                                                'IF-MATCH'      = '*'
                                                                'X-HTTP-Method' = 'MERGE'
                                                            }
                                                            'parameters/body'    = "@json(concat('{""State"":""Rejected"",""ErrorMessage"":""ACCEPT requires dueAt and step BPCM2|BPCM3|TCKT_CHECK|TCKT_PAY"",""ProcessedAt"":""', utcNow(), '""}'))"
                                                        }
                                                        authentication = "@parameters('`$authentication')"
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
                                            HTTP_GetWI_ConfirmAccept = [ordered]@{
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
                                                        'parameters/uri'     = "@concat('_api/web/lists(guid''$guidWorkItems'')/items?`$filter=StepInstanceKey eq ''', replace(variables('StepInstanceKey'),'''',''''''), '''&`$select=Id,AcceptedAt&`$top=2')"
                                                        'parameters/headers' = [ordered]@{ Accept = 'application/json;odata=nometadata' }
                                                    }
                                                    authentication = "@parameters('`$authentication')"
                                                }
                                            }
                                            IF_ConfirmAccepted = [ordered]@{
                                                type       = 'If'
                                                runAfter   = @{ HTTP_GetWI_ConfirmAccept = @('Succeeded') }
                                                expression = [ordered]@{
                                                    not = [ordered]@{ empty = @("@coalesce(first(body('HTTP_GetWI_ConfirmAccept')?['value'])?['AcceptedAt'],'')") }
                                                }
                                                actions    = [ordered]@{
                                            HTTP_GetUnc_Confirm = [ordered]@{
                                                type     = 'OpenApiConnection'
                                                runAfter = @{}
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
                                                                'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(variables('CommandId')), ')')"
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
                                                    HTTP_WriteActivity_Confirm = [ordered]@{
                                                        type     = 'OpenApiConnection'
                                                        runAfter = @{ HTTP_MarkSucceeded_Confirm = @('Succeeded') }
                                                        inputs   = [ordered]@{
                                                            host           = [ordered]@{
                                                                connectionName = 'shared_sharepointonline'
                                                                operationId    = 'HttpRequest'
                                                                apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                                                            }
                                                            parameters     = [ordered]@{
                                                                dataset             = $site
                                                                'parameters/method'  = 'POST'
                                                                'parameters/uri'     = "_api/web/lists(guid'$guidActivityPublic')/items"
                                                                'parameters/headers' = [ordered]@{
                                                                    Accept         = 'application/json;odata=nometadata'
                                                                    'Content-Type' = 'application/json;odata=nometadata'
                                                                }
                                                                'parameters/body'    = "@json(concat('{""Title"":""', variables('CommandKey'), '|PAYMENT_CONFIRMED"",""ActivityKey"":""', variables('CommandKey'), '|PAYMENT_CONFIRMED"",""RequestKey"":""', variables('RequestKey'), '"",""StepInstanceKey"":""', variables('StepInstanceKey'), '"",""ReviewRound"":', string(int(coalesce(first(body('HTTP_FindMaster_Confirm')?['value'])?['ReviewRound'],1))), ',""EventType"":""PAYMENT_CONFIRMED"",""EventTime"":""', utcNow(), '"",""ActorUPN"":""', coalesce(variables('Payload')?['actorUPN'],''), '"",""FromState"":""TCKT_PAY"",""ToState"":""SYSTEM_ARCHIVE"",""Note"":""Xac nhan thanh toan""}'))"
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
                                                                    'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(variables('CommandId')), ')')"
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
                                                        HTTP_Reject_ConfirmAccept = [ordered]@{
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
                                                                    'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(variables('CommandId')), ')')"
                                                                    'parameters/headers' = [ordered]@{
                                                                        Accept          = 'application/json;odata=nometadata'
                                                                        'Content-Type'  = 'application/json;odata=nometadata'
                                                                        'IF-MATCH'      = '*'
                                                                        'X-HTTP-Method' = 'MERGE'
                                                                    }
                                                                    'parameters/body'    = "@json(concat('{""State"":""Rejected"",""ErrorMessage"":""ACCEPT required before CONFIRM_PAYMENT"",""ProcessedAt"":""', utcNow(), '""}'))"
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
                                                            'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(variables('CommandId')), ')')"
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
                                            'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(variables('CommandId')), ')')"
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
                    HTTP_GetFinal = [ordered]@{
                        type     = 'OpenApiConnection'
                        runAfter = @{ SW_CommandType = @('Succeeded') }
                        inputs   = [ordered]@{
                            host           = [ordered]@{
                                connectionName = 'shared_sharepointonline'
                                operationId    = 'HttpRequest'
                                apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                            }
                            parameters     = [ordered]@{
                                dataset             = $site
                                'parameters/method'  = 'GET'
                                'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(variables('CommandId')), ')?`$select=Id,State,RequestKey,StepInstanceKey,ErrorMessage,CommandType,CommandKey')"
                                'parameters/headers' = [ordered]@{
                                    Accept = 'application/json;odata=nometadata'
                                }
                            }
                            authentication = "@parameters('`$authentication')"
                        }
                    }
                    IF_WriteActivityInternal = [ordered]@{
                        type       = 'If'
                        runAfter   = @{ HTTP_GetFinal = @('Succeeded') }
                        expression = [ordered]@{
                            or = @(
                                [ordered]@{ equals = @("@coalesce(body('HTTP_GetFinal')?['State'], body('HTTP_GetFinal')?['State/Value'], '')", 'Rejected') }
                                [ordered]@{ equals = @("@coalesce(body('HTTP_GetFinal')?['State'], body('HTTP_GetFinal')?['State/Value'], '')", 'Failed') }
                            )
                        }
                        actions    = [ordered]@{
                            HTTP_WriteActivityInternal = [ordered]@{
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
                                        'parameters/uri'     = "_api/web/lists(guid'$guidActivityInternal')/items"
                                        'parameters/headers' = [ordered]@{
                                            Accept         = 'application/json;odata=nometadata'
                                            'Content-Type' = 'application/json;odata=nometadata'
                                        }
                                        'parameters/body'    = "@json(concat('{""Title"":""', coalesce(body('HTTP_GetFinal')?['CommandKey'], variables('CommandKey')), '|', if(equals(coalesce(body('HTTP_GetFinal')?['State'], body('HTTP_GetFinal')?['State/Value'], ''),'Failed'),'COMMAND_FAILED','COMMAND_REJECTED'), '"",""ActivityKey"":""', coalesce(body('HTTP_GetFinal')?['CommandKey'], variables('CommandKey')), '|', if(equals(coalesce(body('HTTP_GetFinal')?['State'], body('HTTP_GetFinal')?['State/Value'], ''),'Failed'),'COMMAND_FAILED','COMMAND_REJECTED'), '"",""RequestKey"":""', coalesce(body('HTTP_GetFinal')?['RequestKey'], variables('RequestKey')), '"",""StepInstanceKey"":""', coalesce(body('HTTP_GetFinal')?['StepInstanceKey'], variables('StepInstanceKey')), '"",""EventType"":""', if(equals(coalesce(body('HTTP_GetFinal')?['State'], body('HTTP_GetFinal')?['State/Value'], ''),'Failed'),'COMMAND_FAILED','COMMAND_REJECTED'), '"",""EventTime"":""', utcNow(), '"",""ActorUPN"":""', coalesce(variables('Payload')?['actorUPN'], variables('Payload')?['creatorUPN'],''), '"",""Reason"":""', replace(coalesce(body('HTTP_GetFinal')?['ErrorMessage'],''), '""', ''''), '"",""NewValue"":""', coalesce(body('HTTP_GetFinal')?['State'], body('HTTP_GetFinal')?['State/Value'], ''), '""}'))"
                                    }
                                    authentication = "@parameters('`$authentication')"
                                }
                            }
                        }
                        else       = [ordered]@{ actions = [ordered]@{} }
                    }
                    RESP_Api = [ordered]@{
                        type     = 'Response'
                        kind     = 'Http'
                        runAfter = @{ IF_WriteActivityInternal = @('Succeeded', 'Failed', 'TimedOut', 'Skipped') }
                        inputs   = [ordered]@{
                            statusCode = 200
                            headers    = [ordered]@{
                                'Access-Control-Allow-Origin'  = '*'
                                'Access-Control-Allow-Methods' = 'POST, OPTIONS'
                                'Access-Control-Allow-Headers' = 'Content-Type'
                                'Content-Type'                 = 'application/json'
                            }
                            body       = [ordered]@{
                                commandId       = "@variables('CommandId')"
                                state           = "@coalesce(body('HTTP_GetFinal')?['State'], body('HTTP_GetFinal')?['State/Value'], '')"
                                requestKey      = "@coalesce(body('HTTP_GetFinal')?['RequestKey'], variables('RequestKey'))"
                                stepInstanceKey = "@coalesce(body('HTTP_GetFinal')?['StepInstanceKey'], variables('StepInstanceKey'))"
                                errorMessage    = "@coalesce(body('HTTP_GetFinal')?['ErrorMessage'],'')"
                                commandType     = "@coalesce(body('HTTP_GetFinal')?['CommandType'], variables('CommandType'))"
                            }
                        }
                    }
                }
            }
        }
    }
}

# --- Wire OrgMembers AUTH gate (1.0.0.13): Claim → Auth → IF_AuthOk → SW_CommandType → GetFinal ---
# --- Perf Gói 3 (1.0.0.16): Processing-wait + Dedupe + Claim etag ---
$elseActions = $definition.actions.IF_AlreadyDone.else.actions
$swCommand = $elseActions['SW_CommandType']
$httpGetFinal = $elseActions['HTTP_GetFinal']
$ifWriteInternal = $elseActions['IF_WriteActivityInternal']
$respApi = $elseActions['RESP_Api']
$claim = $elseActions['HTTP_ClaimProcessing']

function New-RespBody([string]$StateExpr, [string]$ErrExpr = "''") {
    return [ordered]@{
        commandId       = "@variables('CommandId')"
        state           = $StateExpr
        requestKey      = "@coalesce(variables('RequestKey'),'')"
        stepInstanceKey = "@coalesce(variables('StepInstanceKey'),'')"
        errorMessage    = $ErrExpr
        commandType     = "@variables('CommandType')"
    }
}

$respHeaders = [ordered]@{
    'Access-Control-Allow-Origin'  = '*'
    'Access-Control-Allow-Methods' = 'POST, OPTIONS'
    'Access-Control-Allow-Headers' = 'Content-Type'
    'Content-Type'                 = 'application/json'
}

# Until bắt buộc expression CHUỖI (@or(...)) — không dùng object như If (PropertyNotAllowed).
function New-UntilTerminalExpr([string]$BodyAction) {
    return "@or(equals(coalesce(body('$BodyAction')?['State'], body('$BodyAction')?['State/Value'], ''), 'Succeeded'), equals(coalesce(body('$BodyAction')?['State'], body('$BodyAction')?['State/Value'], ''), 'Rejected'), equals(coalesce(body('$BodyAction')?['State'], body('$BodyAction')?['State/Value'], ''), 'Failed'))"
}

$untilWaitTerminal = [ordered]@{
    type       = 'Until'
    expression = (New-UntilTerminalExpr 'HTTP_WaitCmd')
    limit      = [ordered]@{ count = 60; timeout = 'PT2M' }
    actions  = [ordered]@{
        DELAY_WaitCmd = [ordered]@{
            type   = 'Wait'
            inputs = [ordered]@{ interval = [ordered]@{ count = 2; unit = 'Second' } }
        }
        HTTP_WaitCmd = [ordered]@{
            type     = 'OpenApiConnection'
            runAfter = @{ DELAY_WaitCmd = @('Succeeded') }
            inputs   = [ordered]@{
                host           = [ordered]@{
                    connectionName = 'shared_sharepointonline'
                    operationId    = 'HttpRequest'
                    apiId          = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
                }
                parameters     = [ordered]@{
                    dataset             = $site
                    'parameters/method'  = 'GET'
                    'parameters/uri'     = "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(variables('CommandId')), ')?`$select=Id,State,RequestKey,StepInstanceKey,ErrorMessage,CommandType')"
                    'parameters/headers' = [ordered]@{ Accept = 'application/json;odata=nometadata' }
                }
                authentication = "@parameters('`$authentication')"
            }
        }
    }
}

$respAfterWait = [ordered]@{
    type     = 'Response'
    kind     = 'Http'
    runAfter = @{ UNTIL_WaitTerminal = @('Succeeded', 'Failed', 'TimedOut', 'Skipped') }
    inputs   = [ordered]@{
        statusCode = 200
        headers    = $respHeaders
        body       = (New-RespBody "@coalesce(body('HTTP_WaitCmd')?['State'], body('HTTP_WaitCmd')?['State/Value'], 'Failed')" "@coalesce(body('HTTP_WaitCmd')?['ErrorMessage'],'WAIT_TIMEOUT')")
    }
}

$newElse = [ordered]@{}
$newElse['HTTP_ClaimProcessing'] = $claim
$newElse['SET_AuthorEmail'] = New-SetVar 'AuthorEmail' 'string' "@toLower(trim(coalesce(body('HTTP_LoadCommand')?['Author']?['EMail'], body('HTTP_LoadCommand')?['Author']?['Email'], '')))"
$newElse['SET_AuthorEmail'].runAfter = @{ HTTP_ClaimProcessing = @('Succeeded') }

$newElse['SET_EffectiveActor'] = New-SetVar 'EffectiveActorUPN' 'string' "@toLower(trim(if(equals(variables('AuthorEmail'),'$sysadmUpn'), coalesce(variables('Payload')?['actorUPN'], variables('Payload')?['creatorUPN'], variables('AuthorEmail')), variables('AuthorEmail'))))"
$newElse['SET_EffectiveActor'].runAfter = @{ SET_AuthorEmail = @('Succeeded') }

# Designer mới bắt buộc Value — dùng expression chuỗi rỗng, không dùng "".
$newElse['SET_AuthError_Clear'] = New-SetVar 'AuthError' 'string' "@string('')"
$newElse['SET_AuthError_Clear'].runAfter = @{ SET_EffectiveActor = @('Succeeded') }

$newElse['IF_AuthPayloadMismatch'] = [ordered]@{
    type       = 'If'
    runAfter   = @{ SET_AuthError_Clear = @('Succeeded') }
    expression = [ordered]@{
        and = @(
            [ordered]@{ not = [ordered]@{ equals = @("@variables('AuthorEmail')", $sysadmUpn) } }
            [ordered]@{
                or = @(
                    [ordered]@{
                        and = @(
                            [ordered]@{ not = [ordered]@{ empty = @("@coalesce(variables('Payload')?['actorUPN'],'')") } }
                            [ordered]@{ not = [ordered]@{ equals = @("@toLower(trim(string(variables('Payload')?['actorUPN'])))", "@variables('AuthorEmail')") } }
                        )
                    }
                    [ordered]@{
                        and = @(
                            [ordered]@{ not = [ordered]@{ empty = @("@coalesce(variables('Payload')?['creatorUPN'],'')") } }
                            [ordered]@{ not = [ordered]@{ equals = @("@toLower(trim(string(variables('Payload')?['creatorUPN'])))", "@variables('AuthorEmail')") } }
                        )
                    }
                )
            }
        )
    }
    actions    = [ordered]@{
        SET_AuthError_Mismatch = New-SetVar 'AuthError' 'string' 'AUTH: payload UPN mismatch'
    }
    else       = [ordered]@{ actions = [ordered]@{} }
}

$orgFilterMgr = "@concat('_api/web/lists(guid''$guidOrgMembers'')/items?`$filter=MemberUPN eq ''', replace(variables('EffectiveActorUPN'),'''',''''''), ''' and OUCode eq ''', replace(variables('NextOU'),'''',''''''), ''' and IsActive eq 1&`$select=Id,MemberUPN,OUCode,MemberRole,IsActive&`$top=5')"
$orgFilterAny = "@concat('_api/web/lists(guid''$guidOrgMembers'')/items?`$filter=MemberUPN eq ''', replace(variables('EffectiveActorUPN'),'''',''''''), ''' and OUCode eq ''', replace(string(variables('Payload')?['createdOUCode']),'''',''''''), ''' and IsActive eq 1&`$select=Id,MemberUPN,OUCode,MemberRole,IsActive&`$top=5')"
$masterFilter = "@concat('_api/web/lists(guid''$guidRequests'')/items?`$filter=RequestKey eq ''', replace(variables('RequestKey'),'''',''''''), '''&`$select=Id,RequestKey,Status,CurrentStepKey,CurrentOUCode,CreatedOUCode,CreatorUPN&`$top=2')"

$swAuth = [ordered]@{
    type       = 'Switch'
    expression = "@variables('CommandType')"
    runAfter   = @{ IF_AuthPayloadMismatch = @('Succeeded', 'Failed', 'Skipped') }
    cases      = [ordered]@{
        Case_AUTH_CREATE = [ordered]@{
            case    = 'CREATE_REQUEST'
            actions = [ordered]@{
                IF_AUTH_CREATE_OU = [ordered]@{
                    type       = 'If'
                    expression = [ordered]@{ empty = @("@coalesce(variables('Payload')?['createdOUCode'],'')") }
                    actions    = [ordered]@{
                        SET_AuthError_CREATE_OU = New-SetVar 'AuthError' 'string' 'AUTH: createdOUCode required'
                    }
                    else       = [ordered]@{
                        actions = [ordered]@{
                            IF_AUTH_CREATE_SYS = [ordered]@{
                                type       = 'If'
                                expression = [ordered]@{ equals = @("@variables('AuthorEmail')", $sysadmUpn) }
                                actions    = [ordered]@{}
                                else       = [ordered]@{
                                    actions = [ordered]@{
                                        HTTP_Auth_Org_CREATE = New-SpHttpGet $orgFilterAny
                                        IF_AUTH_CREATE_MEM = [ordered]@{
                                            type       = 'If'
                                            runAfter   = @{ HTTP_Auth_Org_CREATE = @('Succeeded') }
                                            expression = [ordered]@{ equals = @("@length(body('HTTP_Auth_Org_CREATE')?['value'])", 0) }
                                            actions    = [ordered]@{
                                                SET_AuthError_CREATE_MEM = New-SetVar 'AuthError' 'string' 'AUTH: not OrgMember of createdOU'
                                            }
                                            else       = [ordered]@{ actions = [ordered]@{} }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        Case_AUTH_SUBMIT = [ordered]@{
            case    = 'SUBMIT'
            actions = [ordered]@{
                HTTP_Auth_Master_SUBMIT = New-SpHttpGet $masterFilter
                IF_AUTH_SUBMIT = [ordered]@{
                    type       = 'If'
                    runAfter   = @{ HTTP_Auth_Master_SUBMIT = @('Succeeded') }
                    expression = [ordered]@{
                        and = @(
                            [ordered]@{ equals = @("@length(body('HTTP_Auth_Master_SUBMIT')?['value'])", 1) }
                            [ordered]@{ equals = @("@toLower(trim(string(coalesce(first(body('HTTP_Auth_Master_SUBMIT')?['value'])?['CreatorUPN'],''))))", "@variables('EffectiveActorUPN')") }
                            [ordered]@{ equals = @("@coalesce(first(body('HTTP_Auth_Master_SUBMIT')?['value'])?['CurrentStepKey'],'')", 'BPCM1_PREPARE') }
                            [ordered]@{
                                or = @(
                                    [ordered]@{ equals = @("@coalesce(first(body('HTTP_Auth_Master_SUBMIT')?['value'])?['Status'],'')", 'Draft') }
                                    [ordered]@{ equals = @("@coalesce(first(body('HTTP_Auth_Master_SUBMIT')?['value'])?['Status'],'')", 'Returned') }
                                )
                            }
                        )
                    }
                    actions    = [ordered]@{}
                    else       = [ordered]@{
                        actions = [ordered]@{
                            SET_AuthError_SUBMIT = New-SetVar 'AuthError' 'string' 'AUTH: SUBMIT not allowed for actor'
                        }
                    }
                }
            }
        }
        Case_AUTH_ACCEPT = [ordered]@{
            case    = 'ACCEPT'
            actions = [ordered]@{
                HTTP_Auth_Master_ACCEPT = New-SpHttpGet $masterFilter
                IF_AUTH_ACCEPT_STEP = [ordered]@{
                    type       = 'If'
                    runAfter   = @{ HTTP_Auth_Master_ACCEPT = @('Succeeded') }
                    expression = [ordered]@{
                        and = @(
                            [ordered]@{ equals = @("@length(body('HTTP_Auth_Master_ACCEPT')?['value'])", 1) }
                            [ordered]@{
                                or = @(
                                    [ordered]@{ equals = @("@coalesce(first(body('HTTP_Auth_Master_ACCEPT')?['value'])?['CurrentStepKey'],'')", 'BPCM2_TECH') }
                                    [ordered]@{ equals = @("@coalesce(first(body('HTTP_Auth_Master_ACCEPT')?['value'])?['CurrentStepKey'],'')", 'BPCM3_PRICE') }
                                    [ordered]@{ equals = @("@coalesce(first(body('HTTP_Auth_Master_ACCEPT')?['value'])?['CurrentStepKey'],'')", 'TCKT_CHECK') }
                                    [ordered]@{ equals = @("@coalesce(first(body('HTTP_Auth_Master_ACCEPT')?['value'])?['CurrentStepKey'],'')", 'TCKT_PAY') }
                                )
                            }
                        )
                    }
                    actions    = [ordered]@{
                        SET_OU_ACCEPT = New-SetVar 'NextOU' 'string' "@coalesce(first(body('HTTP_Auth_Master_ACCEPT')?['value'])?['CurrentOUCode'],'')"
                        HTTP_Auth_Org_ACCEPT = New-SpHttpGet $orgFilterMgr
                        IF_AUTH_ACCEPT_MGR = [ordered]@{
                            type       = 'If'
                            runAfter   = @{ HTTP_Auth_Org_ACCEPT = @('Succeeded') }
                            expression = [ordered]@{
                                and = @(
                                    [ordered]@{ greater = @("@length(body('HTTP_Auth_Org_ACCEPT')?['value'])", 0) }
                                    [ordered]@{ equals = @("@toLower(string(coalesce(first(body('HTTP_Auth_Org_ACCEPT')?['value'])?['MemberRole'], first(body('HTTP_Auth_Org_ACCEPT')?['value'])?['MemberRole']?['Value'],'')))", 'manager') }
                                )
                            }
                            actions    = [ordered]@{}
                            else       = [ordered]@{
                                actions = [ordered]@{
                                    SET_AuthError_ACCEPT = New-SetVar 'AuthError' 'string' 'AUTH: not Manager of CurrentOU'
                                }
                            }
                        }
                    }
                    else       = [ordered]@{
                        actions = [ordered]@{
                            SET_AuthError_ACCEPT_STEP = New-SetVar 'AuthError' 'string' 'AUTH: ACCEPT step not allowed'
                        }
                    }
                }
            }
        }
        Case_AUTH_DECIDE = [ordered]@{
            case    = 'DECIDE'
            actions = [ordered]@{
                HTTP_Auth_Master_DECIDE = New-SpHttpGet $masterFilter
                IF_AUTH_DECIDE_MASTER = [ordered]@{
                    type       = 'If'
                    runAfter   = @{ HTTP_Auth_Master_DECIDE = @('Succeeded') }
                    expression = [ordered]@{ equals = @("@length(body('HTTP_Auth_Master_DECIDE')?['value'])", 1) }
                    actions    = [ordered]@{
                        IF_AUTH_DECIDE_MGR_ROUTE = [ordered]@{
                            type       = 'If'
                            expression = [ordered]@{
                                and = @(
                                    [ordered]@{ equals = @("@coalesce(first(body('HTTP_Auth_Master_DECIDE')?['value'])?['Status'],'')", 'AwaitingManager') }
                                    [ordered]@{ equals = @("@coalesce(first(body('HTTP_Auth_Master_DECIDE')?['value'])?['CurrentStepKey'],'')", 'BPCM1_PREPARE') }
                                )
                            }
                            actions    = [ordered]@{
                                SET_OU_DECIDE_CREATED = New-SetVar 'NextOU' 'string' "@coalesce(first(body('HTTP_Auth_Master_DECIDE')?['value'])?['CreatedOUCode'],'')"
                                HTTP_Auth_Org_DECIDE = New-SpHttpGet $orgFilterMgr
                                IF_AUTH_DECIDE_MGR = [ordered]@{
                                    type       = 'If'
                                    runAfter   = @{ HTTP_Auth_Org_DECIDE = @('Succeeded') }
                                    expression = [ordered]@{
                                        and = @(
                                            [ordered]@{ greater = @("@length(body('HTTP_Auth_Org_DECIDE')?['value'])", 0) }
                                            [ordered]@{ equals = @("@toLower(string(coalesce(first(body('HTTP_Auth_Org_DECIDE')?['value'])?['MemberRole'], first(body('HTTP_Auth_Org_DECIDE')?['value'])?['MemberRole']?['Value'],'')))", 'manager') }
                                        )
                                    }
                                    actions    = [ordered]@{}
                                    else       = [ordered]@{
                                        actions = [ordered]@{
                                            SET_AuthError_DECIDE = New-SetVar 'AuthError' 'string' 'AUTH: not Manager of CreatedOU'
                                        }
                                    }
                                }
                            }
                            else       = [ordered]@{
                                actions = [ordered]@{
                                    SET_OU_DECIDE_CURRENT = New-SetVar 'NextOU' 'string' "@coalesce(first(body('HTTP_Auth_Master_DECIDE')?['value'])?['CurrentOUCode'],'')"
                                    HTTP_Auth_Org_DECIDE2 = New-SpHttpGet $orgFilterMgr
                                    IF_AUTH_DECIDE_MGR2 = [ordered]@{
                                        type       = 'If'
                                        runAfter   = @{ HTTP_Auth_Org_DECIDE2 = @('Succeeded') }
                                        expression = [ordered]@{
                                            and = @(
                                                [ordered]@{ greater = @("@length(body('HTTP_Auth_Org_DECIDE2')?['value'])", 0) }
                                                [ordered]@{ equals = @("@toLower(string(coalesce(first(body('HTTP_Auth_Org_DECIDE2')?['value'])?['MemberRole'], first(body('HTTP_Auth_Org_DECIDE2')?['value'])?['MemberRole']?['Value'],'')))", 'manager') }
                                            )
                                        }
                                        actions    = [ordered]@{}
                                        else       = [ordered]@{
                                            actions = [ordered]@{
                                                SET_AuthError_DECIDE2 = New-SetVar 'AuthError' 'string' 'AUTH: not Manager of CurrentOU'
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    else       = [ordered]@{
                        actions = [ordered]@{
                            SET_AuthError_DECIDE_MASTER = New-SetVar 'AuthError' 'string' 'AUTH: request not found'
                        }
                    }
                }
            }
        }
        Case_AUTH_CONFIRM = [ordered]@{
            case    = 'CONFIRM_PAYMENT'
            actions = [ordered]@{
                HTTP_Auth_Master_CONFIRM = New-SpHttpGet $masterFilter
                IF_AUTH_CONFIRM = [ordered]@{
                    type       = 'If'
                    runAfter   = @{ HTTP_Auth_Master_CONFIRM = @('Succeeded') }
                    expression = [ordered]@{
                        and = @(
                            [ordered]@{ equals = @("@length(body('HTTP_Auth_Master_CONFIRM')?['value'])", 1) }
                            [ordered]@{ equals = @("@coalesce(first(body('HTTP_Auth_Master_CONFIRM')?['value'])?['CurrentStepKey'],'')", 'TCKT_PAY') }
                        )
                    }
                    actions    = [ordered]@{
                        SET_OU_CONFIRM = New-SetVar 'NextOU' 'string' "@coalesce(first(body('HTTP_Auth_Master_CONFIRM')?['value'])?['CurrentOUCode'],'')"
                        HTTP_Auth_Org_CONFIRM = New-SpHttpGet $orgFilterMgr
                        IF_AUTH_CONFIRM_MGR = [ordered]@{
                            type       = 'If'
                            runAfter   = @{ HTTP_Auth_Org_CONFIRM = @('Succeeded') }
                            expression = [ordered]@{
                                and = @(
                                    [ordered]@{ greater = @("@length(body('HTTP_Auth_Org_CONFIRM')?['value'])", 0) }
                                    [ordered]@{ equals = @("@toLower(string(coalesce(first(body('HTTP_Auth_Org_CONFIRM')?['value'])?['MemberRole'], first(body('HTTP_Auth_Org_CONFIRM')?['value'])?['MemberRole']?['Value'],'')))", 'manager') }
                                )
                            }
                            actions    = [ordered]@{}
                            else       = [ordered]@{
                                actions = [ordered]@{
                                    SET_AuthError_CONFIRM = New-SetVar 'AuthError' 'string' 'AUTH: not Manager of CurrentOU'
                                }
                            }
                        }
                    }
                    else       = [ordered]@{
                        actions = [ordered]@{
                            SET_AuthError_CONFIRM_STEP = New-SetVar 'AuthError' 'string' 'AUTH: CONFIRM step not allowed'
                        }
                    }
                }
            }
        }
    }
    default = [ordered]@{
        actions = [ordered]@{
            SET_AuthError_UNKNOWN = New-SetVar 'AuthError' 'string' "@concat('AUTH: unknown CommandType ', variables('CommandType'))"
        }
    }
}

# Fix ACCEPT nested runAfter for SET_OU → HTTP
$swAuth.cases.Case_AUTH_ACCEPT.actions.IF_AUTH_ACCEPT_STEP.actions.HTTP_Auth_Org_ACCEPT.runAfter = @{ SET_OU_ACCEPT = @('Succeeded') }
$swAuth.cases.Case_AUTH_DECIDE.actions.IF_AUTH_DECIDE_MASTER.actions.IF_AUTH_DECIDE_MGR_ROUTE.actions.HTTP_Auth_Org_DECIDE.runAfter = @{ SET_OU_DECIDE_CREATED = @('Succeeded') }
$swAuth.cases.Case_AUTH_DECIDE.actions.IF_AUTH_DECIDE_MASTER.actions.IF_AUTH_DECIDE_MGR_ROUTE.else.actions.HTTP_Auth_Org_DECIDE2.runAfter = @{ SET_OU_DECIDE_CURRENT = @('Succeeded') }
$swAuth.cases.Case_AUTH_CONFIRM.actions.IF_AUTH_CONFIRM.actions.HTTP_Auth_Org_CONFIRM.runAfter = @{ SET_OU_CONFIRM = @('Succeeded') }
$swAuth.cases.Case_AUTH_CREATE.actions.IF_AUTH_CREATE_OU.else.actions.IF_AUTH_CREATE_SYS.else.actions.HTTP_Auth_Org_CREATE.runAfter = @{}

$newElse['SW_AuthGate'] = $swAuth

$swCommand.runAfter = @{}
$newElse['IF_AuthOk'] = [ordered]@{
    type       = 'If'
    runAfter   = @{ SW_AuthGate = @('Succeeded') }
    expression = [ordered]@{ empty = @("@variables('AuthError')") }
    actions    = [ordered]@{
        SW_CommandType = $swCommand
    }
    else       = [ordered]@{
        actions = [ordered]@{
            HTTP_RejectAuth = (New-SpHttpMerge `
                "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(variables('CommandId')), ')')" `
                "@json(concat('{""State"":""Rejected"",""ErrorMessage"":""', replace(variables('AuthError'),'""',''''), '"",""ProcessedAt"":""', utcNow(), '""}'))")
        }
    }
}

$httpGetFinal.runAfter = @{ IF_AuthOk = @('Succeeded') }
$newElse['HTTP_GetFinal'] = $httpGetFinal
$newElse['IF_WriteActivityInternal'] = $ifWriteInternal
# Không gồm Skipped: khi Claim/Auth bị skip, RESP_Api vẫn chạy → dual Response với RESP_After*.
$respApi.runAfter = @{ IF_WriteActivityInternal = @('Succeeded', 'Failed', 'TimedOut') }
$newElse['RESP_Api'] = $respApi

# Không nhánh Claim-Failed + Response song song với RESP_Api (gây CLAIM_CONFLICT / dual Response).
# Race cùng commandId: IF_AlreadyProcessing (Until) hoặc IF_AlreadyDone (terminal).

$claimAuthPipeline = $newElse

$dedupeFilter = "@concat('_api/web/lists(guid''$guidCommands'')/items?`$filter=DedupeKey eq ''', replace(variables('DedupeKey'),'''',''''''), ''' and State eq ''Succeeded'' and Id ne ', string(variables('CommandId')), '&`$select=Id,State,RequestKey,StepInstanceKey,DedupeKey&`$top=3')"

$afterDedupeMiss = $claimAuthPipeline
$ifDedupeHit = [ordered]@{
    type       = 'If'
    runAfter   = @{ HTTP_FindDedupe = @('Succeeded') }
    expression = [ordered]@{
        and = @(
            [ordered]@{ not = [ordered]@{ empty = @("@variables('DedupeKey')") } }
            [ordered]@{ greater = @("@length(coalesce(body('HTTP_FindDedupe')?['value'], json('[]')))", 0) }
        )
    }
    actions    = [ordered]@{
        # Không coalesce với variables('RequestKey') — SetVariable cấm self-reference.
        SET_RequestKey_Dedupe = New-SetVar 'RequestKey' 'string' "@coalesce(first(body('HTTP_FindDedupe')?['value'])?['RequestKey'],'')"
        SET_SIK_Dedupe        = $null
        HTTP_MarkDedupeNoop   = $null
        RESP_DedupeNoop       = $null
    }
    else       = [ordered]@{ actions = $afterDedupeMiss }
}
$ifDedupeHit.actions.SET_SIK_Dedupe = New-SetVar 'StepInstanceKey' 'string' "@coalesce(first(body('HTTP_FindDedupe')?['value'])?['StepInstanceKey'],'')"
$ifDedupeHit.actions.SET_SIK_Dedupe.runAfter = @{ SET_RequestKey_Dedupe = @('Succeeded') }
$ifDedupeHit.actions.HTTP_MarkDedupeNoop = New-SpHttpMerge `
    "@concat('_api/web/lists(guid''$guidCommands'')/items(', string(variables('CommandId')), ')')" `
    "@json(concat('{""State"":""Succeeded"",""ErrorMessage"":""DEDUPE_NOOP"",""RequestKey"":""', variables('RequestKey'), '"",""StepInstanceKey"":""', variables('StepInstanceKey'), '"",""ProcessedAt"":""', utcNow(), '""}'))"
$ifDedupeHit.actions.HTTP_MarkDedupeNoop.runAfter = @{ SET_SIK_Dedupe = @('Succeeded') }
$ifDedupeHit.actions.RESP_DedupeNoop = [ordered]@{
    type     = 'Response'
    kind     = 'Http'
    runAfter = @{ HTTP_MarkDedupeNoop = @('Succeeded', 'Failed', 'TimedOut', 'Skipped') }
    inputs   = [ordered]@{
        statusCode = 200
        headers    = $respHeaders
        body       = (New-RespBody "'Succeeded'" "'DEDUPE_NOOP'")
    }
}

$pendingBranch = [ordered]@{
    HTTP_FindDedupe = (New-SpHttpGet $dedupeFilter)
    IF_DedupeHit    = $ifDedupeHit
}
$pendingBranch.IF_DedupeHit.runAfter = @{ HTTP_FindDedupe = @('Succeeded') }

$untilProcessing = [ordered]@{
    type       = 'Until'
    expression = (New-UntilTerminalExpr 'HTTP_WaitCmd_P')
    limit      = $untilWaitTerminal.limit
    actions    = [ordered]@{
        DELAY_WaitCmd_P = [ordered]@{
            type   = 'Wait'
            inputs = [ordered]@{ interval = [ordered]@{ count = 2; unit = 'Second' } }
        }
        HTTP_WaitCmd_P = [ordered]@{
            type     = 'OpenApiConnection'
            runAfter = @{ DELAY_WaitCmd_P = @('Succeeded') }
            inputs   = $untilWaitTerminal.actions.HTTP_WaitCmd.inputs
        }
    }
}

$topElse = [ordered]@{
    IF_AlreadyProcessing = [ordered]@{
        type       = 'If'
        expression = [ordered]@{
            and = @(
                [ordered]@{
                    equals = @(
                        "@toLower(trim(string(coalesce(body('HTTP_LoadCommand')?['State'], body('HTTP_LoadCommand')?['State/Value'], ''))))"
                        'processing'
                    )
                }
            )
        }
        actions    = [ordered]@{
            UNTIL_WaitProcessing = $untilProcessing
            RESP_AfterProcessing = [ordered]@{
                type     = 'Response'
                kind     = 'Http'
                runAfter = @{ UNTIL_WaitProcessing = @('Succeeded', 'Failed', 'TimedOut') }
                inputs   = [ordered]@{
                    statusCode = 200
                    headers    = $respHeaders
                    body       = [ordered]@{
                        commandId       = "@variables('CommandId')"
                        state           = "@coalesce(body('HTTP_WaitCmd_P')?['State'], body('HTTP_WaitCmd_P')?['State/Value'], 'Failed')"
                        requestKey      = "@coalesce(body('HTTP_WaitCmd_P')?['RequestKey'], variables('RequestKey'), '')"
                        stepInstanceKey = "@coalesce(body('HTTP_WaitCmd_P')?['StepInstanceKey'], variables('StepInstanceKey'), '')"
                        errorMessage    = "@coalesce(body('HTTP_WaitCmd_P')?['ErrorMessage'], '')"
                        commandType     = "@coalesce(body('HTTP_WaitCmd_P')?['CommandType'], variables('CommandType'))"
                    }
                }
            }
        }
        else       = [ordered]@{ actions = $pendingBranch }
    }
}

$definition.actions.IF_AlreadyDone.else.actions = $topElse

# --- Master ETag: SET sau FindMaster + IF-MATCH trên MERGE Requests ---
function Set-MasterETagHooks($node) {
    if ($null -eq $node) { return }
    if ($node -is [System.Collections.IDictionary]) {
        $keys = @($node.Keys)
        foreach ($k in $keys) {
            if ($k -like 'SET_MasterId_*') {
                $src = switch -Wildcard ($k) {
                    'SET_MasterId_Submit'  { "first(body('HTTP_FindMaster_Submit')?['value'])" }
                    'SET_MasterId_Decide'  { "first(body('HTTP_FindMaster_Decide')?['value'])" }
                    'SET_MasterId_Reject'  { "first(body('HTTP_FindMaster_Reject')?['value'])" }
                    'SET_MasterId_Confirm' { "first(body('HTTP_FindMaster_Confirm')?['value'])" }
                    default { $null }
                }
                if ($src) {
                    $etagName = ($k -replace 'SET_MasterId_', 'SET_MasterETag_')
                    if (-not $node.Contains($etagName)) {
                        $nextKeys = @($node.Keys | Where-Object { $_ -ne $k -and $node[$_].runAfter -and ($node[$_].runAfter.Keys -contains $k) })
                        # Tránh PS null-conditional nuốt `$src?[...]` — ghép chuỗi tay.
                        $etagExpr = '@coalesce(' + $src + '?[''@odata.etag''],''*'')'
                        $node[$etagName] = New-SetVar 'MasterETag' 'string' $etagExpr
                        $node[$etagName].runAfter = @{ $k = @('Succeeded') }
                        foreach ($nk in $nextKeys) {
                            $node[$nk].runAfter = @{ $etagName = @('Succeeded') }
                        }
                    }
                }
            }
            Set-MasterETagHooks $node[$k]
        }
    }
    elseif ($node -is [System.Collections.IEnumerable] -and $node -isnot [string]) {
        foreach ($item in $node) { Set-MasterETagHooks $item }
    }
}
function Set-RequestsMergeETag($node) {
    if ($null -eq $node) { return }
    if ($node -is [System.Collections.IDictionary]) {
        if ($node.Contains('inputs') -and $node.inputs -is [System.Collections.IDictionary]) {
            $p = $node.inputs['parameters']
            if ($p -and $p["parameters/headers"] -and $p["parameters/uri"]) {
                $uri = [string]$p['parameters/uri']
                if ($uri -like "*$guidRequests*" -and $uri -like '*items(*MasterId*') {
                    $p['parameters/headers']['IF-MATCH'] = "@variables('MasterETag')"
                }
            }
        }
        foreach ($k in @($node.Keys)) { Set-RequestsMergeETag $node[$k] }
    }
    elseif ($node -is [System.Collections.IEnumerable] -and $node -isnot [string]) {
        foreach ($item in $node) { Set-RequestsMergeETag $item }
    }
}
Set-MasterETagHooks $definition
Set-RequestsMergeETag $definition

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

# --- Validate trước khi ZIP (tránh vòng Import XRM BadRequest) ---
function Test-FlowDefinition([object]$Def) {
    $issues = [System.Collections.Generic.List[string]]::new()
    $json = $Def | ConvertTo-Json -Depth 100 -Compress:$false

    # 1) Trigger concurrency + sync Response
    $hasTrigConc = $json -match '"triggers"[\s\S]*?"concurrency"\s*:\s*\{\s*"runs"'
    $hasResponse = $json -match '"type"\s*:\s*"Response"'
    $hasAsyncResp = $json -match '"operationOptions"\s*:\s*"Asynchronous"'
    if ($hasTrigConc -and $hasResponse -and -not $hasAsyncResp) {
        $issues.Add('InvalidConcurrencyConfiguration: trigger concurrency.runs + sync Response (cần bỏ concurrency hoặc Response Asynchronous)')
    }

    # 2) Until expression phải là chuỗi
    if ($json -match '"type"\s*:\s*"Until"[\s\S]{0,200}"expression"\s*:\s*\{') {
        $issues.Add('PropertyNotAllowed: Until.expression dạng object — dùng chuỗi @or(...)')
    }

    # 3) SetVariable self-reference
    $setVarPattern = '"type"\s*:\s*"SetVariable"\s*,\s*"inputs"\s*:\s*\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"value"\s*:\s*"([^"]*)"'
    $matches = [regex]::Matches($json, $setVarPattern)
    foreach ($m in $matches) {
        $varName = $m.Groups[1].Value
        $val = $m.Groups[2].Value
        if ($val -match ("variables\('{0}'\)" -f [regex]::Escape($varName))) {
            $issues.Add(("WorkflowRunActionInputsInvalidProperty: SetVariable '{0}' self-reference trong value" -f $varName))
        }
    }
    # order name/value có thể đảo (value trước name) — check thêm
    $setVarPattern2 = '"type"\s*:\s*"SetVariable"[\s\S]{0,400}?"name"\s*:\s*"([^"]+)"[\s\S]{0,200}?"value"\s*:\s*"([^"]*)"'
    foreach ($m in [regex]::Matches($json, $setVarPattern2)) {
        $varName = $m.Groups[1].Value
        $val = $m.Groups[2].Value
        if ($val -match ("variables\('{0}'\)" -f [regex]::Escape($varName))) {
            $msg = ("WorkflowRunActionInputsInvalidProperty: SetVariable '{0}' self-reference trong value" -f $varName)
            if (-not $issues.Contains($msg)) { $issues.Add($msg) }
        }
    }

    if ($issues.Count -gt 0) {
        Write-Host 'Flow definition validation FAILED:' -ForegroundColor Red
        $issues | ForEach-Object { Write-Host ("  - {0}" -f $_) -ForegroundColor Red }
        throw ("Build aborted: {0} validation issue(s)" -f $issues.Count)
    }
    Write-Host 'Flow definition validation OK (concurrency/Until/SetVariable self-ref)' -ForegroundColor Green
}

Test-FlowDefinition $definition

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
      <Description description="Core Orchestrator HTTP API 1.0.0.22: CREATE RoutePlanJson escape fix (_biz); optional BPCM DECIDE" languagecode="1033" />
    </Descriptions>
    <Version>1.0.0.22</Version>
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
