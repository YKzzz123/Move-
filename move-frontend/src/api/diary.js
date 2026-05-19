import request from '@/api/request'

/**
 * @param {number} diaryId
 * @param {{ user_id: number, content: string }} body
 * @param {import('axios').AxiosRequestConfig} [config]
 */
export function updateDiary(diaryId, body, config = {}) {
  return request.patch(`/api/diaries/${diaryId}`, body, { timeout: 30_000, ...config })
}

/**
 * @param {number} diaryId
 * @param {number} userId
 */
export function deleteDiary(diaryId, userId) {
  return request.delete(`/api/diaries/${diaryId}`, { params: { user_id: userId } })
}
