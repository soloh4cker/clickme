$ErrorActionPreference = 'Stop'
$baseUri = 'http://127.0.0.1:17831/'

try {
    $health = Invoke-RestMethod -Uri "${baseUri}health" -Method Get -TimeoutSec 3
    $list = Invoke-RestMethod -Uri "${baseUri}guests" -Method Get -TimeoutSec 3

    Write-Host 'Shared service is ONLINE.' -ForegroundColor Green
    Write-Host "Service version: $($health.serviceVersion)"
    Write-Host "Shared guest count: $($health.guestCount)"
    Write-Host "Last update: $($list.updatedAt)"
} catch {
    Write-Host 'Shared service is OFFLINE or not installed.' -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}
