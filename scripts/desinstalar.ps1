# Desinstala AprendePython. Con -BorrarAjustes también elimina tu progreso y tus ajustes (%APPDATA%\AprendePython).
param([switch]$BorrarAjustes)
$ErrorActionPreference = 'Stop'

$dest = Join-Path $env:LOCALAPPDATA 'Programs\AprendePython'

# Si este script se está ejecutando desde la carpeta que vamos a borrar, se relanza desde una copia temporal.
if ($PSCommandPath -and $PSCommandPath.StartsWith($dest, [StringComparison]::OrdinalIgnoreCase)) {
    $tmp = Join-Path $env:TEMP 'aprendepython-desinstalar.ps1'
    Copy-Item $PSCommandPath $tmp -Force
    $extra = if ($BorrarAjustes) { '-BorrarAjustes' } else { '' }
    Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$tmp`" $extra" -Wait
    exit 0
}

Get-Process -Name 'AprendePython' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 600

Remove-Item (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\AprendePython.lnk') -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path ([Environment]::GetFolderPath('Desktop')) 'AprendePython.lnk') -Force -ErrorAction SilentlyContinue
Remove-Item 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\AprendePython' -Recurse -Force -ErrorAction SilentlyContinue
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
if ($BorrarAjustes) { Remove-Item (Join-Path $env:APPDATA 'AprendePython') -Recurse -Force -ErrorAction SilentlyContinue }
Write-Output 'AprendePython desinstalado. (Tu progreso sigue guardado; usa -BorrarAjustes para eliminarlo también.)'
