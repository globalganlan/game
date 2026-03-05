<# 
.SYNOPSIS
  FBX → GLB 批次轉換 (呼叫 Blender 背景執行)

.DESCRIPTION
  自動偵測 Blender 安裝路徑，執行 fbx_to_glb.py 腳本。
  將 public/models/zombie_*/  下的 FBX 轉成 Draco 壓縮的 GLB。

.EXAMPLE
  # 轉換全部 zombie
  .\scripts\convert_models.ps1

  # 只轉換 zombie_1
  .\scripts\convert_models.ps1 -Only zombie_1

  # 輸出到另一個資料夾
  .\scripts\convert_models.ps1 -OutputDir "D:\output"

  # 停用 Draco
  .\scripts\convert_models.ps1 -NoDraco

  # 轉換後刪除原始 FBX
  .\scripts\convert_models.ps1 -CleanFbx
#>

param(
    [string]$Only,
    [string]$OutputDir,
    [string]$BlenderPath,
    [switch]$NoDraco,
    [switch]$CleanFbx,
    [string]$MeshFrom = "idle"
)

# ── 自動偵測 Blender ──
function Find-Blender {
    # 1) 使用者指定
    if ($BlenderPath -and (Test-Path $BlenderPath)) { return $BlenderPath }

    # 2) PATH 裡找
    $inPath = Get-Command "blender" -ErrorAction SilentlyContinue
    if ($inPath) { return $inPath.Source }

    # 3) Common install locations
    $searchPaths = @(
        "D:\Blender\blender.exe",
        "D:\Blender\Blender*\blender.exe",
        "D:\Program Files\Blender Foundation\Blender*\blender.exe",
        "C:\Program Files\Blender Foundation\Blender*\blender.exe",
        "C:\Program Files (x86)\Blender Foundation\Blender*\blender.exe",
        "$env:LOCALAPPDATA\Blender Foundation\Blender*\blender.exe",
        "C:\Program Files (x86)\Steam\steamapps\common\Blender\blender.exe"
    )

    foreach ($pattern in $searchPaths) {
        $found = Get-ChildItem $pattern -ErrorAction SilentlyContinue | 
                 Sort-Object FullName -Descending | 
                 Select-Object -First 1
        if ($found) { return $found.FullName }
    }

    return $null
}

$blender = Find-Blender
if (-not $blender) {
    Write-Host ""
    Write-Host "  [ERROR] Blender not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Please do one of the following:"
    Write-Host "    1. Install Blender 3.6+ (https://www.blender.org/download/)"
    Write-Host "    2. Specify path: .\scripts\convert_models.ps1 -BlenderPath 'D:\Blender\blender.exe'"
    Write-Host "    3. Add blender.exe to system PATH"
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "  Blender: $blender" -ForegroundColor Cyan

# ── 組合參數 ──
$scriptPath = Join-Path $PSScriptRoot "fbx_to_glb.py"

if (-not (Test-Path $scriptPath)) {
    Write-Host "  [ERROR] Script not found: $scriptPath" -ForegroundColor Red
    exit 1
}

$extraArgs = @()
if ($Only)      { $extraArgs += "--only";       $extraArgs += $Only }
if ($OutputDir) { $extraArgs += "--output-dir";  $extraArgs += $OutputDir }
if ($NoDraco)   { $extraArgs += "--no-draco" }
if ($CleanFbx)  { $extraArgs += "--clean-fbx" }
if ($MeshFrom)  { $extraArgs += "--mesh-from";   $extraArgs += $MeshFrom }

# ── 執行 Blender ──
Write-Host "  Script:  $scriptPath" -ForegroundColor Cyan
Write-Host ""

$blenderArgs = @("--background", "--python", $scriptPath)
if ($extraArgs.Count -gt 0) {
    $blenderArgs += "--"
    $blenderArgs += $extraArgs
}

Write-Host "  Running: blender $($blenderArgs -join ' ')" -ForegroundColor DarkGray
Write-Host ""

& $blender @blenderArgs

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "  [OK] Conversion done!" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "  [FAIL] Conversion failed (exit code: $LASTEXITCODE)" -ForegroundColor Red
    Write-Host ""
}
