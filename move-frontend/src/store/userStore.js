import { defineStore } from 'pinia'
import request from '@/api/request'

const CAT_STATE = Object.freeze({
  IDLE: 'idle',
  HAPPY: 'happy',
  TIRED: 'tired',
})

const USER_STORAGE_KEY = 'move_v2_user'

function loadPersistedUser() {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    const id = p?.userId
    if (id == null || id === '' || Number(id) <= 0) return null
    return {
      userId: Number(id),
      username: typeof p.username === 'string' ? p.username : '',
      zodiacCatType: typeof p.zodiacCatType === 'string' ? p.zodiacCatType : '',
      qiScore: Number(p.qiScore) || 0,
    }
  } catch {
    return null
  }
}

function initialState() {
  const base = {
    userId: null,
    username: '',
    zodiacCatType: '',
    qiScore: 0,
    currentCatState: CAT_STATE.IDLE,
    currentSession: {
      active: false,
      startTime: null,
      durationSec: 0,
      remainingSec: 0,
      actionType: '',
    },
    loading: false,
    error: null,
  }
  const saved = loadPersistedUser()
  if (saved) {
    base.userId = saved.userId
    base.username = saved.username
    base.zodiacCatType = saved.zodiacCatType
    base.qiScore = saved.qiScore
  }
  return base
}

export const useUserStore = defineStore('user', {
  state: () => initialState(),

  getters: {
    isSessionActive: (state) => state.currentSession.active,
    catStateLabel: (state) => state.currentCatState,
  },

  actions: {
    _persistToStorage() {
      if (typeof localStorage === 'undefined') return
      if (this.userId == null || this.userId === '') {
        localStorage.removeItem(USER_STORAGE_KEY)
        return
      }
      localStorage.setItem(
        USER_STORAGE_KEY,
        JSON.stringify({
          userId: this.userId,
          username: this.username,
          zodiacCatType: this.zodiacCatType,
          qiScore: this.qiScore,
        }),
      )
    },

    clearPersistedUser() {
      this.userId = null
      this.username = ''
      this.zodiacCatType = ''
      this.qiScore = 0
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(USER_STORAGE_KEY)
      }
    },

    logout() {
      this.clearPersistedUser()
      this.resetSession()
      this.currentCatState = CAT_STATE.IDLE
      this.error = null
    },

    async fetchUser(userId) {
      this.loading = true
      this.error = null
      try {
        const data = await request.get(`/api/users/${userId}`)
        this.userId = data.id ?? userId
        this.username = data.username || ''
        this.zodiacCatType = data.zodiac_cat_type || ''
        this.qiScore = Number(data.qi_score ?? 0)
        this.currentCatState = CAT_STATE.IDLE
        this._persistToStorage()
        return data
      } catch (err) {
        this.error = err
        if (err?.response?.status === 404) {
          this.clearPersistedUser()
        }
        throw err
      } finally {
        this.loading = false
      }
    },

    async login({ username, password }) {
      this.loading = true
      this.error = null
      try {
        const data = await request.post('/api/auth/login', {
          username,
          password,
        })
        this.userId = data.id
        this.username = data.username || ''
        this.zodiacCatType = data.zodiac_cat_type || ''
        this.qiScore = Number(data.qi_score ?? 0)
        this.currentCatState = CAT_STATE.IDLE
        this._persistToStorage()
        return data
      } catch (err) {
        this.error = err
        throw err
      } finally {
        this.loading = false
      }
    },

    async register({ username, password, birthday }) {
      this.loading = true
      this.error = null
      try {
        const data = await request.post('/api/auth/register', {
          username,
          password,
          birthday,
        })
        this.userId = data.user_id
        this.username = data.username || ''
        this.zodiacCatType = data.zodiac_cat_type || ''
        this.qiScore = 0
        this.currentCatState = CAT_STATE.IDLE
        this._persistToStorage()
        return data
      } catch (err) {
        this.error = err
        throw err
      } finally {
        this.loading = false
      }
    },

    async addQiScore(points) {
      if (!this.userId) {
        throw new Error('userId is not initialized, call fetchUser first')
      }
      const delta = Number(points) || 0
      const data = await request.post(`/api/users/${this.userId}/qi`, {
        qi_delta: delta,
      })
      this.qiScore = Number(data.qi_score ?? this.qiScore + delta)
      this.currentCatState = delta >= 0 ? CAT_STATE.HAPPY : CAT_STATE.TIRED
      this._persistToStorage()
      return data
    },

    setCatState(nextState) {
      if (Object.values(CAT_STATE).includes(nextState)) {
        this.currentCatState = nextState
      }
    },

    startSession({ durationSec = 25 * 60, actionType = '' } = {}) {
      this.currentSession = {
        active: true,
        startTime: Date.now(),
        durationSec,
        remainingSec: durationSec,
        actionType,
      }
      this.currentCatState = CAT_STATE.IDLE
    },

    tickSession(elapsedSec) {
      if (!this.currentSession.active) return
      const remaining = Math.max(0, this.currentSession.remainingSec - elapsedSec)
      this.currentSession.remainingSec = remaining
      if (remaining === 0) {
        this.currentSession.active = false
      }
    },

    endSession({ qualified = false } = {}) {
      this.currentSession.active = false
      this.currentSession.remainingSec = 0
      this.currentCatState = qualified ? CAT_STATE.HAPPY : CAT_STATE.TIRED
    },

    resetSession() {
      this.currentSession = {
        active: false,
        startTime: null,
        durationSec: 0,
        remainingSec: 0,
        actionType: '',
      }
    },
  },
})

export { CAT_STATE }
