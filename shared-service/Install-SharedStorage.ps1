$ErrorActionPreference = 'Stop'

$TaskName = 'Days Inn Aven No-Rent Shared Service'
$Port = 17831
$Prefix = "http://127.0.0.1:$Port/"
$InstallRoot = Join-Path $env:ProgramData 'DaysInn\AvenNoRentAlert'
$ServiceInstallDirectory = Join-Path $InstallRoot 'Service'
$ExtensionInstallDirectory = Join-Path $InstallRoot 'Extension'
$DataDirectory = Join-Path $InstallRoot 'Data'
$SourceRoot = Split-Path $PSScriptRoot -Parent
$ExtensionSourceDirectory = Join-Path $SourceRoot 'aven-no-rent-alert'
$ServerSourceFile = Join-Path $PSScriptRoot 'AvenNoRentServer.ps1'
$ServerInstallFile = Join-Path $ServiceInstallDirectory 'AvenNoRentServer.ps1'

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'This installer must be run as Administrator.'
    }
}

function Wait-ForService {
    param([int]$Seconds = 15)
    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        try {
            return Invoke-RestMethod -Uri "${Prefix}health" -Method Get -TimeoutSec 2
        } catch {
            Start-Sleep -Milliseconds 600
        }
    } while ((Get-Date) -lt $deadline)
    return $null
}

Assert-Administrator

if (-not (Test-Path -LiteralPath $ServerSourceFile)) {
    throw "Required service file is missing: $ServerSourceFile"
}
if (-not (Test-Path -LiteralPath $ExtensionSourceDirectory)) {
    throw "Required extension folder is missing: $ExtensionSourceDirectory"
}

Write-Host ''
Write-Host 'Installing Days Inn Aven shared no-rent storage...' -ForegroundColor Cyan

$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -ne $existingTask) {
    try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue } catch {}
    Start-Sleep -Seconds 1
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
New-Item -ItemType Directory -Force -Path $ServiceInstallDirectory | Out-Null
New-Item -ItemType Directory -Force -Path $ExtensionInstallDirectory | Out-Null
New-Item -ItemType Directory -Force -Path $DataDirectory | Out-Null

Copy-Item -LiteralPath $ServerSourceFile -Destination $ServerInstallFile -Force

Get-ChildItem -LiteralPath $ExtensionInstallDirectory -Force -ErrorAction SilentlyContinue |
    Remove-Item -Recurse -Force
Copy-Item -Path (Join-Path $ExtensionSourceDirectory '*') -Destination $ExtensionInstallDirectory -Recurse -Force

# The service runs as SYSTEM. Users access data only through the loopback service.
& icacls.exe $DataDirectory /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
& icacls.exe $ServiceInstallDirectory /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-32-545:(OI)(CI)RX' | Out-Null
& icacls.exe $ExtensionInstallDirectory /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-32-545:(OI)(CI)RX' | Out-Null

& netsh.exe http delete urlacl url=$Prefix 2>$null | Out-Null
& netsh.exe http add urlacl url=$Prefix user='NT AUTHORITY\SYSTEM' | Out-Null

$powerShellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ServerInstallFile`" -Port $Port"
$action = New-ScheduledTaskAction -Execute $powerShellExe -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RestartCount 5 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -User 'SYSTEM' `
    -RunLevel Highest `
    -Description 'Provides one shared Aven no-rent list for every Windows login on this computer.' | Out-Null

Start-ScheduledTask -TaskName $TaskName
$health = Wait-ForService

Write-Host ''
if ($null -eq $health -or -not $health.ok) {
    Write-Host 'The files were installed, but the shared service did not answer its health test.' -ForegroundColor Red
    Write-Host "Check Task Scheduler task: $TaskName"
    Write-Host "Check log file: $DataDirectory\shared-service.log"
    exit 1
}

Write-Host 'Shared storage installed successfully.' -ForegroundColor Green
Write-Host "Service version: $($health.serviceVersion)"
Write-Host "Current shared guest count: $($health.guestCount)"
Write-Host ''
Write-Host 'Use this SAME extension folder under every Windows login:' -ForegroundColor Yellow
Write-Host $ExtensionInstallDirectory -ForegroundColor White
Write-Host ''
Write-Host 'The shared data file and automatic backups are stored under:'
Write-Host $DataDirectory
