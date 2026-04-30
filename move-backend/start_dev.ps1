# 本文件与 main.py 同目录。从这里启动 uvicorn，避免在 scripts 子目录运行导致「Could not import module main」。
$ErrorActionPreference = "Stop"
$backendDir = $PSScriptRoot
if (-not (Test-Path (Join-Path $backendDir "main.py"))) {
    Write-Error "未找到 main.py，请勿移动本脚本；应在 move-backend 目录下运行。"
    exit 1
}
$projectRoot = (Resolve-Path (Join-Path $backendDir "..")).Path
$py = Join-Path $projectRoot "moveV2\Scripts\python.exe"
if (-not (Test-Path $py)) {
    Write-Error "未找到 $py ；请先创建 moveV2 虚拟环境。"
    exit 1
}
Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object {
        Write-Host "Stopping PID $($_.OwningProcess) (port 8001)"
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
Start-Sleep -Seconds 1
Set-Location $backendDir
Write-Host "工作目录: $backendDir"
Write-Host "启动: http://127.0.0.1:8001"
& $py -m uvicorn main:app --host 127.0.0.1 --port 8001 --reload
