param(
    [int]$Port = 17831
)

$ErrorActionPreference = 'Stop'
$ServiceVersion = '2.0.0'
$BaseDirectory = Join-Path $env:ProgramData 'DaysInn\AvenNoRentAlert'
$DataDirectory = Join-Path $BaseDirectory 'Data'
$BackupDirectory = Join-Path $DataDirectory 'Backups'
$DataFile = Join-Path $DataDirectory 'no-rent-list.json'
$LogFile = Join-Path $DataDirectory 'shared-service.log'
$Prefix = "http://127.0.0.1:$Port/"

function Write-Log {
    param([string]$Message)
    try {
        $line = "{0} {1}" -f (Get-Date).ToString('s'), $Message
        Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
    } catch {
        # Logging must never stop the service.
    }
}

function Ensure-Directories {
    New-Item -ItemType Directory -Force -Path $DataDirectory | Out-Null
    New-Item -ItemType Directory -Force -Path $BackupDirectory | Out-Null
}

function New-EmptyState {
    [ordered]@{
        version = 1
        updatedAt = (Get-Date).ToUniversalTime().ToString('o')
        guests = @()
    }
}

function Convert-ToArray {
    param($Value)
    if ($null -eq $Value) { return @() }
    return @($Value)
}

function Read-StateUnlocked {
    if (-not (Test-Path -LiteralPath $DataFile)) {
        return New-EmptyState
    }

    try {
        $raw = [System.IO.File]::ReadAllText($DataFile, [System.Text.Encoding]::UTF8)
        if ([string]::IsNullOrWhiteSpace($raw)) {
            return New-EmptyState
        }
        $state = $raw | ConvertFrom-Json
        if ($null -eq $state.guests) {
            $state | Add-Member -NotePropertyName guests -NotePropertyValue @() -Force
        }
        return $state
    } catch {
        Write-Log "Data file read failed: $($_.Exception.Message)"
        throw
    }
}

function Write-StateUnlocked {
    param($State)

    $State.updatedAt = (Get-Date).ToUniversalTime().ToString('o')
    $json = $State | ConvertTo-Json -Depth 12
    $tempFile = "$DataFile.tmp"
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)

    if (Test-Path -LiteralPath $DataFile) {
        try {
            $stamp = (Get-Date).ToString('yyyyMMdd-HHmmss-fff')
            Copy-Item -LiteralPath $DataFile -Destination (Join-Path $BackupDirectory "no-rent-list-$stamp.json") -Force
            Get-ChildItem -LiteralPath $BackupDirectory -Filter 'no-rent-list-*.json' -File |
                Sort-Object LastWriteTime -Descending |
                Select-Object -Skip 50 |
                Remove-Item -Force -ErrorAction SilentlyContinue
        } catch {
            Write-Log "Backup warning: $($_.Exception.Message)"
        }
    }

    [System.IO.File]::WriteAllText($tempFile, $json, $utf8NoBom)
    Move-Item -LiteralPath $tempFile -Destination $DataFile -Force
}

function Use-DataLock {
    param([scriptblock]$Action)

    $createdNew = $false
    $mutex = New-Object System.Threading.Mutex($false, 'Global\DaysInnAvenNoRentDataMutex', [ref]$createdNew)
    $locked = $false
    try {
        $locked = $mutex.WaitOne([TimeSpan]::FromSeconds(10))
        if (-not $locked) {
            throw 'The shared no-rent list is temporarily busy. Please try again.'
        }
        & $Action
    } finally {
        if ($locked) {
            try { $mutex.ReleaseMutex() | Out-Null } catch {}
        }
        $mutex.Dispose()
    }
}

function Get-RequestBody {
    param([System.Net.HttpListenerRequest]$Request)

    $reader = New-Object System.IO.StreamReader($Request.InputStream, $Request.ContentEncoding)
    try {
        $text = $reader.ReadToEnd()
    } finally {
        $reader.Dispose()
    }

    if ([string]::IsNullOrWhiteSpace($text)) { return $null }
    return $text | ConvertFrom-Json
}

function Limit-Text {
    param($Value, [int]$MaximumLength)
    $text = ([string]$Value).Trim()
    if ($text.Length -gt $MaximumLength) {
        $text = $text.Substring(0, $MaximumLength)
    }
    return $text
}

