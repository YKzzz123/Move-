import request from '@/api/request'

/**
 * 结界收纳：后端累加真气并写入 micro_workout_runs
 * @param {number} userId
 * @param {{ total_qi: number, total_calories: number, plan_mode: string, items: object[] }} body
 */
export function saveMicroWorkoutFinish(userId, body) {
  return request.post(`/api/users/${userId}/micro-workouts/finish`, body)
}
