param([switch]$DeleteSharedData)

$ErrorActionPreference = 'Stop'
$TaskName = 'Days Inn Aven No-Rent Shared Service'
$Prefix = 'http://127.0.0.1:17831/'
$InstallRoot = Join-Path $env:ProgramData 'DaysInn\AvenNoRentAlert'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'This uninstaller must be run as Administrator.'
}

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -ne $task) {
    try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue } catch {}
    Start-Sleep -Seconds 1
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

& netsh.exe http delete urlacl url=$Prefix 2>$null | Out-Null

if ($DeleteSharedData) {
    Remove-Item -LiteralPath $InstallRoot -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host 'Shared service, extension copy, data, and backups were removed.' -ForegroundColor Green
} else {
    Remove-Item -LiteralPath (Join-Path $InstallRoot 'Service') -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host 'Shared service was removed. The shared data and backups were preserved.' -ForegroundColor Green
    Write-Host "Preserved location: $InstallRoot\Data"
}
