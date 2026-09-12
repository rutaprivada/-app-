$port = 8080
$path = $PSScriptRoot

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Prefixes.Add("http://127.0.0.1:$port/")

try {
    $listener.Start()
    Write-Host "====================================================" -ForegroundColor Cyan
    Write-Host "  RutaPrivada - Servidor Local PWA Activo" -ForegroundColor Green
    Write-Host "====================================================" -ForegroundColor Cyan
    Write-Host "Abriendo en tu navegador: http://localhost:$port" -ForegroundColor Yellow
    Write-Host "Presiona Ctrl + C en esta ventana para detener el servidor." -ForegroundColor Gray
    Write-Host ""
    
    Start-Process "http://localhost:$port"

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $urlPath = $request.Url.LocalPath.TrimStart('/')
        if ([string]::IsNullOrEmpty($urlPath)) {
            $urlPath = "index.html"
        }

        $filePath = Join-Path $path $urlPath

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
            $response.ContentType = $mime
            $response.ContentLength64 = $bytes.Length
            $response.AddHeader("Access-Control-Allow-Origin", "*")
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $notFound = [System.Text.Encoding]::UTF8.GetBytes("404 - Archivo no encontrado")
            $response.OutputStream.Write($notFound, 0, $notFound.Length)
        }
        $response.Close()
    }
} catch {
    Write-Host "Error en el servidor: $_" -ForegroundColor Red
} finally {
    $listener.Stop()
}