function New-CleanGuest {
    param($InputGuest, $ExistingGuest)

    if ($null -eq $InputGuest) { throw 'Guest information is required.' }

    $firstName = Limit-Text $InputGuest.firstName 80
    $lastName = Limit-Text $InputGuest.lastName 80
    if ([string]::IsNullOrWhiteSpace($firstName) -or [string]::IsNullOrWhiteSpace($lastName)) {
        throw 'First name and last name are required.'
    }

    $now = (Get-Date).ToUniversalTime().ToString('o')
    $id = $null
    $createdAt = $now

    if ($null -ne $ExistingGuest) {
        $id = Limit-Text $ExistingGuest.id 100
        $createdAt = Limit-Text $ExistingGuest.createdAt 60
    }
    if ([string]::IsNullOrWhiteSpace($id)) {
        $id = [Guid]::NewGuid().ToString()
    }
    if ([string]::IsNullOrWhiteSpace($createdAt)) {
        $createdAt = $now
    }

    return [ordered]@{
        id = $id
        firstName = $firstName
        lastName = $lastName
        reason = Limit-Text $InputGuest.reason 500
        confirmationNumber = Limit-Text $InputGuest.confirmationNumber 100
        createdAt = $createdAt
        updatedAt = $now
    }
}

function Set-CorsHeaders {
    param([System.Net.HttpListenerContext]$Context)

    $origin = [string]$Context.Request.Headers['Origin']
    if (-not [string]::IsNullOrWhiteSpace($origin)) {
        if ($origin -notmatch '^chrome-extension://[a-p]{32}$') {
            return $false
        }
        $Context.Response.Headers['Access-Control-Allow-Origin'] = $origin
        $Context.Response.Headers['Vary'] = 'Origin'
    }

    $Context.Response.Headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    $Context.Response.Headers['Access-Control-Allow-Headers'] = 'Content-Type, X-Aven-NoRent-Client'
    $Context.Response.Headers['Cache-Control'] = 'no-store'
    return $true
}

function Send-Json {
    param(
        [System.Net.HttpListenerContext]$Context,
        [int]$StatusCode,
        $Body
    )

    $json = $Body | ConvertTo-Json -Depth 12 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $Context.Response.StatusCode = $StatusCode
    $Context.Response.ContentType = 'application/json; charset=utf-8'
    $Context.Response.ContentEncoding = [System.Text.Encoding]::UTF8
    $Context.Response.ContentLength64 = $bytes.Length
    try {
        $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } finally {
        $Context.Response.OutputStream.Close()
        $Context.Response.Close()
    }
}

function Send-Error {
    param(
        [System.Net.HttpListenerContext]$Context,
        [int]$StatusCode,
        [string]$Message
    )
    Send-Json $Context $StatusCode ([ordered]@{ ok = $false; error = $Message })
}

function Get-GuestIdFromPath {
    param([string]$Path)
    if ($Path -match '^/guests/([^/]+)$') {
        return [Uri]::UnescapeDataString($Matches[1])
    }
    return $null
}

Ensure-Directories

