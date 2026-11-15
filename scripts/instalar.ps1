# Instala AprendePython para tu usuario de Windows (no necesita permisos de administrador):
#   - copia el programa a %LOCALAPPDATA%\Programs\AprendePython
#   - crea accesos directos en el menú Inicio y en el Escritorio
#   - lo registra en «Aplicaciones instaladas» para poder desinstalarlo
# Antes hay que haber empaquetado el programa:  npm run empaquetar
# Hace falta tener Python 3 instalado en el ordenador (AprendePython ejecuta tu código con él).
param([switch]$SinEscritorio)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'dist\AprendePython-win32-x64'
$exeSrc = Join-Path $src 'AprendePython.exe'
if (-not (Test-Path $exeSrc)) { throw "No encuentro $exeSrc. Ejecuta antes:  npm run empaquetar" }

$dest = Join-Path $env:LOCALAPPDATA 'Programs\AprendePython'
$exe = Join-Path $dest 'AprendePython.exe'
$pkg = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json

Write-Output '[1/4] Cerrando AprendePython si estaba abierto...'
Get-Process -Name 'AprendePython' -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($dest, [StringComparison]::OrdinalIgnoreCase) } | Stop-Process -Force
Start-Sleep -Milliseconds 600

Write-Output "[2/4] Copiando el programa a $dest ..."
New-Item -ItemType Directory -Force -Path $dest | Out-Null
robocopy $src $dest /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy falló con el código $LASTEXITCODE" }
Copy-Item (Join-Path $PSScriptRoot 'desinstalar.ps1') (Join-Path $dest 'desinstalar.ps1') -Force

Write-Output '[3/4] Creando accesos directos...'
$ws = New-Object -ComObject WScript.Shell
function New-Shortcut([string]$path) {
    $s = $ws.CreateShortcut($path)
    $s.TargetPath = $exe
    $s.WorkingDirectory = $dest
    $s.IconLocation = "$exe,0"
    $s.Description = 'AprendePython - aprende Python practicando'
    $s.Save()
}
$start = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\AprendePython.lnk'
New-Shortcut $start
$links = @($start)
if (-not $SinEscritorio) {
    $desk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'AprendePython.lnk'
    New-Shortcut $desk
    $links += $desk
}

Write-Output '[4/4] Registrando en Aplicaciones instaladas...'
$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\AprendePython'
New-Item -Path $key -Force | Out-Null
$size = [int]((Get-ChildItem $dest -Recurse -File | Measure-Object Length -Sum).Sum / 1KB)
Set-ItemProperty $key DisplayName 'AprendePython'
Set-ItemProperty $key DisplayVersion $pkg.version
Set-ItemProperty $key Publisher 'AprendePython'
Set-ItemProperty $key InstallLocation $dest
Set-ItemProperty $key DisplayIcon $exe
Set-ItemProperty $key UninstallString ('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $dest 'desinstalar.ps1') + '"')
Set-ItemProperty $key NoModify 1 -Type DWord
Set-ItemProperty $key NoRepair 1 -Type DWord
Set-ItemProperty $key EstimatedSize $size -Type DWord

Write-Output ''
Write-Output "AprendePython instalado en: $dest"
$links | ForEach-Object { Write-Output ("Acceso directo: " + $_) }
