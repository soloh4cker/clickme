param([int]$Port = 17831)

$ErrorActionPreference = 'Stop'
$ServiceVersion = '2.0.0'
$BaseDirectory = Join-Path $env:ProgramData 'DaysInn\AvenNoRentAlert'
$DataDirectory = Join-Path $BaseDirectory 'Data'
$BackupDirectory = Join-Path $DataDirectory 'Backups'
$DataFile = Join-Path $DataDirectory 'no-rent-list.json'
$LogFile = Join-Path $DataDirectory 'shared-service.log'
$Prefix = "http://127.0.0.1:$Port/"

function Write-Log([string]$Message) {
    try {
        Add-Content -LiteralPath $LogFile -Encoding UTF8 -Value ("{0} {1}" -f (Get-Date).ToString('s'), $Message)
    } catch {}
}

function New-EmptyState {
    [ordered]@{
        version = 1
        updatedAt = (Get-Date).ToUniversalTime().ToString('o')
        guests = @()
    }
}

function As-Array($Value) {
    if ($null -eq $Value) { return @() }
    return @($Value)
}

function Read-StateUnlocked {
    if (-not (Test-Path -LiteralPath $DataFile)) { return New-EmptyState }
    $raw = [System.IO.File]::ReadAllText($DataFile, [System.Text.Encoding]::UTF8)
    if ([string]::IsNullOrWhiteSpace($raw)) { return New-EmptyState }
    $state = $raw | ConvertFrom-Json
    if ($null -eq $state.guests) {
        $state | Add-Member -NotePropertyName guests -NotePropertyValue @() -Force
    }
    return $state
}

function Write-StateUnlocked($State) {
    $State.updatedAt = (Get-Date).ToUniversalTime().ToString('o')
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

    $json = $State | ConvertTo-Json -Depth 12
    [System.IO.File]::WriteAllText($tempFile, $json, $utf8NoBom)
    Move-Item -LiteralPath $tempFile -Destination $DataFile -Force
}

function Invoke-WithDataLock([scriptblock]$Action) {
    $createdNew = $false
    $mutex = New-Object System.Threading.Mutex($false, 'Global\DaysInnAvenNoRentDataMutex', [ref]$createdNew)
    $locked = $false
    try {
        $locked = $mutex.WaitOne([TimeSpan]::FromSeconds(10))
        if (-not $locked) { throw 'The shared no-rent list is temporarily busy. Please try again.' }
        return (& $Action)
    } finally {
        if ($locked) { try { $mutex.ReleaseMutex() | Out-Null } catch {} }
        $mutex.Dispose()
    }
}

function Read-RequestBody([System.Net.HttpListenerRequest]$Request) {
    $reader = New-Object System.IO.StreamReader($Request.InputStream, $Request.ContentEncoding)
    try { $text = $reader.ReadToEnd() } finally { $reader.Dispose() }
    if ([string]::IsNullOrWhiteSpace($text)) { return $null }
    return ($text | ConvertFrom-Json)
}

function Limit-Text($Value, [int]$MaximumLength) {
    $text = ([string]$Value).Trim()
    if ($text.Length -gt $MaximumLength) { return $text.Substring(0, $MaximumLength) }
    return $text
}

function Convert-ToCleanGuest($InputGuest, $ExistingGuest) {
    if ($null -eq $InputGuest) { throw 'Guest information is required.' }

    $firstName = Limit-Text $InputGuest.firstName 80
    $lastName = Limit-Text $InputGuest.lastName 80
    if ([string]::IsNullOrWhiteSpace($firstName) -or [string]::IsNullOrWhiteSpace($lastName)) {
        throw 'First name and last name are required.'
    }

    $now = (Get-Date).ToUniversalTime().ToString('o')
    $id = ''
    $createdAt = $now
    if ($null -ne $ExistingGuest) {
        $id = Limit-Text $ExistingGuest.id 100
        $createdAt = Limit-Text $ExistingGuest.createdAt 60
    }
    if ([string]::IsNullOrWhiteSpace($id)) { $id = [Guid]::NewGuid().ToString() }
    if ([string]::IsNullOrWhiteSpace($createdAt)) { $createdAt = $now }

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

function Set-CorsHeaders([System.Net.HttpListenerContext]$Context) {
    $origin = [string]$Context.Request.Headers['Origin']
    if (-not [string]::IsNullOrWhiteSpace($origin)) {
        if ($origin -notmatch '^chrome-extension://[a-p]{32}$') { return $false }
        $Context.Response.Headers['Access-Control-Allow-Origin'] = $origin
        $Context.Response.Headers['Vary'] = 'Origin'
    }
    $Context.Response.Headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    $Context.Response.Headers['Access-Control-Allow-Headers'] = 'Content-Type, X-Aven-NoRent-Client'
    $Context.Response.Headers['Cache-Control'] = 'no-store'
    return $true
}

function Send-Json([System.Net.HttpListenerContext]$Context, [int]$StatusCode, $Body) {
    $json = $Body | ConvertTo-Json -Depth 12 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $Context.Response.StatusCode = $StatusCode
    $Context.Response.ContentType = 'application/json; charset=utf-8'
    $Context.Response.ContentEncoding = [System.Text.Encoding]::UTF8
    $Context.Response.ContentLength64 = $bytes.Length
    try { $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length) }
    finally {
        $Context.Response.OutputStream.Close()
        $Context.Response.Close()
    }
}

