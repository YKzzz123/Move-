import request from '@/api/request'

/**
 * @param {number} userId
 * @param {{ old_password: string, new_password: string }} body
 */
export function changeUserPassword(userId, body) {
  return request.post(`/api/users/${userId}/password`, body)
}
