import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import './style.css'
import faviconUrl from '@/assets/logo/logo.png'
import { THEME_STORAGE_KEY, useThemeStore } from '@/store/themeStore'

/** 尽早同步 DOM，减轻首帧闪烁（Pinia 尚未挂载） */
function bootstrapThemeClass() {
  let mode = 'light'
  try {
    const s = localStorage.getItem(THEME_STORAGE_KEY)
    if (s === 'dark') mode = 'dark'
    else if (s === 'light') mode = 'light'
  } catch {
    /* ignore */
  }
  document.documentElement.classList.toggle('dark', mode === 'dark')
}

bootstrapThemeClass()

const favicon = document.createElement('link')
favicon.rel = 'icon'
favicon.type = 'image/png'
favicon.href = faviconUrl
document.head.appendChild(favicon)

const pinia = createPinia()
const app = createApp(App)
app.use(pinia)
app.use(router)

useThemeStore(pinia).syncFromBootstrap()

app.mount('#app')