if (-not (Test-Path -LiteralPath $DataFile)) {
    Use-DataLock {
        if (-not (Test-Path -LiteralPath $DataFile)) {
            Write-StateUnlocked (New-EmptyState)
        }
    }
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($Prefix)
$listener.Start()
Write-Log "Shared service $ServiceVersion started on $Prefix"

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()

        try {
            if (-not (Set-CorsHeaders $context)) {
                Send-Error $context 403 'This local service accepts requests only from a Chrome extension.'
                continue
            }

            if ($context.Request.HttpMethod -eq 'OPTIONS') {
                $context.Response.StatusCode = 204
                $context.Response.Close()
                continue
            }

            $method = $context.Request.HttpMethod.ToUpperInvariant()
            $path = $context.Request.Url.AbsolutePath.TrimEnd('/')
            if ([string]::IsNullOrWhiteSpace($path)) { $path = '/' }

            if ($method -eq 'GET' -and $path -eq '/health') {
                $state = $null
                Use-DataLock { $script:state = Read-StateUnlocked }
                Send-Json $context 200 ([ordered]@{
                    ok = $true
                    serviceVersion = $ServiceVersion
                    guestCount = (Convert-ToArray $state.guests).Count
                    updatedAt = [string]$state.updatedAt
                })
                continue
            }

            if ($method -eq 'GET' -and $path -eq '/guests') {
                $state = $null
                Use-DataLock { $script:state = Read-StateUnlocked }
                Send-Json $context 200 ([ordered]@{
                    ok = $true
                    serviceVersion = $ServiceVersion
                    updatedAt = [string]$state.updatedAt
                    guests = Convert-ToArray $state.guests
                })
                continue
            }

            if ($method -eq 'POST' -and $path -eq '/guests') {
                $body = Get-RequestBody $context.Request
                $created = $null
                Use-DataLock {
                    $state = Read-StateUnlocked
                    $created = New-CleanGuest $body $null
                    $state.guests = @((Convert-ToArray $state.guests) + $created)
                    Write-StateUnlocked $state
                    $script:created = $created
                }
                Send-Json $context 201 ([ordered]@{ ok = $true; guest = $created })
                continue
            }

            $guestId = Get-GuestIdFromPath $path

            if ($method -eq 'PUT' -and $null -ne $guestId) {
                $body = Get-RequestBody $context.Request
                $updated = $null
                $found = $false
                Use-DataLock {
                    $state = Read-StateUnlocked
                    $newGuests = @()
                    foreach ($guest in (Convert-ToArray $state.guests)) {
                        if ([string]$guest.id -eq $guestId) {
                            $updated = New-CleanGuest $body $guest
                            $newGuests += $updated
                            $found = $true
                        } else {
                            $newGuests += $guest
                        }
                    }
                    if ($found) {
                        $state.guests = $newGuests
                        Write-StateUnlocked $state
                    }
                    $script:updated = $updated
                    $script:found = $found
                }
                if (-not $found) {
                    Send-Error $context 404 'Guest entry was not found.'
                } else {
                    Send-Json $context 200 ([ordered]@{ ok = $true; guest = $updated })
                }
                continue
            }

            if ($method -eq 'DELETE' -and $null -ne $guestId) {
                $found = $false
                Use-DataLock {
                    $state = Read-StateUnlocked
                    $remaining = @()
                    foreach ($guest in (Convert-ToArray $state.guests)) {
                        if ([string]$guest.id -eq $guestId) {
                            $found = $true
                        } else {
                            $remaining += $guest
                        }
                    }
                    if ($found) {
                        $state.guests = $remaining
                        Write-StateUnlocked $state
                    }
                    $script:found = $found
                }
                if (-not $found) {
                    Send-Error $context 404 'Guest entry was not found.'
                } else {
                    Send-Json $context 200 ([ordered]@{ ok = $true })
                }
                continue
            }

            if ($method -eq 'POST' -and $path -eq '/replace') {
                $body = Get-RequestBody $context.Request
                $sourceGuests = @()
                if ($null -ne $body -and $null -ne $body.guests) {
                    $sourceGuests = Convert-ToArray $body.guests
                } elseif ($body -is [System.Array]) {
                    $sourceGuests = Convert-ToArray $body
                } else {
                    throw 'A guests array is required.'
                }

                $cleanedGuests = @()
                foreach ($guest in $sourceGuests) {
                    $existing = $null
                    if (-not [string]::IsNullOrWhiteSpace([string]$guest.id)) {
                        $existing = $guest
                    }
                    $cleanedGuests += New-CleanGuest $guest $existing
                }

                Use-DataLock {
                    $state = New-EmptyState
                    $state.guests = $cleanedGuests
                    Write-StateUnlocked $state
                }

                Send-Json $context 200 ([ordered]@{
                    ok = $true
                    guestCount = $cleanedGuests.Count
                })
                continue
            }

            Send-Error $context 404 'Unknown shared-service endpoint.'
        } catch {
            Write-Log "Request failed: $($_.Exception.Message)"
            try {
                Send-Error $context 500 $_.Exception.Message
            } catch {
                try { $context.Response.Abort() } catch {}
            }
        }
    }
} finally {
    try { $listener.Stop() } catch {}
    try { $listener.Close() } catch {}
    Write-Log 'Shared service stopped.'
}