function Send-Error([System.Net.HttpListenerContext]$Context, [int]$StatusCode, [string]$Message) {
    Send-Json $Context $StatusCode ([ordered]@{ ok = $false; error = $Message })
}

function Get-GuestId([string]$Path) {
    if ($Path -match '^/guests/([^/]+)$') { return [Uri]::UnescapeDataString($Matches[1]) }
    return $null
}

New-Item -ItemType Directory -Force -Path $DataDirectory | Out-Null
New-Item -ItemType Directory -Force -Path $BackupDirectory | Out-Null

if (-not (Test-Path -LiteralPath $DataFile)) {
    Invoke-WithDataLock {
        if (-not (Test-Path -LiteralPath $DataFile)) { Write-StateUnlocked (New-EmptyState) }
    } | Out-Null
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
                $state = Invoke-WithDataLock { Read-StateUnlocked }
                Send-Json $context 200 ([ordered]@{
                    ok = $true
                    serviceVersion = $ServiceVersion
                    guestCount = (As-Array $state.guests).Count
                    updatedAt = [string]$state.updatedAt
                })
                continue
            }

            if ($method -eq 'GET' -and $path -eq '/guests') {
                $state = Invoke-WithDataLock { Read-StateUnlocked }
                Send-Json $context 200 ([ordered]@{
                    ok = $true
                    serviceVersion = $ServiceVersion
                    updatedAt = [string]$state.updatedAt
                    guests = @(As-Array $state.guests)
                })
                continue
            }

            if ($method -eq 'POST' -and $path -eq '/guests') {
                $body = Read-RequestBody $context.Request
                $created = Invoke-WithDataLock {
                    $state = Read-StateUnlocked
                    $newGuest = Convert-ToCleanGuest $body $null
                    $state.guests = @((As-Array $state.guests) + $newGuest)
                    Write-StateUnlocked $state
                    return $newGuest
                }
                Send-Json $context 201 ([ordered]@{ ok = $true; guest = $created })
                continue
            }

            $guestId = Get-GuestId $path

            if ($method -eq 'PUT' -and $null -ne $guestId) {
                $body = Read-RequestBody $context.Request
                $result = Invoke-WithDataLock {
                    $state = Read-StateUnlocked
                    $found = $false
                    $updatedGuest = $null
                    $newGuests = @()
                    foreach ($guest in (As-Array $state.guests)) {
                        if ([string]$guest.id -eq $guestId) {
                            $updatedGuest = Convert-ToCleanGuest $body $guest
                            $newGuests += $updatedGuest
                            $found = $true
                        } else {
                            $newGuests += $guest
                        }
                    }
                    if ($found) {
                        $state.guests = $newGuests
                        Write-StateUnlocked $state
                    }
                    return [pscustomobject]@{ found = $found; guest = $updatedGuest }
                }
                if (-not $result.found) { Send-Error $context 404 'Guest entry was not found.' }
                else { Send-Json $context 200 ([ordered]@{ ok = $true; guest = $result.guest }) }
                continue
            }

            if ($method -eq 'DELETE' -and $null -ne $guestId) {
                $result = Invoke-WithDataLock {
                    $state = Read-StateUnlocked
                    $found = $false
                    $remaining = @()
                    foreach ($guest in (As-Array $state.guests)) {
                        if ([string]$guest.id -eq $guestId) { $found = $true }
                        else { $remaining += $guest }
                    }
                    if ($found) {
                        $state.guests = $remaining
                        Write-StateUnlocked $state
                    }
                    return [pscustomobject]@{ found = $found }
                }
                if (-not $result.found) { Send-Error $context 404 'Guest entry was not found.' }
                else { Send-Json $context 200 ([ordered]@{ ok = $true }) }
                continue
            }

            if ($method -eq 'POST' -and $path -eq '/replace') {
                $body = Read-RequestBody $context.Request
                if ($null -ne $body -and $null -ne $body.guests) { $sourceGuests = @(As-Array $body.guests) }
                elseif ($body -is [System.Array]) { $sourceGuests = @(As-Array $body) }
                else { throw 'A guests array is required.' }

                $cleaned = @()
                foreach ($guest in $sourceGuests) {
                    $existing = $null
                    if (-not [string]::IsNullOrWhiteSpace([string]$guest.id)) { $existing = $guest }
                    $cleaned += Convert-ToCleanGuest $guest $existing
                }

                Invoke-WithDataLock {
                    $state = New-EmptyState
                    $state.guests = $cleaned
                    Write-StateUnlocked $state
                } | Out-Null

                Send-Json $context 200 ([ordered]@{ ok = $true; guestCount = $cleaned.Count })
                continue
            }

            Send-Error $context 404 'Unknown shared-service endpoint.'
        } catch {
            Write-Log "Request failed: $($_.Exception.Message)"
            try { Send-Error $context 500 $_.Exception.Message }
            catch { try { $context.Response.Abort() } catch {} }
        }
    }
} finally {
    try { $listener.Stop() } catch {}
    try { $listener.Close() } catch {}
    Write-Log 'Shared service stopped.'
}
