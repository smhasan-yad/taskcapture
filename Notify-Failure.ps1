param([Parameter(Mandatory=$true)][string]$LogPath)
$ErrorActionPreference='Stop'
try {
 $captureAppId='Hasan.TaskCapture'
 $captureKey='HKCU:\Software\Classes\AppUserModelId\'+$captureAppId
 New-Item -Path $captureKey -Force | Out-Null
 New-ItemProperty -Path $captureKey -Name DisplayName -Value 'TaskCapture' -PropertyType String -Force | Out-Null
 [Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime] | Out-Null
 [Windows.Data.Xml.Dom.XmlDocument,Windows.Data.Xml.Dom.XmlDocument,ContentType=WindowsRuntime] | Out-Null
 $captureXml=New-Object Windows.Data.Xml.Dom.XmlDocument
 $captureXml.LoadXml('<toast><visual><binding template="ToastGeneric"><text>TaskCapture needs attention</text><text>A step failed. Saved messages are retained for retry. Check the TaskCapture log.</text></binding></visual></toast>')
 $captureToast=[Windows.UI.Notifications.ToastNotification]::new($captureXml)
 [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($captureAppId).Show($captureToast)
} catch {
 Add-Content -LiteralPath $LogPath -Value ((Get-Date -Format o)+' notification_unavailable') -Encoding utf8
}
