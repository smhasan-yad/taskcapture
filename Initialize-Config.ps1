[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$captureConfigDirectory=Join-Path $PSScriptRoot 'config'
foreach ($captureExample in (Get-ChildItem -LiteralPath $captureConfigDirectory -Filter '*.example.json' -File)) {
 $captureTarget=Join-Path $captureConfigDirectory ($captureExample.Name.Replace('.example.json','.json'))
 if (-not (Test-Path -LiteralPath $captureTarget)) {
  Get-Content -LiteralPath $captureExample.FullName -Raw -Encoding utf8 | Set-Content -LiteralPath $captureTarget -Encoding utf8
  Write-Output ('Created local configuration: '+[IO.Path]::GetFileName($captureTarget))
 }
}
Write-Output 'Local settings ready. Existing settings were preserved; capture was not started.'
