[CmdletBinding()]
param([string]$StatePath=$(if ($env:TASKCAPTURE_STATE) {$env:TASKCAPTURE_STATE} else {Join-Path $env:USERPROFILE 'TaskCaptureState'}))
$ErrorActionPreference='Stop'
$captureRuntime=Join-Path $StatePath 'runtime'
if ([IO.Path]::GetFullPath($captureRuntime) -eq [IO.Path]::GetFullPath($PSScriptRoot)) {throw 'Run deployment from the source checkout.'}
if (-not (Test-Path -LiteralPath (Join-Path $StatePath 'capture.sqlite'))) {throw 'State migration must be verified first.'}
$captureExistingConfig=Join-Path $captureRuntime 'config\runtime.json'
if (Test-Path -LiteralPath $captureExistingConfig) {
 $captureExistingRuntime=Get-Content -LiteralPath $captureExistingConfig -Raw -Encoding utf8 | ConvertFrom-Json
 if ($captureExistingRuntime.enabled -eq $true) {throw 'Disable capture and its scheduled task before redeploying the runtime.'}
}
New-Item -ItemType Directory -Path $captureRuntime -Force | Out-Null
foreach ($captureDir in @('worker','config')) {New-Item -ItemType Directory -Path (Join-Path $captureRuntime $captureDir) -Force | Out-Null}
$captureFiles=@('Run-Capture.ps1','Notify-Failure.ps1','Verify-State.ps1','Install-Schedule.ps1')
$captureFiles+=@(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'worker') -File | Where-Object {$_.Extension -eq '.cjs' -or $_.Name -eq 'Extract-Tasks.ps1' -or $_.Name -eq 'task-schema.json'} | ForEach-Object {'worker\'+$_.Name})
$captureFiles+=@(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'config') -File -Filter '*.json' | Where-Object {$_.Name -notlike '*.example.json'} | ForEach-Object {'config\'+$_.Name})
foreach ($captureFile in $captureFiles) {
 $captureTarget=Join-Path $captureRuntime $captureFile
 $captureTemp=$captureTarget+'.deploy.tmp'
 Copy-Item -LiteralPath (Join-Path $PSScriptRoot $captureFile) -Destination $captureTemp -Force
 Move-Item -LiteralPath $captureTemp -Destination $captureTarget -Force
}
$captureAcl=New-Object Security.AccessControl.DirectorySecurity
$captureAcl.SetAccessRuleProtection($true,$false)
foreach ($captureIdentity in @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18','S-1-5-32-544')) {
 $captureRule=New-Object Security.AccessControl.FileSystemAccessRule([Security.Principal.SecurityIdentifier]::new($captureIdentity),'FullControl','ContainerInherit,ObjectInherit','None','Allow')
 $captureAcl.SetAccessRule($captureRule)
}
$captureDirectory=New-Object IO.DirectoryInfo($StatePath)
$captureDirectory.SetAccessControl($captureAcl)
Write-Output 'Local runtime deployed. Capture remains disabled; no schedule was registered.'
