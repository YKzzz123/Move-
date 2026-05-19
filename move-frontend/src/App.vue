<script setup>
import { computed, onMounted } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useUserStore } from '@/store/userStore'
import { useThemeStore } from '@/store/themeStore'
import { useWorkoutFocusStore } from '@/store/workoutFocusStore'
import { SHOW_QI_UI } from '@/config/featureFlags'
import WorkoutCheckinCalendar from '@/components/WorkoutCheckinCalendar.vue'
import logoUrl from '@/assets/logo/logo.png'

const route = useRoute()
const userStore = useUserStore()
const themeStore = useThemeStore()
const workoutFocusStore = useWorkoutFocusStore()

onMounted(() => {
  if (userStore.userId) {
    userStore.fetchUser(userStore.userId).catch(() => {})
  }
})

/** 运动打卡旗帜：仅首页、经络库、能量站；用户中心/登录/注册等页不挂载，避免挡按钮 */
const SHOW_WORKOUT_CHECKIN_NAMES = new Set(['Home', 'Library', 'EnergyStation'])
const showWorkoutCheckin = computed(
  () =>
    route.name != null &&
    SHOW_WORKOUT_CHECKIN_NAMES.has(String(route.name)) &&
    !workoutFocusStore.immersiveWorkout,
)

function isActive(path) {
  return route.path === path
}

function toggleSkin() {
  themeStore.toggle()
}

/** 经络库 / 能量站 / 用户中心：统一底色与 hover（与原版经络库一致） */
function navGhostClasses(path) {
  const base =
    'inline-flex min-h-[42px] min-w-[6.75rem] items-center justify-center gap-2 rounded-[2.5rem] border border-stone-200/50 bg-white/40 px-5 py-2.5 text-xs tracking-[0.25em] text-stone-600 shadow-[0_2px_12px_rgb(0,0,0,0.03)] backdrop-blur-sm transition hover:border-teal-200/50 hover:bg-teal-50/60 hover:text-teal-800 dark:border-stone-600/50 dark:bg-stone-900/50 dark:text-stone-300 dark:hover:border-teal-600/40 dark:hover:bg-teal-950/50 dark:hover:text-teal-200 sm:min-w-[7.25rem]'
  const active =
    'border-teal-300/50 bg-teal-50/80 text-teal-900 shadow-[0_4px_16px_rgb(0,0,0,0.04)] dark:border-teal-500/45 dark:bg-teal-950/60 dark:text-teal-100'
  return isActive(path) ? `${base} ${active}` : base
}
</script>

