# Genera build\icon.png, build\icon.ico y src\renderer\icono.png dibujando el símbolo de AprendePython
# (el «>>>» del intérprete de Python con un cursor parpadeando).
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'build'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-IconBitmap([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.PixelOffsetMode = 'HighQuality'
    $g.Clear([System.Drawing.Color]::Transparent)
    $k = $size / 256.0

    function P([double]$x, [double]$y) { [System.Drawing.PointF]::new([single]($x * $k), [single]($y * $k)) }
    function Rounded($x, $y, $w, $h, $r) {
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $d = $r * 2 * $k
        $path.AddArc($x * $k, $y * $k, $d, $d, 180, 90)
        $path.AddArc(($x + $w) * $k - $d, $y * $k, $d, $d, 270, 90)
        $path.AddArc(($x + $w) * $k - $d, ($y + $h) * $k - $d, $d, $d, 0, 90)
        $path.AddArc($x * $k, ($y + $h) * $k - $d, $d, $d, 90, 90)
        $path.CloseFigure()
        return $path
    }

    # fondo
    $bg = Rounded 6 6 244 244 52
    $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#0d1117'))), $bg)
    $g.DrawPath([System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#30363d'), [single](5 * $k)), $bg)

    $colores = @('#58a6ff', '#f2cc60', '#3fb950')
    $w = [single]([Math]::Max(2.0, 20 * $k))
    $x = 34
    foreach ($c in $colores) {
        $pen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml($c), $w)
        $pen.StartCap = 'Round'; $pen.EndCap = 'Round'; $pen.LineJoin = 'Round'
        $g.DrawLines($pen, [System.Drawing.PointF[]]@((P $x 88), (P ($x + 40) 128), (P $x 168)))
        $x += 48
    }
    # cursor
    $cur = Rounded 186 160 34 14 5
    $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#f0f6fc'))), $cur)

    $g.Dispose()
    return $bmp
}

function Get-PngBytes($bmp) {
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    return , $ms.ToArray()
}

$sizes = 16, 24, 32, 48, 64, 128, 256
$images = @{}
foreach ($s in $sizes) {
    $b = New-IconBitmap $s
    $images[$s] = Get-PngBytes $b
    if ($s -eq 256) {
        [System.IO.File]::WriteAllBytes((Join-Path $outDir 'icon.png'), $images[$s])
        [System.IO.File]::WriteAllBytes((Join-Path $root 'src\renderer\icono.png'), $images[$s])
    }
    $b.Dispose()
}

# .ico con imágenes PNG dentro
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $ms
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
foreach ($s in $sizes) {
    $bytes = $images[$s]
    $dim = if ($s -ge 256) { 0 } else { $s }
    $bw.Write([byte]$dim); $bw.Write([byte]$dim); $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([UInt16]1); $bw.Write([UInt16]32)
    $bw.Write([UInt32]$bytes.Length); $bw.Write([UInt32]$offset)
    $offset += $bytes.Length
}
foreach ($s in $sizes) { $bw.Write($images[$s]) }
$bw.Flush()
[System.IO.File]::WriteAllBytes((Join-Path $outDir 'icon.ico'), $ms.ToArray())
Write-Output ("Icono creado en " + $outDir)
