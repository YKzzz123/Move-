<script setup>
import { onMounted } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useUserStore } from '@/store/userStore'

const route = useRoute()
const userStore = useUserStore()

onMounted(() => {
  if (userStore.userId) {
    userStore.fetchUser(userStore.userId).catch(() => {})
  }
})

function isActive(path) {
  return route.path === path
}
</script>

<template>
  <div
    class="relative flex min-h-screen w-full flex-col overflow-hidden bg-[#F7F5F0] text-stone-800 selection:bg-teal-100/60"
  >
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(45,138,124,0.07),transparent_58%)]"
    ></div>

    <header
      class="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between gap-6 px-8 py-8"
    >
      <RouterLink
        to="/"
        class="group flex items-center gap-3 rounded-[2.5rem] px-1 py-1 transition hover:opacity-90"
      >
        <span
          class="h-2 w-2 rounded-full bg-teal-500 ring-2 ring-teal-100/70 transition group-hover:ring-teal-200/70"
        ></span>
        <span class="text-xs tracking-[0.4em] text-stone-500">MOVE · V2</span>
      </RouterLink>

      <div class="flex flex-wrap items-center justify-end gap-3 sm:gap-4">
        <RouterLink
          to="/library"
          custom
          v-slot="{ navigate, href }"
        >
          <a
            :href="href"
            :title="'经络运动库'"
            @click="navigate"
            :class="[
              'inline-flex items-center gap-2 rounded-[2rem] border border-stone-200/50 bg-white/40 px-3 py-2 text-[10px] tracking-[0.2em] text-stone-600 shadow-[0_2px_12px_rgb(0,0,0,0.03)] backdrop-blur-sm transition hover:border-teal-200/50 hover:bg-teal-50/60 hover:text-teal-800',
              isActive('/library') ? 'border-teal-300/50 bg-teal-50/80 text-teal-900' : '',
            ]"
          >
            <svg
              class="h-4 w-4 shrink-0 text-teal-600/80"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.3"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M6 4h7l4 9-3 11H6l-3-11 3-4V4z" />
              <path d="M13 4v9" opacity="0.55" />
              <path d="M5.5 11.5L9 14" opacity="0.55" />
            </svg>
            <span class="hidden sm:inline">经络库</span>
          </a>
        </RouterLink>

        <div
          class="flex items-baseline gap-2 rounded-[2.5rem] border border-stone-200/60 bg-white/80 px-5 py-2.5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-md"
        >
          <span class="text-[11px] tracking-[0.35em] text-stone-500">真气</span>
          <span class="font-light text-2xl tabular-nums text-teal-700">{{ userStore.qiScore }}</span>
        </div>

        <RouterLink
          to="/user"
          custom
          v-slot="{ navigate, href }"
        >
          <a
            :href="href"
            @click="navigate"
            :class="[
              'rounded-[2.5rem] border border-stone-200/60 bg-teal-50/90 px-5 py-2.5 text-xs tracking-[0.25em] text-teal-800 shadow-[0_4px_20px_rgb(0,0,0,0.03)] backdrop-blur-md transition hover:bg-teal-100',
              isActive('/user') ? 'border-teal-300/50 bg-teal-100 text-teal-900' : '',
            ]"
          >
            用户中心
          </a>
        </RouterLink>

        <RouterLink
          to="/energy"
          custom
          v-slot="{ navigate, href }"
        >
          <a
            :href="href"
            @click="navigate"
            :class="[
              'rounded-[2.5rem] border border-stone-200/60 bg-teal-50/90 px-5 py-2.5 text-xs tracking-[0.25em] text-teal-800 shadow-[0_4px_20px_rgb(0,0,0,0.03)] backdrop-blur-md transition hover:bg-teal-100',
              isActive('/energy') ? 'border-teal-300/50 bg-teal-100 text-teal-900' : '',
            ]"
          >
            能量站
          </a>
        </RouterLink>

        <RouterLink
          v-if="!userStore.userId"
          to="/login"
          class="rounded-[2.5rem] border border-stone-200/60 bg-white/70 px-4 py-2.5 text-[10px] tracking-[0.28em] text-stone-600 shadow-[0_4px_16px_rgb(0,0,0,0.04)] transition hover:border-teal-200/60 hover:bg-teal-50/90 hover:text-teal-800"
          :class="isActive('/login') ? 'border-teal-300/50 bg-teal-100 text-teal-900' : ''"
        >
          登录
        </RouterLink>

        <RouterLink
          v-if="!userStore.userId"
          to="/register"
          class="rounded-[2.5rem] border border-stone-200/60 bg-white/70 px-4 py-2.5 text-[10px] tracking-[0.28em] text-stone-600 shadow-[0_4px_16px_rgb(0,0,0,0.04)] transition hover:border-teal-200/60 hover:bg-teal-50/90 hover:text-teal-800"
          :class="isActive('/register') ? 'border-teal-300/50 bg-teal-100 text-teal-900' : ''"
        >
          注册
        </RouterLink>
      </div>
    </header>

    <div class="relative z-10 flex flex-1 flex-col">
      <RouterView />
    </div>
  </div>
</template>
