import { defineStore } from 'pinia'

const STORAGE_KEY = 'move_v2_micro_workout_log'
const MAX_EVENTS = 500

/**
 * 本地微运动完成记录（与后续后端 Session 可合并作降权来源）
 * @typedef {{ movementId: string, at: string }} MicroWorkoutEvent
 */
function safeParse(json) {
  try {
    const a = JSON.parse(json)
    return Array.isArray(a) ? a : []
  } catch {
    return []
  }
}

export const useWorkoutHistoryStore = defineStore('workoutHistory', {
  state: () => ({
    /** @type {MicroWorkoutEvent[]} */
    completions: [],
  }),

  actions: {
    /** 从 localStorage 恢复 */
    hydrate() {
      if (typeof localStorage === 'undefined') return
      const raw = localStorage.getItem(STORAGE_KEY)
      this.completions = safeParse(raw || '[]')
    },

    _persist() {
      if (typeof localStorage === 'undefined') return
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(this.completions.slice(-MAX_EVENTS)),
      )
    },

    /** 记录某动作完成（后续步骤 4 结界/结算时调用） */
    recordCompletion(movementId) {
      if (!movementId) return
      this.hydrate()
      this.completions.push({ movementId, at: new Date().toISOString() })
      this._persist()
    },

    /**
     * 近 N 天做过至少一次的 movementId 集合
     * @param {number} withinDays
     * @returns {Set<string>}
     */
    getRecentMovementIdsWithinDays(withinDays) {
      this.hydrate()
      const cutoff = Date.now() - withinDays * 86400000
      const s = new Set()
      for (const c of this.completions) {
        const t = new Date(c.at).getTime()
        if (Number.isFinite(t) && t >= cutoff) s.add(c.movementId)
      }
      return s
    },

    /**
     * 结界收纳后写入：有完成组数的动作各记一条（供加权随机）
     * @param {Array<{ movementId?: string, completedSets?: number }>} items
     */
    recordFromWorkoutItems(items) {
      if (!Array.isArray(items) || !items.length) return
      this.hydrate()
      const at = new Date().toISOString()
      for (const it of items) {
        const id = it.movementId
        const n = Number(it.completedSets) || 0
        if (!id || n <= 0) continue
        this.completions.push({ movementId: id, at })
      }
      this._persist()
    },
  },
})
