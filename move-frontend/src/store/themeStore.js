import { defineStore } from 'pinia'

/** 与 main.js bootstrap 保持一致 */
export const THEME_STORAGE_KEY = 'move-v2-theme'

/**
 * UI 主题：浅色（默认） / 夜间
 * 通过给 document.documentElement 加 class dark 触发 Tailwind dark: 变体
 */
export const useThemeStore = defineStore('theme', {
  state: () => ({
    /** @type {'light' | 'dark'} */
    mode: 'light',
  }),
  getters: {
    /** 是否在夜间模式 */
    isDark: (state) => state.mode === 'dark',
  },
  actions: {
    syncFromBootstrap() {
      try {
        const raw = localStorage.getItem(THEME_STORAGE_KEY)
        if (raw === 'dark') this.mode = 'dark'
        else if (raw === 'light') this.mode = 'light'
      } catch {
        this.mode = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
      }
    },
    persist() {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, this.mode)
      } catch {
        /* ignore quota / privacy mode */
      }
    },
    applyDom() {
      document.documentElement.classList.toggle('dark', this.mode === 'dark')
    },
    setMode(mode) {
      const next = mode === 'dark' ? 'dark' : 'light'
      this.mode = next
      this.persist()
      this.applyDom()
    },
    toggle() {
      this.setMode(this.mode === 'dark' ? 'light' : 'dark')
    },
  },
})
