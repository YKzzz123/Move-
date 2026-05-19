# 运维：调用后端一键初始化「能量站 · 今日回响」向量知识库（需 uvicorn 已启动且已配置豆包 / PostgreSQL）。
# 用法：在仓库根目录或任意目录执行：
#   powershell -ExecutionPolicy Bypass -File move-backend/scripts/init_energy_station_kb.ps1
# 可选环境变量：MOVE_API_BASE（默认 http://127.0.0.1:8001）
$ErrorActionPreference = "Stop"
$base = if ($env:MOVE_API_BASE) { $env:MOVE_API_BASE.TrimEnd("/") } else { "http://127.0.0.1:8001" }
$uri = "$base/api/energy-station/init-kb"
Write-Host "POST $uri (TimeoutSec 7200, 约 2h；多模态逐条 embedding 可能很慢) ..."
try {
    $resp = Invoke-RestMethod -Method Post -Uri $uri -ContentType "application/json" -Body "{}" -TimeoutSec 7200
    $resp | ConvertTo-Json -Depth 5
    Write-Host "Done."
} catch {
    Write-Error "请求失败: $_"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Host $reader.ReadToEnd()
    }
    exit 1
}
