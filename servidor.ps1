param(
    [int]$Port = 8080
)

$path = $PSScriptRoot
$ip = [System.Net.IPAddress]::Any
$listener = New-Object System.Net.Sockets.TcpListener($ip, $Port)

# Memoria compartida de eventos en tiempo real (PC <-> Celular)
$global:syncEvents = [System.Collections.ArrayList]::new()
$global:activeTrip = $null

# Obtener IP local de la red Wi-Fi / Ethernet
$localIp = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi*","Ethernet*" -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1).IPAddress
if (-not $localIp) {
    $localIp = "127.0.0.1"
}

try {
    $listener.Start()
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "  RutaPrivada - Servidor Multi-Dispositivo (PC & Celular) Activo" -ForegroundColor Green
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "  -> En tu PC:       http://localhost:$Port" -ForegroundColor Yellow
    Write-Host "  -> En tu Celular:  http://${localIp}:$Port/conductor.html" -ForegroundColor Cyan
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "Presiona Ctrl + C en esta ventana para detener el servidor." -ForegroundColor Gray
    Write-Host ""
    
    Start-Process "http://localhost:$Port"

    while ($true) {
        $client = $listener.AcceptTcpClient()
        $stream = $client.GetStream()
        $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
        
        $requestLine = $reader.ReadLine()
        if ([string]::IsNullOrWhiteSpace($requestLine)) {
            $client.Close()
            continue
        }

        $parts = $requestLine.Split(" ")
        if ($parts.Length -lt 2) {
            $client.Close()
            continue
        }

        $httpMethod = $parts[0].ToUpper()
        $fullUrl = $parts[1]
        $rawPath = $fullUrl.Split("?")[0].TrimStart('/')
        
        # Parse query string
        $queryString = ""
        if ($fullUrl.Contains("?")) {
            $queryString = $fullUrl.Substring($fullUrl.IndexOf("?") + 1)
        }

        # Read headers to get Content-Length
        $contentLength = 0
        while ($true) {
            $line = $reader.ReadLine()
            if ([string]::IsNullOrEmpty($line)) { break }
            if ($line.ToLower().StartsWith("content-length:")) {
                $contentLength = [int]$line.Substring(15).Trim()
            }
        }

        # Read body if POST
        $body = ""
        if ($contentLength -gt 0) {
            $charBuffer = New-Object char[] $contentLength
            $readCount = $reader.ReadBlock($charBuffer, 0, $contentLength)
            $body = New-Object string ($charBuffer, 0, $readCount)
        }

        # ==========================================
        # API ENDPOINTS DE SINCRONIZACIÓN EN TIEMPO REAL
        # ==========================================
        if ($rawPath.StartsWith("api/sync/emit")) {
            if (-not [string]::IsNullOrEmpty($body)) {
                try {
                    $eventObj = ConvertFrom-Json $body
                    if ($null -ne $eventObj) {
                        [void]$global:syncEvents.Add($body)
                        if ($global:syncEvents.Count -gt 200) {
                            $global:syncEvents.RemoveRange(0, 50)
                        }
                    }
                } catch {}
            }
            $respBytes = [System.Text.Encoding]::UTF8.GetBytes('{"status":"ok"}')
            $header = "HTTP/1.1 200 OK`r`nContent-Type: application/json; charset=utf-8`r`nContent-Length: $($respBytes.Length)`r`nAccess-Control-Allow-Origin: *`r`nAccess-Control-Allow-Methods: GET, POST, OPTIONS`r`nAccess-Control-Allow-Headers: *`r`nConnection: close`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            $stream.Write($respBytes, 0, $respBytes.Length)
        }
        elseif ($rawPath.StartsWith("api/sync/events")) {
            # Extraer parámetro 'since'
            $since = 0
            if ($queryString -match "since=(\d+)") {
                $since = [long]$matches[1]
            }

            $matchedEvents = @()
            foreach ($evJson in $global:syncEvents) {
                try {
                    $ev = ConvertFrom-Json $evJson
                    if ($ev.timestamp -gt $since) {
                        $matchedEvents += $ev
                    }
                } catch {}
            }

            $jsonResp = ConvertTo-Json -InputObject $matchedEvents -Compress
            if (-not $jsonResp) { $jsonResp = "[]" }
            $respBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResp)
            $header = "HTTP/1.1 200 OK`r`nContent-Type: application/json; charset=utf-8`r`nContent-Length: $($respBytes.Length)`r`nAccess-Control-Allow-Origin: *`r`nAccess-Control-Allow-Methods: GET, POST, OPTIONS`r`nAccess-Control-Allow-Headers: *`r`nConnection: close`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            $stream.Write($respBytes, 0, $respBytes.Length)
        }
        elseif ($httpMethod -eq "OPTIONS") {
            $header = "HTTP/1.1 200 OK`r`nAccess-Control-Allow-Origin: *`r`nAccess-Control-Allow-Methods: GET, POST, OPTIONS`r`nAccess-Control-Allow-Headers: *`r`nContent-Length: 0`r`nConnection: close`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
        }
        else {
            # ==========================================
            # SERVIR ARCHIVOS ESTÁTICOS
            # ==========================================
            if ([string]::IsNullOrEmpty($rawPath)) {
                $rawPath = "index.html"
            }

            $filePath = Join-Path $path $rawPath

            if (Test-Path $filePath -PathType Leaf) {
                $extension = [System.IO.Path]::GetExtension($filePath).ToLower()
                $mime = switch ($extension) {
                    ".html" { "text/html; charset=utf-8" }
                    ".css"  { "text/css; charset=utf-8" }
                    ".js"   { "application/javascript; charset=utf-8" }
                    ".json" { "application/json; charset=utf-8" }
                    ".svg"  { "image/svg+xml" }
                    ".png"  { "image/png" }
                    ".jpg"  { "image/jpeg" }
                    ".xml"  { "application/xml; charset=utf-8" }
                    ".txt"  { "text/plain; charset=utf-8" }
                    Default { "application/octet-stream" }
                }

                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $header = "HTTP/1.1 200 OK`r`nContent-Type: $mime`r`nContent-Length: $($bytes.Length)`r`nAccess-Control-Allow-Origin: *`r`nCache-Control: no-store, no-cache, must-revalidate`r`nPragma: no-cache`r`nConnection: close`r`n`r`n"
                $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
                
                $stream.Write($headerBytes, 0, $headerBytes.Length)
                $stream.Write($bytes, 0, $bytes.Length)
            } else {
                $notFound = [System.Text.Encoding]::UTF8.GetBytes("404 - Archivo no encontrado")
                $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($notFound.Length)`r`nAccess-Control-Allow-Origin: *`r`nConnection: close`r`n`r`n"
                $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
                
                $stream.Write($headerBytes, 0, $headerBytes.Length)
                $stream.Write($notFound, 0, $notFound.Length)
            }
        }

        $stream.Flush()
        $client.Close()
    }
} catch {
    Write-Host "Error en el servidor: $_" -ForegroundColor Red
} finally {
    $listener.Stop()
}
