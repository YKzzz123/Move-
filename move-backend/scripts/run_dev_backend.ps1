# 开发用：先结束占用 8001 的进程，再启动当前仓库的 FastAPI。
# 注意：uvicorn 必须在 move-backend 目录执行（与 main.py 同目录）。本脚本会自动 cd 过去。默认端口 8001。
# 切勿在 scripts 目录下直接运行「python -m uvicorn main:app」，否则会报 Could not import module "main"。
$ErrorActionPreference = "Stop"
$backendDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not (Test-Path (Join-Path $backendDir "main.py"))) {
    Write-Error "未找到 main.py，路径异常: $backendDir"
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
Write-Host "Starting uvicorn: $backendDir ( http://127.0.0.1:8001 )"
& $py -m uvicorn main:app --host 127.0.0.1 --port 8001 --reload
