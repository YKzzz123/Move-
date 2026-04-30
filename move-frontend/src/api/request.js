import axios from 'axios'

// 开发：baseURL 为空，请求发到当前页面源 (如 127.0.0.1:5174)，由 Vite proxy 转发到 FastAPI
// 避免浏览器直连 :8001（易因 localhost→IPv6、仅监听 127.0.0.1 等出现 Network Error）
// 生产：用 VITE_API_BASE_URL，缺省为 127.0.0.1:8001
const BASE_URL = import.meta.env.DEV
  ? ''
  : (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8001')

const request = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
})

request.interceptors.request.use(
  (config) => {
    return config
  },
  (error) => Promise.reject(error),
)

function getErrorDetail(error) {
  const raw = error?.response?.data
  if (raw == null) {
    return error?.message
  }
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw)
      return j?.detail != null ? j.detail : raw
    } catch {
      return raw
    }
  }
  if (raw?.detail != null) {
    return raw.detail
  }
  return error?.message
}

request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status = error?.response?.status
    const detail = getErrorDetail(error)
    console.error(`[API ${status || 'NETWORK'}]`, detail)
    return Promise.reject(error)
  },
)

export default request
