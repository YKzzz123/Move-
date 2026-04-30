import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // 优先 5173；若被占用则自动递增 (5174、5175 …)，无需手改端口
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
    // 开发时把 /api 转到本机 FastAPI，浏览器只连当前页面端口，避免跨域与 localhost/IPv6 问题
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
      },
    },
  },
})
