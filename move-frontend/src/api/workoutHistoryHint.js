import request from '@/api/request'

/**
 * 若后端提供「近 N 天做过的微运动 id」则与本地 Pinia 记录合并后用于降权；失败返回空集。
 * @param {number | null} userId
 * @param {number} [days=3]
 * @returns {Promise<Set<string>>}
 */
export async function fetchRecentMicroMovementIdsFromServer(userId, days = 3) {
  if (userId == null || Number(userId) <= 0) {
    return new Set()
  }
  try {
    const data = await request.get(`/api/users/${userId}/workouts/recent-movements`, {
      params: { days },
    })
    const arr = data?.movement_ids
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.map((x) => String(x)))
  } catch {
    return new Set()
  }
}
