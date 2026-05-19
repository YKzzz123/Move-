# 启动能量站用的本地 Postgres（pgvector）。国内默认使用 DaoCloud 加速镜像，规避部分 mirror 对 docker.io 的 403。
# 用法（在仓库任意目录）：
#   powershell -ExecutionPolicy Bypass -File move-backend/scripts/start_pgvector_docker.ps1
# 直连 Docker Hub（境外或已关闭有问题的 mirror）：
#   $env:MOVE_PGVECTOR_IMAGE = "pgvector/pgvector:pg16"
#   powershell -ExecutionPolicy Bypass -File move-backend/scripts/start_pgvector_docker.ps1
$ErrorActionPreference = "Stop"
$backendDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$compose = Join-Path $backendDir "docker-compose.pgvector.yml"
if (-not (Test-Path $compose)) {
    Write-Error "未找到 docker-compose.pgvector.yml: $compose"
    exit 1
}
if (-not $env:MOVE_PGVECTOR_IMAGE) {
    $env:MOVE_PGVECTOR_IMAGE = "m.daocloud.io/docker.io/pgvector/pgvector:pg16"
}
Write-Host "Using image: $env:MOVE_PGVECTOR_IMAGE"
Set-Location $backendDir
docker compose -f $compose up -d
Write-Host "Done. Postgres: 127.0.0.1:5432  db=move_energy  user=postgres"
