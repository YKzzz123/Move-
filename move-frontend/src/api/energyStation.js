import request from '@/api/request'

/** 知识库冷启动可能极久（如多模态逐条 embedding ×200）；7200s 与运维脚本、PowerShell 默认一致 */
export function initEnergyKnowledgeBase() {
  return request.post('/api/energy-station/init-kb', {}, { timeout: 7_200_000 })
}

/**
 * @returns {Promise<{ quote: string, source: string }>}
 */
export function getRandomEnergyQuote() {
  return request.get('/api/energy-station/random-quote', { timeout: 30_000 })
}

/**
 * @param {string} dailyDiary
 * @returns {Promise<{ quote: string, source: string, explanation: string }>}
 */
export function postEnergyEcho(dailyDiary) {
  return request.post(
    '/api/energy-station/echo',
    { daily_diary: dailyDiary },
    { timeout: 120_000 },
  )
}
