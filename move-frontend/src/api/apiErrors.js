/**
 * FastAPI 错误体里的 detail 可能是 string | {msg}[] | object
 * @param {unknown} detail
 * @returns {string}
 */
export function formatFastApiDetail(detail) {
  if (detail == null) return ''
  if (typeof detail === 'string') return detail.trim()
  if (Array.isArray(detail)) {
    const parts = detail
      .map((x) => {
        if (x == null) return ''
        if (typeof x === 'string') return x
        if (typeof x === 'object' && 'msg' in x && typeof x.msg === 'string') return x.msg
        if (typeof x === 'object' && 'message' in x && typeof x.message === 'string') return x.message
        try {
          return JSON.stringify(x)
        } catch {
          return String(x)
        }
      })
      .filter(Boolean)
    return parts.join('；').trim()
  }
  if (typeof detail === 'object') {
    try {
      return JSON.stringify(detail)
    } catch {
      return String(detail)
    }
  }
  return String(detail).trim()
}

/**
 * 从 axios 错误对象中提取用户可读说明（优先服务端 detail）
 * @param {import('axios').AxiosError} err
 * @returns {string}
 */
export function formatAxiosApiError(err) {
  if (!err) return ''
  const fromBody = formatFastApiDetail(err.response?.data?.detail)
  if (fromBody) return fromBody
  if (err.response?.data && typeof err.response.data === 'string') {
    const s = err.response.data.trim()
    if (s) return s.length > 2000 ? `${s.slice(0, 2000)}…` : s
  }
  const code = err.code
  const msg = err.message || ''
  if (code === 'ECONNABORTED' || /timeout/i.test(msg)) {
    return `${msg || '请求超时'}。「初始化语录库」在多模态逐条向量化时可能极久（当前 init-kb axios / Vite 代理均约 2h；若仍超时可用脚本 init_energy_station_kb.ps1 或 Swagger http://127.0.0.1:8001/docs）。`
  }
  if (!err.response) {
    return msg || '网络错误：未收到服务器响应（可检查后端是否运行、Vite 代理是否正常）。'.trim()
  }
  return msg || `HTTP ${err.response.status}`
}
