[CmdletBinding()]
param([string]$NodePath='node')
$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'Initialize-Config.ps1')
$captureTests=Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'tests') -Filter '*.test.cjs' -File | Sort-Object Name
foreach ($captureTest in $captureTests) {
 & $NodePath $captureTest.FullName
 if ($LASTEXITCODE -ne 0) {throw ('Offline test failed: '+$captureTest.Name)}
}
Write-Output ('Passed '+$captureTests.Count+' offline test groups. No live model or connector calls.')
