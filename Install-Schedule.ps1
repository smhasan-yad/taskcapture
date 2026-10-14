[CmdletBinding()]
param([switch]$ApproveRegistration,[string]$TaskName)
$ErrorActionPreference='Stop'
$captureRuntimeConfig=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'config\runtime.json') -Raw -Encoding utf8 | ConvertFrom-Json
$captureTaskName=if ($TaskName) {$TaskName} elseif ($captureRuntimeConfig.task_name) {$captureRuntimeConfig.task_name} else {'TaskCapture'}
$capturePowerShell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$captureArguments='-NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File "'+(Join-Path $PSScriptRoot 'Run-Capture.ps1')+'" -Live'
if (-not $ApproveRegistration) {
 [pscustomobject]@{registered=$false;taskName=$captureTaskName;times=@('20:00','23:00');timezone='Asia/Karachi';missedStartCatchUp=$true;runAs=[Security.Principal.WindowsIdentity]::GetCurrent().Name;program=$capturePowerShell;arguments=$captureArguments} | ConvertTo-Json
 exit 0
}
if ((Get-TimeZone).Id -ne 'Pakistan Standard Time') {throw 'Set this PC to Pakistan time before registering local-hour triggers.'}
$captureRuntimeConfig=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'config\runtime.json') -Raw -Encoding utf8 | ConvertFrom-Json
if ($captureRuntimeConfig.first_live_run_approved -ne $true -or $captureRuntimeConfig.enabled -ne $true) {throw 'First live run approval and capture activation are required before schedule registration.'}
if (Get-ScheduledTask -TaskName $captureTaskName -ErrorAction SilentlyContinue) {throw 'Existing task must be reviewed before replacement.'}
$captureAction=New-ScheduledTaskAction -Execute $capturePowerShell -Argument $captureArguments -WorkingDirectory $PSScriptRoot
$captureTriggers=@((New-ScheduledTaskTrigger -Daily -At '20:00'),(New-ScheduledTaskTrigger -Daily -At '23:00'))
$captureSettings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 75) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$capturePrincipal=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $captureTaskName -Action $captureAction -Trigger $captureTriggers -Settings $captureSettings -Principal $capturePrincipal -Description 'Local chat task capture; requires Beeper and the configured Windows user signed in.' | Out-Null
$captureRuntimeConfig.schedule_registered=$true
$captureRuntimeConfig | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'config\runtime.json') -Encoding utf8
Write-Output 'TaskCapture schedule registered. It does not start a capture immediately.'
