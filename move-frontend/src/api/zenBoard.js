import request from '@/api/request'

/**
 * 数字禅意看板：三档统计、近 30 日热力、近 3 日历史回音
 * @param {number} userId
 */
export function fetchZenBoard(userId) {
  return request.get(`/api/users/${userId}/dashboard/zen-board`)
}
