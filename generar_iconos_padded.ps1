Add-Type -AssemblyName System.Drawing

function Create-PaddedIcon($sourcePath, $outputPath) {
    if (-not (Test-Path $sourcePath)) {
        Write-Host "Source not found: $sourcePath"
        return
    }

    $srcImg = [System.Drawing.Image]::FromFile($sourcePath)
    $canvasSize = 512
    $bmp = New-Object System.Drawing.Bitmap($canvasSize, $canvasSize)
    $g = [System.Drawing.Graphics]::FromImage($bmp)

    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    # Dark background fill
    $bgColor = [System.Drawing.ColorTranslator]::FromHtml("#090d16")
    $brush = New-Object System.Drawing.SolidBrush($bgColor)
    $g.FillRectangle($brush, 0, 0, $canvasSize, $canvasSize)

    # Scale original image to ~70% (360px centered at offset 76px)
    $targetSize = 360
    $offset = [int]((512 - 360) / 2) # 76
    $g.DrawImage($srcImg, $offset, $offset, $targetSize, $targetSize)

    $srcImg.Dispose()
    $g.Dispose()

    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Padded icon saved to: $outputPath"
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Create-PaddedIcon (Join-Path $scriptDir "icon_chofer.png") (Join-Path $scriptDir "icon_chofer_padded.png")
Create-PaddedIcon (Join-Path $scriptDir "icon_pasajero.png") (Join-Path $scriptDir "icon_pasajero_padded.png")
