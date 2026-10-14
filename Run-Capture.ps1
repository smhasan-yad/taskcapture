[CmdletBinding()]
param([switch]$Live,[string]$NodePath='C:\Program Files\nodejs\node.exe',[string]$StatePath=$(if ($env:TASKCAPTURE_STATE) {$env:TASKCAPTURE_STATE} else {Join-Path $env:USERPROFILE 'TaskCaptureState'}),[scriptblock]$StepExecutor,[switch]$SuppressToast)
$ErrorActionPreference='Stop'
$env:TASKCAPTURE_STATE=$StatePath
$captureWorker=Join-Path $PSScriptRoot 'worker'
if (-not $Live) {
 & $NodePath (Join-Path $captureWorker 'Queue-Dry-Run.cjs')
 exit $LASTEXITCODE
}
try { $Host.UI.RawUI.WindowTitle = 'TaskCapture - WhatsApp and Slack to TickTick' } catch {}
Write-Host 'TaskCapture - WhatsApp and Slack to TickTick' -ForegroundColor Cyan
Write-Host 'Scheduled task capture is running. Keep this window open; closing it stops this run.'
Write-Host 'You can minimize this window. It closes automatically when the run finishes.'
Write-Host ('Started: '+(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Write-Host ''
$captureLogDirectory=Join-Path $StatePath 'logs'
New-Item -ItemType Directory -Path $captureLogDirectory -Force | Out-Null
$captureLog=Join-Path $captureLogDirectory ((Get-Date -Format 'yyyy-MM-dd')+'.log')
if (-not $StepExecutor) {
 try {$captureRuntime=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'config\runtime.json') -Raw -Encoding utf8 | ConvertFrom-Json} catch {
  Add-Content -LiteralPath $captureLog -Value ((Get-Date -Format o)+' runtime_configuration_invalid') -Encoding utf8
  if (-not $SuppressToast) { & (Join-Path $PSScriptRoot 'Notify-Failure.ps1') -LogPath $captureLog }
  exit 1
 }
 if ($captureRuntime.enabled -ne $true) {Add-Content -LiteralPath $captureLog -Value ((Get-Date -Format o)+' capture_disabled') -Encoding utf8; Write-Output 'TaskCapture is disabled.'; exit 0}
}
$captureRunLock=Join-Path $StatePath 'runner.lock'
try {$captureLock=[IO.File]::Open($captureRunLock,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)} catch {
 Add-Content -LiteralPath $captureLog -Value ((Get-Date -Format o)+' runner_already_active') -Encoding utf8
 exit 1
}
$captureFailed=$false
function Invoke-CaptureStep([string]$Stage,[string]$Script,[string[]]$StepArguments=@()) {
 $captureStepStarted=Get-Date
 $captureStageNames = @{
  temporary_cleanup='Cleaning temporary files'
  ticktick_health='Checking TickTick connection and model availability'
  slack_resolution='Finding recent Slack conversations'
  whatsapp_resolution='Finding recent WhatsApp conversations'
  whatsapp_intake='Reading recent WhatsApp messages'
  slack_intake='Reading recent Slack messages'
  queue_processing='Checking queued requests and updating TickTick tasks'
 }
 $captureStageText = $captureStageNames[$Stage]
 if (-not $captureStageText) {$captureStageText='Running capture step'}
 try { $Host.UI.RawUI.WindowTitle = 'TaskCapture - '+$captureStageText } catch {}
 Write-Host ((Get-Date -Format 'HH:mm:ss')+' - '+$captureStageText+'...')
 Add-Content -LiteralPath $captureLog -Value ((Get-Date -Format o)+' '+$Stage+' started') -Encoding utf8
 if ($StepExecutor) {
  $captureExit=1
  try {$captureExit=[int](& $StepExecutor $Stage $Script $StepArguments)} catch {$captureExit=1}
  Add-Content -LiteralPath $captureLog -Value ((Get-Date -Format o)+' '+$Stage+' exit='+$captureExit+' durationMs='+[int]((Get-Date)-$captureStepStarted).TotalMilliseconds) -Encoding utf8
  if ($captureExit -ne 0) {$script:captureFailed=$true; Write-Host '  Failed - see the TaskCapture log for details.' -ForegroundColor Yellow} else {Write-Host '  Done.'}
  return ($captureExit -eq 0)
 }
 $captureProcessInfo=New-Object Diagnostics.ProcessStartInfo
 $captureProcessInfo.FileName=$NodePath
 $captureProcessInfo.Arguments='"'+(Join-Path $captureWorker $Script)+'" '+($StepArguments -join ' ')
 $captureProcessInfo.UseShellExecute=$false
 $captureProcessInfo.CreateNoWindow=$true
 $captureProcessInfo.RedirectStandardOutput=$true
 $captureProcessInfo.RedirectStandardError=$true
 $captureProcessInfo.WorkingDirectory=$PSScriptRoot
 $captureProcess=New-Object Diagnostics.Process
 $captureProcess.StartInfo=$captureProcessInfo
 $captureStructuredCount=0; $captureErrorText=''
 try {
  $null=$captureProcess.Start()
  $captureOut=$captureProcess.StandardOutput.ReadToEndAsync()
  $captureErr=$captureProcess.StandardError.ReadToEndAsync()
  if (-not $captureProcess.WaitForExit(600000)) { & taskkill.exe /PID $captureProcess.Id /T /F *> $null; throw 'Step timeout' }
  $captureSummaryText=$captureOut.GetAwaiter().GetResult(); $captureErrorText=$captureErr.GetAwaiter().GetResult()
  foreach ($captureLine in ($captureSummaryText -split "`n")) {
   try {
    $captureParsed=$captureLine | ConvertFrom-Json -ErrorAction Stop
    $captureSafe=@{}
    foreach ($captureField in @('created','reviewTasks','merged','examined','newRevisions','uncertain','updatesNeedingReview','failedConversations','candidates','extractedTasks','deferredCandidates','pending','modelCalled','activeConversations','groupChats','sideChats','connectedAccounts','unavailableHistory','cleanupFailures','deadlineReviews')) {
     if ($null -ne $captureParsed.$captureField -and $captureParsed.$captureField -is [ValueType]) {$captureSafe[$captureField]=$captureParsed.$captureField}
    }
    if ($captureParsed.errorCode -match '^(subscription_limit|extraction_timeout|extraction_unavailable|extraction_failed|extraction_model_unavailable|extraction_authentication|extraction_connection|checkpoint_missing|history_cursor_missing|history_page_limit|pagination_stalled|message_identity_invalid|identity_unverified|beeper_http_error|encryption_failed|intake_failed|queue_failed|queue_cleanup_failed|ticktick_timeout|ticktick_protocol_failed|ticktick_connector_stopped|ticktick_connector_unavailable|ticktick_connector_closed|ticktick_pipe_failed|encryption_timeout|encryption_unavailable|encryption_invalid_response|validation_envelope|validation_fields|validation_text|validation_deadline|validation_calendar|validation_duplicate_target|validation_related_sources|validation_source_identity|validation_task|validation_json|extraction_input_invalid|extraction_cli_failed|extraction_result_missing|extraction_result_invalid|extraction_source_unknown|extraction_source_duplicate|extraction_title_empty|extraction_contract_invalid|extraction_cleanup_failed)$') {$captureSafe['errorCode']=$captureParsed.errorCode}
    if ($captureParsed.phase -in @('configuration','processor_lock','state_open','recoverable_drafts','decrypt_drafts','pending_selection','decrypt_pending','decrypt_context','candidate_selection','queue_filter','ticktick_connect','ticktick_projects','list_existing_tasks','queue_input','extraction','parse_extraction','validation','task_enrichment','encrypt_drafts','persist_drafts','task_delivery','cleanup','unknown')) {$captureSafe['phase']=$captureParsed.phase}
    if ($captureParsed.operation -in @('initialize','mcpServerStatus/list','thread/start','model/list','list_projects','get_project_with_undone_tasks','create_task','get_task_by_id','update_task','unknown')) {$captureSafe['operation']=$captureParsed.operation}
    if ($captureSafe.ContainsKey('errorCode')) {Write-Host ('  Diagnostic: '+$captureSafe.errorCode+'; phase: '+$captureSafe.phase+'; request: '+$captureSafe.operation) -ForegroundColor Yellow}
    if ($captureSafe.Count -gt 0) {$captureStructuredCount++;Add-Content -LiteralPath $captureLog -Value ($Stage+' '+($captureSafe | ConvertTo-Json -Compress)) -Encoding utf8}
   } catch {}
  }
  $captureExit=$captureProcess.ExitCode
 } catch {$captureExit=1} finally {$captureProcess.Dispose()}
 if ($captureExit -ne 0 -and $captureStructuredCount -eq 0) {Add-Content -LiteralPath $captureLog -Value ($Stage+' errorCode=step_failed_without_summary stderrBytes='+[Text.Encoding]::UTF8.GetByteCount($captureErrorText)) -Encoding utf8}
 Add-Content -LiteralPath $captureLog -Value ((Get-Date -Format o)+' '+$Stage+' exit='+$captureExit+' durationMs='+[int]((Get-Date)-$captureStepStarted).TotalMilliseconds) -Encoding utf8
 if ($captureExit -ne 0) {$script:captureFailed=$true; Write-Host '  Failed - see the TaskCapture log for details.' -ForegroundColor Yellow} else {Write-Host '  Done.'}
 return ($captureExit -eq 0)
}
try {
 if ((Invoke-CaptureStep 'temporary_cleanup' 'Cleanup-Temporary.cjs') -and (Invoke-CaptureStep 'ticktick_health' 'Health-Check.cjs')) {
  $captureSlackReady=Invoke-CaptureStep 'slack_resolution' 'Resolve-Recent.cjs' @('--slack')
  $captureWhatsAppReady=Invoke-CaptureStep 'whatsapp_resolution' 'Resolve-Recent.cjs' @('--whatsapp')
  if ($captureWhatsAppReady) {$null=Invoke-CaptureStep 'whatsapp_intake' 'Collect-Beeper.cjs' @('--trial','--all-approved')}
  if ($captureSlackReady) {$null=Invoke-CaptureStep 'slack_intake' 'Collect-Beeper.cjs' @('--slack','--trial')}
  $null=Invoke-CaptureStep 'queue_processing' 'Process-Queue.cjs' @('--trial')
 }
 if ($captureFailed) { Write-Host ('TaskCapture finished with errors. Log: '+$captureLog) -ForegroundColor Yellow; if (-not $SuppressToast) { & (Join-Path $PSScriptRoot 'Notify-Failure.ps1') -LogPath $captureLog }; exit 1 }
 Write-Host 'TaskCapture finished successfully.' -ForegroundColor Green
} finally {$captureLock.Dispose()}
