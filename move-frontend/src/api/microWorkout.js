import request from '@/api/request'

/**
 * 结界收纳：后端累加真气并写入 micro_workout_runs
 * @param {number} userId
 * @param {{ total_qi: number, total_calories: number, plan_mode: string, items: object[] }} body
 */
export function saveMicroWorkoutFinish(userId, body) {
  return request.post(`/api/users/${userId}/micro-workouts/finish`, body)
}

/**
 * 按月拉取「有微运动收纳记录」的日期（YYYY-MM-DD）
 * @param {number} userId
 * @param {number} year
 * @param {number} month 1–12
 */
export function fetchMicroWorkoutCalendarDates(userId, year, month) {
  return request.get(`/api/users/${userId}/micro-workouts/calendar-dates`, {
    params: { year, month },
  })
}
