[CmdletBinding()]
param([string]$StatePath = $(if ($env:TASKCAPTURE_STATE) {$env:TASKCAPTURE_STATE} else {Join-Path $env:USERPROFILE 'TaskCaptureState'}),[string]$OutputPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$captureSuccess = $false
try {
 foreach ($captureName in @('beeper-token.dpapi','whatsapp-identity.dpapi','slack-identity.dpapi')) {
  $captureBytes = [IO.File]::ReadAllBytes((Join-Path $StatePath $captureName))
  $capturePlain = [Security.Cryptography.ProtectedData]::Unprotect($captureBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  if ($capturePlain.Length -eq 0) {throw 'Empty credential'}
  [Array]::Clear($capturePlain,0,$capturePlain.Length)
 }
 if (-not (Test-Path -LiteralPath (Join-Path $StatePath 'capture.sqlite'))) {throw 'Missing state'}
 $captureSuccess = $true
} catch { $captureSuccess = $false }
$captureNative=@'
using System;
using System.Text;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class CaptureStateProbe {
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] public static extern int GetCurrentPackageFullName(ref uint n,StringBuilder s);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFile(string p,uint a,uint s,IntPtr x,uint d,uint f,IntPtr t);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandle(SafeFileHandle h,StringBuilder b,uint n,uint f);
 public static string Resolve(string p){using(var h=CreateFile(p,0,7,IntPtr.Zero,3,0x02000000,IntPtr.Zero)){if(h.IsInvalid)return "unavailable";var b=new StringBuilder(4096);return GetFinalPathNameByHandle(h,b,4096,0)>0?b.ToString():"unavailable";}}
}
'@
Add-Type -TypeDefinition $captureNative
[uint32]$capturePackageLength=0
$captureOutside=([CaptureStateProbe]::GetCurrentPackageFullName([ref]$capturePackageLength,$null) -eq 15700)
$captureResult=[pscustomobject]@{stateReadable=$captureSuccess;dpapiDecryptSucceeded=$captureSuccess;statePath=$StatePath;outsidePackagedApp=$captureOutside;resolvedDatabasePath=[CaptureStateProbe]::Resolve((Join-Path $StatePath 'capture.sqlite'))}
$captureJson=$captureResult | ConvertTo-Json -Compress
if ($OutputPath) {Set-Content -LiteralPath $OutputPath -Value $captureJson -Encoding utf8} else {Write-Output $captureJson}
if (-not $captureSuccess) {exit 1}