<template>
  <div
    class="relative flex min-h-screen w-full flex-col overflow-hidden bg-[#F7F5F0] text-stone-800 selection:bg-teal-100/60 transition-colors duration-300 dark:bg-[#0c1211] dark:text-stone-100 dark:selection:bg-teal-900/40"
  >
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(45,138,124,0.07),transparent_58%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(45,138,124,0.12),transparent_55%)]"
    ></div>

    <header
      class="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-6 px-8 py-8 sm:flex-row sm:items-center sm:justify-between"
    >
      <RouterLink
        to="/"
        class="group flex w-fit shrink-0 items-center gap-3 rounded-[2.5rem] px-1 py-1 transition hover:opacity-90"
      >
        <img
          :src="logoUrl"
          alt="Move!"
          width="128"
          height="128"
          class="h-14 w-auto max-w-[min(46vw,12.5rem)] shrink-0 object-contain object-left sm:h-16 sm:max-w-none"
        />
        <span class="text-xs tracking-[0.35em] text-stone-500 dark:text-stone-400">Move!</span>
      </RouterLink>

      <div class="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div class="flex flex-wrap items-center gap-3 sm:gap-4">
          <button
            type="button"
            :aria-pressed="themeStore.isDark"
            :aria-label="themeStore.isDark ? '切换为浅色' : '切换为夜间模式'"
            class="inline-flex shrink-0 items-center justify-center rounded-[2rem] border border-stone-200/60 bg-white/70 px-3 py-2.5 text-stone-500 shadow-[0_4px_16px_rgb(0,0,0,0.04)] backdrop-blur-md transition hover:border-teal-200/60 hover:bg-teal-50/80 hover:text-teal-800 dark:border-stone-600/50 dark:bg-stone-900/70 dark:text-stone-400 dark:hover:border-teal-600/40 dark:hover:bg-stone-800 dark:hover:text-teal-200"
            @click="toggleSkin"
          >
            <svg
              v-if="themeStore.isDark"
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.35"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
            <svg
              v-else
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.35"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </button>

          <div
            v-if="SHOW_QI_UI"
            class="flex min-w-[7.25rem] items-baseline gap-2 rounded-[2.5rem] border border-stone-200/60 bg-white/80 px-5 py-2.5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-md dark:border-stone-600/55 dark:bg-stone-900/75 dark:shadow-[0_8px_30px_rgb(0,0,0,0.35)]"
          >
            <span class="text-[11px] tracking-[0.35em] text-stone-500 dark:text-stone-400">真气</span>
            <span class="font-light text-2xl tabular-nums text-teal-700 dark:text-teal-400">{{ userStore.qiScore }}</span>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-start gap-3 sm:justify-end sm:gap-4">
          <RouterLink
            to="/"
            custom
            v-slot="{ navigate, href }"
          >
            <a
              :href="href"
              :class="navGhostClasses('/')"
              @click="navigate"
            >
              首页
            </a>
          </RouterLink>

          <RouterLink
            to="/library"
            custom
            v-slot="{ navigate, href }"
          >
            <a
              :href="href"
              :title="'经络运动库'"
              :class="navGhostClasses('/library')"
              @click="navigate"
            >
              <svg
                class="h-4 w-4 shrink-0 text-teal-600/80 dark:text-teal-400/85"
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
              <span>经络库</span>
            </a>
          </RouterLink>

          <RouterLink
            to="/energy"
            custom
            v-slot="{ navigate, href }"
          >
            <a
              :href="href"
              :class="navGhostClasses('/energy')"
              @click="navigate"
            >
              能量站
            </a>
          </RouterLink>

          <RouterLink
            v-if="userStore.userId"
            to="/user"
            custom
            v-slot="{ navigate, href }"
          >
            <a
              :href="href"
              :class="navGhostClasses('/user')"
              @click="navigate"
            >
              用户中心
            </a>
          </RouterLink>

          <RouterLink
            v-if="!userStore.userId"
            to="/login"
            class="rounded-[2.5rem] border border-stone-200/60 bg-white/70 px-4 py-2.5 text-[10px] tracking-[0.28em] text-stone-600 shadow-[0_4px_16px_rgb(0,0,0,0.04)] transition hover:border-teal-200/60 hover:bg-teal-50/90 hover:text-teal-800 dark:border-stone-600/50 dark:bg-stone-900/60 dark:text-stone-300 dark:hover:bg-teal-950/35 dark:hover:text-teal-100"
            :class="isActive('/login') ? 'border-teal-300/50 bg-teal-100 text-teal-900 dark:border-teal-500/45 dark:bg-teal-950/60 dark:text-teal-50' : ''"
          >
            登录
          </RouterLink>

          <RouterLink
            v-if="!userStore.userId"
            to="/register"
            class="rounded-[2.5rem] border border-stone-200/60 bg-white/70 px-4 py-2.5 text-[10px] tracking-[0.28em] text-stone-600 shadow-[0_4px_16px_rgb(0,0,0,0.04)] transition hover:border-teal-200/60 hover:bg-teal-50/90 hover:text-teal-800 dark:border-stone-600/50 dark:bg-stone-900/60 dark:text-stone-300 dark:hover:bg-teal-950/35 dark:hover:text-teal-100"
            :class="isActive('/register') ? 'border-teal-300/50 bg-teal-100 text-teal-900 dark:border-teal-500/45 dark:bg-teal-950/60 dark:text-teal-50' : ''"
          >
            注册
          </RouterLink>
        </div>
      </div>
    </header>

    <WorkoutCheckinCalendar v-if="showWorkoutCheckin" />

    <div class="relative z-10 flex flex-1 flex-col">
      <RouterView />
    </div>
  </div>
</template>
