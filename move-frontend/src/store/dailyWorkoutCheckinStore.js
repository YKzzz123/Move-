import { defineStore } from 'pinia'

const STORAGE_KEY = 'move_v2_daily_workout_checkin'

function ymdLocal(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function normYmd(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s
}

export const useDailyWorkoutCheckinStore = defineStore('dailyWorkoutCheckin', {
  state: () => ({
    /** 本地时区下有运动记录的日期 YYYY-MM-DD（与日历网格一致） */
    activeDates: /** @type {string[]} */ ([]),
  }),

  actions: {
    hydrate() {
      if (typeof localStorage === 'undefined') return
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        const a = raw ? JSON.parse(raw) : []
        const set = new Set()
        if (Array.isArray(a)) {
          for (const x of a) {
            const n = normYmd(typeof x === 'string' ? x : '')
            if (n) set.add(n)
          }
        }
        this.activeDates = [...set].sort()
      } catch {
        this.activeDates = []
      }
    },

    _persist() {
      if (typeof localStorage === 'undefined') return
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.activeDates))
    },

    mergeServerDates(dates) {
      if (!Array.isArray(dates)) return
      this.hydrate()
      const set = new Set(this.activeDates)
      for (const x of dates) {
        const n = normYmd(String(x).slice(0, 10))
        if (n) set.add(n)
      }
      this.activeDates = [...set].sort()
      this._persist()
    },

    /**
     * 收纳成功或写本地降权时：若有完成组数则记本地打卡日
     * @param {Array<{ completedSets?: number }>} items
     */
    markFromWorkoutItems(items) {
      if (!Array.isArray(items) || !items.length) return
      const any = items.some((it) => (Number(it?.completedSets) || 0) > 0)
      if (!any) return
      this.hydrate()
      const t = ymdLocal()
      if (this.activeDates.includes(t)) return
      this.activeDates = [...this.activeDates, t].sort()
      this._persist()
    },
  },
})
