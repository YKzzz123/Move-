<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/store/userStore'
import { resolveRegisterZodiacHappyPortraitUrl } from '@/config/catAssets'
import { zodiacPortraitFieldsFromStoredType } from '@/utils/zodiac'
import { SHOW_QI_UI } from '@/config/featureFlags'
import { changeUserPassword } from '@/api/password'
import request from '@/api/request'
import { fetchZenBoard } from '@/api/zenBoard'

const router = useRouter()
const userStore = useUserStore()

const showPwdModal = ref(false)

const pwdOld = ref('')
const pwdNew = ref('')
const pwdConfirm = ref('')
const pwdLoading = ref(false)
const pwdMsg = ref('')
const pwdErr = ref('')

/** 数字禅意看板 Tab：daily | rhythm | yearly */
const dashboardTab = ref('daily')
const dashboardLoading = ref(false)

/** 修习寄语：当前 Tab 展示正文；rhythm → API monthly，yearly → API yearly */
const zenReportContent = ref('')
const isGeneratingReport = ref(false)
const zenLetterCache = ref({ rhythm: '', yearly: '' })

watch(dashboardTab, (tab) => {
  dashboardLoading.value = true
  window.setTimeout(() => {
    dashboardLoading.value = false
  }, 420)
  void ensureZenLetterForTab(tab)
})

function defaultStatBlock() {
  return { focus_hours: 0, movement_count: 0, preferred_movement: '暂无记录' }
}

const boardStats = ref({
  daily: defaultStatBlock(),
  rhythm: defaultStatBlock(),
  yearly: defaultStatBlock(),
})
const heatmapLevels = ref(
  Array.from({ length: 30 }, (_, i) => ({ id: i, day: '', level: 0 })),
)
const timelineRows = ref([])
const zenBoardLoading = ref(false)

function formatFocusLabel(hours) {
  const h = Number(hours)
  if (!Number.isFinite(h) || h < 0) return '0分'
  const totalMin = Math.round(h * 60)
  if (totalMin < 1) return '0分'
  const hh = Math.floor(totalMin / 60)
  const mm = totalMin % 60
  if (hh === 0) return `${mm}分`
  if (mm === 0) return `${hh}小时`
  return `${hh}小时${mm}分`
}

const currentStats = computed(() => {
  const key =
    dashboardTab.value === 'daily'
      ? 'daily'
      : dashboardTab.value === 'yearly'
        ? 'yearly'
        : 'rhythm'
  const s = { ...defaultStatBlock(), ...(boardStats.value[key] || {}) }
  return {
    focusLabel: formatFocusLabel(s.focus_hours),
    stretchCount: s.movement_count ?? 0,
    preferredMove: s.preferred_movement || '暂无记录',
  }
})

async function loadZenBoard() {
  if (!userStore.userId) {
    boardStats.value = {
      daily: defaultStatBlock(),
      rhythm: defaultStatBlock(),
      yearly: defaultStatBlock(),
    }
    heatmapLevels.value = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      day: '',
      level: 0,
    }))
    timelineRows.value = []
    return
  }
  zenBoardLoading.value = true
  try {
    const data = await fetchZenBoard(userStore.userId)
    boardStats.value = {
      daily: { ...defaultStatBlock(), ...(data?.daily || {}) },
      rhythm: { ...defaultStatBlock(), ...(data?.rhythm || {}) },
      yearly: { ...defaultStatBlock(), ...(data?.yearly || {}) },
    }
    const raw = Array.isArray(data?.heatmap_30d) ? data.heatmap_30d : []
    const padded = [...raw]
    while (padded.length < 30) padded.push({ day: '', level: 0 })
    heatmapLevels.value = padded.slice(0, 30).map((c, i) => ({
      id: i,
      day: c.day || '',
      level: typeof c.level === 'number' ? c.level : 0,
    }))
    timelineRows.value = Array.isArray(data?.timeline_recent) ? data.timeline_recent : []
  } catch {
    boardStats.value = {
      daily: defaultStatBlock(),
      rhythm: defaultStatBlock(),
      yearly: defaultStatBlock(),
    }
    heatmapLevels.value = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      day: '',
      level: 0,
    }))
    timelineRows.value = []
  } finally {
    zenBoardLoading.value = false
  }
}

watch(
  () => userStore.userId,
  () => {
    zenLetterCache.value = { rhythm: '', yearly: '' }
    void loadZenBoard()
    void ensureZenLetterForTab(dashboardTab.value)
  },
)

onMounted(() => {
  void loadZenBoard()
})

async function ensureZenLetterForTab(tab) {
  if (tab === 'daily' || !userStore.userId) {
    zenReportContent.value = ''
    return
  }
  const cacheKey = tab === 'rhythm' ? 'rhythm' : 'yearly'
  const apiPeriod = tab === 'rhythm' ? 'monthly' : 'yearly'

  if (zenLetterCache.value[cacheKey]) {
    zenReportContent.value = zenLetterCache.value[cacheKey]
    return
  }

  zenReportContent.value = ''
  isGeneratingReport.value = true
  try {
    const data = await request.get(`/api/users/${userStore.userId}/reports/zen-summary`, {
      params: { period: apiPeriod },
      timeout: 60000,
    })
    const text = typeof data?.report_content === 'string' ? data.report_content : ''
    zenLetterCache.value = { ...zenLetterCache.value, [cacheKey]: text }
    if (dashboardTab.value === tab) {
      zenReportContent.value = text
    }
  } catch {
    const errText = '寄语暂未能载入，请稍后重试。'
    if (dashboardTab.value === tab) {
      zenReportContent.value = errText
    }
  } finally {
    isGeneratingReport.value = false
  }
}

watch(showPwdModal, (open) => {
  if (!open) {
    pwdErr.value = ''
    pwdMsg.value = ''
  }
})

function passwordErrorDetail(error) {
  const raw = error?.response?.data
  if (raw == null) return '修改失败，请稍后重试。'
  const d = raw?.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg)
  return '修改失败，请检查当前密码与网络。'
}

async function onChangePassword() {
  pwdErr.value = ''
  pwdMsg.value = ''
  if (!userStore.userId) {
    pwdErr.value = '请先登录。'
    return
  }
  if ((pwdNew.value || '').length < 8) {
    pwdErr.value = '新密码至少 8 位。'
    return
  }
  if (pwdNew.value !== pwdConfirm.value) {
    pwdErr.value = '两次输入的新密码不一致。'
    return
  }
  pwdLoading.value = true
  try {
    await changeUserPassword(userStore.userId, {
      old_password: pwdOld.value,
      new_password: pwdNew.value,
    })
    pwdMsg.value = '密码已更新。'
    pwdOld.value = ''
    pwdNew.value = ''
    pwdConfirm.value = ''
    window.setTimeout(() => {
      showPwdModal.value = false
      pwdMsg.value = ''
    }, 1200)
  } catch (e) {
    pwdErr.value = passwordErrorDetail(e)
  } finally {
    pwdLoading.value = false
  }
}

function closePwdModal() {
  showPwdModal.value = false
}

function onLogout() {
  userStore.logout()
  router.push('/')
}

function heatDotClass(level) {
  const base = 'w-3 h-3 shrink-0 rounded-full transition-colors duration-300'
  if (level <= 0) return `${base} bg-stone-300/35 dark:bg-stone-600/50`
  if (level === 1) return `${base} bg-amber-400/20 dark:bg-amber-400/25`
  if (level === 2) return `${base} bg-amber-400/45 dark:bg-amber-400/50`
  if (level === 3) return `${base} bg-amber-400/65 dark:bg-amber-400/70`
  return `${base} bg-amber-400/80 dark:bg-amber-400/85`
}

const tabBtnBase =
  'rounded-full px-3 py-1.5 text-[11px] tracking-[0.12em] transition-colors duration-300 sm:px-4'
const tabBtnActive = 'font-medium text-teal-600 dark:text-teal-400'
const tabBtnIdle =
  'text-stone-500/75 hover:text-stone-700 dark:text-stone-400/70 dark:hover:text-stone-300'

/** 与注册页星座小像同源：`src/assets/cats/{名}-h.png`（同生日推导的 zh + en） */
const userCatPortraitUrl = computed(() => {
  const { zhStem, en } = zodiacPortraitFieldsFromStoredType(userStore.zodiacCatType || '')
  return resolveRegisterZodiacHappyPortraitUrl(zhStem, en, { guest: !userStore.userId })
})
</script>

<template>
  <div class="flex flex-1 flex-col pb-16">
    <nav
      class="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-end gap-3 px-6 pt-4 sm:px-8"
    >
      <div v-if="userStore.userId" class="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          class="rounded-[2rem] border border-stone-200/60 bg-white/80 px-4 py-2.5 text-[11px] tracking-[0.28em] text-stone-600 shadow-[0_4px_16px_rgb(0,0,0,0.04)] transition hover:border-teal-200/50 hover:bg-teal-50/70 hover:text-teal-800 dark:border-stone-600/50 dark:bg-stone-900/70 dark:text-stone-400 dark:hover:border-teal-600/35 dark:hover:bg-teal-950/40 dark:hover:text-teal-200"
          @click="showPwdModal = true"
        >
          修改密码
        </button>
        <button
          type="button"
          @click="onLogout"
          class="rounded-[2rem] border border-stone-200/60 bg-white/80 px-4 py-2.5 text-[11px] tracking-[0.28em] text-stone-600 shadow-[0_4px_16px_rgb(0,0,0,0.04)] transition hover:border-stone-300/60 hover:bg-stone-50 hover:text-stone-800 dark:border-stone-600/50 dark:bg-stone-900/70 dark:text-stone-400 dark:hover:border-stone-500/50 dark:hover:bg-stone-800 dark:hover:text-stone-100"
        >
          退出登录
        </button>
      </div>
    </nav>

    <div class="mx-auto mt-8 w-full max-w-5xl flex-1 px-6 sm:px-8">
      <section
        class="relative overflow-hidden rounded-[2.5rem] border border-stone-200/60 bg-gradient-to-b from-[#FDFBF7] via-white/95 to-[#F0EBE3]/50 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:border-stone-600/50 dark:from-stone-900/92 dark:via-stone-900/95 dark:to-stone-950/90 dark:shadow-[0_8px_30px_rgb(0,0,0,0.45)] sm:p-12"
      >
        <div
          aria-hidden="true"
          class="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-teal-100/30 blur-3xl dark:bg-teal-900/35"
        ></div>
        <div
          aria-hidden="true"
          class="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-emerald-100/25 blur-3xl dark:bg-emerald-900/30"
        ></div>

        <div class="relative flex flex-col items-center text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
          <div class="flex flex-col items-center gap-6 sm:flex-row sm:items-end sm:gap-10">
            <div
              class="flex h-36 w-36 shrink-0 items-center justify-center overflow-hidden rounded-[2.5rem] border border-stone-200/60 bg-gradient-to-br from-teal-50/90 via-[#FDFBF7] to-emerald-50/60 p-1.5 shadow-[inset_0_1px_2px_rgb(0,0,0,0.04)] ring-1 ring-white/70 dark:border-stone-600/50 dark:from-teal-950/50 dark:via-stone-900/90 dark:to-emerald-950/40 dark:ring-stone-700/80 sm:h-40 sm:w-40"
            >
              <img
                :src="userCatPortraitUrl"
                alt=""
                width="160"
                height="160"
                class="h-full w-full object-contain object-center"
              />
            </div>
            <div>
              <p
                v-if="userStore.username"
                class="text-[10px] tracking-[0.35em] text-stone-500 dark:text-stone-400"
              >
                {{ userStore.username }}
              </p>
              <p class="mt-2 text-[11px] tracking-[0.45em] text-stone-500 dark:text-stone-400">星座小猫</p>
              <p class="mt-3 text-lg font-light tracking-[0.15em] text-stone-800 dark:text-stone-100">
                {{ userStore.zodiacCatType || '未绑定' }}
              </p>
              <p class="mt-2 text-[11px] text-stone-500 dark:text-stone-400">以生日为引，伴你修行</p>
            </div>
          </div>

          <div
            v-if="SHOW_QI_UI"
            class="mt-10 flex flex-col items-center rounded-[2rem] border border-stone-200/60 bg-white/80 px-8 py-6 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-sm dark:border-stone-600/50 dark:bg-stone-900/75 dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)] sm:mt-0 sm:min-w-[11rem]"
          >
            <span class="text-[10px] tracking-[0.5em] text-stone-500 dark:text-stone-400">累计真气</span>
            <span class="mt-2 font-light text-4xl tabular-nums text-teal-700 dark:text-teal-400 sm:text-5xl">
              {{ userStore.qiScore }}
            </span>
          </div>
        </div>
      </section>

      <!-- 数字禅意看板 -->
      <section
        class="mt-10 rounded-[2.5rem] border border-stone-200/60 bg-white/60 p-6 shadow-[inset_0_1px_1px_rgb(255,255,255,0.55),0_8px_30px_rgb(0,0,0,0.05)] backdrop-blur-md dark:border-stone-600/50 dark:bg-stone-800/40 dark:shadow-[inset_0_1px_1px_rgb(255,255,255,0.05),0_8px_30px_rgb(0,0,0,0.35)] sm:p-10"
      >
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 class="text-sm font-normal tracking-[0.35em] text-stone-800 dark:text-stone-100">
            数字禅意看板
          </h2>
          <div
            class="flex flex-wrap items-center gap-1 rounded-full border border-stone-200/50 bg-white/50 p-1 dark:border-stone-600/45 dark:bg-stone-900/50"
            role="tablist"
            aria-label="看板时间尺度"
          >
            <button
              type="button"
              role="tab"
              :aria-selected="dashboardTab === 'daily'"
              aria-label="今日回顾 Daily"
              title="Daily"
              :class="[tabBtnBase, dashboardTab === 'daily' ? tabBtnActive : tabBtnIdle]"
              @click="dashboardTab = 'daily'"
            >
              今日回顾
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="dashboardTab === 'rhythm'"
              aria-label="近期趋势 Weekly Monthly"
              title="Weekly / Monthly"
              :class="[tabBtnBase, dashboardTab === 'rhythm' ? tabBtnActive : tabBtnIdle]"
              @click="dashboardTab = 'rhythm'"
            >
              近期趋势
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="dashboardTab === 'yearly'"
              aria-label="年度总结 Yearly"
              title="Yearly"
              :class="[tabBtnBase, dashboardTab === 'yearly' ? tabBtnActive : tabBtnIdle]"
              @click="dashboardTab = 'yearly'"
            >
              年度总结
            </button>
          </div>
        </div>

        <div
          class="relative mt-8 min-h-[8rem] overflow-hidden rounded-[2rem] transition-opacity duration-300"
          :class="dashboardLoading || zenBoardLoading ? 'opacity-55' : 'opacity-100'"
        >
          <p
            v-if="dashboardLoading || zenBoardLoading"
            class="absolute inset-0 z-10 flex items-center justify-center text-[11px] tracking-[0.25em] text-stone-500 dark:text-stone-400"
          >
            吐纳载入中…
          </p>

          <!-- 数据概览 -->
          <div class="grid gap-3 sm:grid-cols-3">
            <div
              class="rounded-2xl border border-stone-200/50 bg-white/70 px-4 py-5 shadow-[inset_0_1px_2px_rgb(0,0,0,0.04)] dark:border-stone-600/45 dark:bg-stone-900/55"
            >
              <p class="text-[10px] tracking-[0.35em] text-stone-500 dark:text-stone-400">专注时长</p>
              <p class="mt-3 font-light text-lg tabular-nums text-stone-800 dark:text-stone-100">
                {{ currentStats.focusLabel }}
              </p>
            </div>
            <div
              class="rounded-2xl border border-stone-200/50 bg-white/70 px-4 py-5 shadow-[inset_0_1px_2px_rgb(0,0,0,0.04)] dark:border-stone-600/45 dark:bg-stone-900/55"
            >
              <p class="text-[10px] tracking-[0.35em] text-stone-500 dark:text-stone-400">运动次数</p>
              <p class="mt-3 font-light text-lg tabular-nums text-stone-800 dark:text-stone-100">
                {{ currentStats.stretchCount }} 次
              </p>
            </div>
            <div
              class="rounded-2xl border border-stone-200/50 bg-white/70 px-4 py-5 shadow-[inset_0_1px_2px_rgb(0,0,0,0.04)] dark:border-stone-600/45 dark:bg-stone-900/55"
            >
              <p class="text-[10px] tracking-[0.35em] text-stone-500 dark:text-stone-400">偏好动作</p>
              <p class="mt-3 font-light text-lg text-teal-700 dark:text-teal-400">
                {{ currentStats.preferredMove }}
              </p>
            </div>
          </div>

          <!-- 修习寄语 Zen Letter（近期趋势 monthly / 年度总结 yearly） -->
          <div
            v-show="dashboardTab === 'rhythm' || dashboardTab === 'yearly'"
            class="mt-8 rounded-[2rem] border border-stone-200/50 bg-stone-50/80 px-5 py-6 shadow-[inset_0_2px_12px_rgb(0,0,0,0.04)] backdrop-blur-md dark:border-stone-600/45 dark:bg-stone-800/60 dark:shadow-[inset_0_2px_14px_rgb(0,0,0,0.35)] sm:px-7 sm:py-8"
          >
            <div class="flex items-center gap-2 border-b border-stone-200/40 pb-4 dark:border-stone-600/35">
              <span class="text-lg leading-none" aria-hidden="true">✉️</span>
              <h3 class="text-[13px] font-normal tracking-[0.35em] text-stone-700 dark:text-stone-200">
                修习寄语
              </h3>
              <span class="text-[10px] tracking-[0.15em] text-stone-400 dark:text-stone-500">Zen Letter</span>
            </div>

            <div class="relative mt-5 min-h-[5rem]">
              <div
                v-if="isGeneratingReport"
                class="flex flex-col items-center justify-center gap-4 py-6 text-center"
                role="status"
                aria-live="polite"
              >
                <span
                  class="inline-block h-8 w-8 shrink-0 rounded-full border-2 border-stone-200/80 border-t-teal-500 animate-spin dark:border-stone-600 dark:border-t-teal-400"
                  aria-hidden="true"
                />
                <p class="max-w-sm animate-pulse text-[13px] leading-relaxed text-stone-500 dark:text-stone-400">
                  正在翻阅你的修习印记，执笔撰写寄语...
                </p>
              </div>
              <p
                v-else-if="zenReportContent"
                class="font-serif text-[15px] leading-loose text-stone-600 dark:text-stone-300 sm:text-base"
              >
                {{ zenReportContent }}
              </p>
              <p v-else class="text-[13px] text-stone-400 dark:text-stone-500">暂无寄语。</p>
            </div>
          </div>

          <!-- 气脉热力（仅近期趋势） -->
          <div
            v-show="dashboardTab === 'rhythm'"
            class="mt-8 rounded-[2rem] border border-stone-200/45 bg-stone-50/60 px-4 py-5 dark:border-stone-600/40 dark:bg-stone-900/40"
          >
            <p class="text-[10px] tracking-[0.4em] text-stone-500 dark:text-stone-400">气脉回响 · 近三十日</p>
            <div class="mt-4 flex flex-wrap gap-2">
              <span
                v-for="cell in heatmapLevels"
                :key="cell.id"
                :class="heatDotClass(cell.level)"
                :title="
                  (cell.day ? cell.day + ' · ' : '') + '活跃度 ' + cell.level
                "
              />
            </div>
          </div>

          <!-- 历史回音时间轴 -->
          <div class="mt-10 border-t border-stone-200/40 pt-8 dark:border-stone-600/35">
            <p class="text-[10px] tracking-[0.4em] text-stone-500 dark:text-stone-400">历史回音</p>
            <ul v-if="timelineRows.length" class="relative mt-6 space-y-0">
              <li
                v-for="(row, idx) in timelineRows"
                :key="(row.occurred_at || '') + '-' + idx"
                class="flex gap-3 pb-8 last:pb-0"
              >
                <span
                  class="w-14 shrink-0 pt-0.5 text-right text-[11px] tabular-nums text-stone-500 dark:text-stone-400 sm:w-16"
                >{{ row.time_label }}</span>
                <div class="relative flex w-8 shrink-0 flex-col items-center pt-1">
                  <span
                    v-if="idx < timelineRows.length - 1"
                    class="absolute bottom-0 top-3 w-px bg-stone-200/80 dark:bg-stone-600/60"
                    aria-hidden="true"
                  />
                  <span
                    class="relative z-[1] h-2 w-2 shrink-0 rounded-full border border-stone-300/80 bg-white shadow-[0_0_0_3px_rgba(251,191,36,0.12)] dark:border-stone-500 dark:bg-stone-800 dark:shadow-[0_0_0_3px_rgba(251,191,36,0.08)]"
                  />
                </div>
                <p class="min-w-0 flex-1 text-[13px] font-light leading-relaxed text-stone-700 dark:text-stone-300">
                  {{ row.text }}
                </p>
              </li>
            </ul>
            <p
              v-else
              class="mt-6 text-[13px] font-light text-stone-400 dark:text-stone-500"
            >
              近三日暂无修习回音。
            </p>
          </div>
        </div>
      </section>
    </div>

    <!-- 修改密码弹窗 -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="showPwdModal && userStore.userId"
          class="fixed inset-0 z-[80] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwd-modal-title"
        >
          <button
            type="button"
            class="absolute inset-0 bg-stone-900/25 backdrop-blur-sm dark:bg-black/40"
            aria-label="关闭弹窗"
            @click="closePwdModal"
          />
          <div
            class="relative z-10 w-full max-w-md rounded-[2.5rem] border border-stone-200/60 bg-white/95 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.08)] backdrop-blur-xl dark:border-stone-600/50 dark:bg-stone-900/95 dark:shadow-[0_8px_30px_rgb(0,0,0,0.5)]"
            @click.stop
          >
            <div class="flex items-start justify-between gap-4">
              <h2
                id="pwd-modal-title"
                class="text-sm font-normal tracking-[0.35em] text-stone-800 dark:text-stone-100"
              >
                修改密码
              </h2>
              <button
                type="button"
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-200/60 text-stone-500 transition hover:border-stone-300 hover:bg-stone-100 hover:text-stone-800 dark:border-stone-600 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                aria-label="关闭"
                @click="closePwdModal"
              >
                <svg
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  aria-hidden="true"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p class="mt-2 text-[11px] text-stone-500 dark:text-stone-400">
              新密码至少 8 位；修改成功后请牢记新密码。
            </p>
            <form class="mt-6 flex flex-col gap-4" @submit.prevent="onChangePassword">
              <label class="flex flex-col gap-1.5 text-[10px] tracking-[0.2em] text-stone-500 dark:text-stone-400">
                当前密码
                <input
                  v-model="pwdOld"
                  type="password"
                  autocomplete="current-password"
                  class="rounded-2xl border border-stone-200/60 bg-white/90 px-4 py-2.5 text-sm text-stone-800 outline-none focus:border-teal-300/60 focus:ring-2 focus:ring-teal-100/50 dark:border-stone-600/50 dark:bg-stone-800/90 dark:text-stone-100 dark:focus:border-teal-500/35 dark:focus:ring-teal-900/35"
                />
              </label>
              <label class="flex flex-col gap-1.5 text-[10px] tracking-[0.2em] text-stone-500 dark:text-stone-400">
                新密码
                <input
                  v-model="pwdNew"
                  type="password"
                  autocomplete="new-password"
                  minlength="8"
                  class="rounded-2xl border border-stone-200/60 bg-white/90 px-4 py-2.5 text-sm text-stone-800 outline-none focus:border-teal-300/60 focus:ring-2 focus:ring-teal-100/50 dark:border-stone-600/50 dark:bg-stone-800/90 dark:text-stone-100 dark:focus:border-teal-500/35 dark:focus:ring-teal-900/35"
                />
              </label>
              <label class="flex flex-col gap-1.5 text-[10px] tracking-[0.2em] text-stone-500 dark:text-stone-400">
                确认新密码
                <input
                  v-model="pwdConfirm"
                  type="password"
                  autocomplete="new-password"
                  class="rounded-2xl border border-stone-200/60 bg-white/90 px-4 py-2.5 text-sm text-stone-800 outline-none focus:border-teal-300/60 focus:ring-2 focus:ring-teal-100/50 dark:border-stone-600/50 dark:bg-stone-800/90 dark:text-stone-100 dark:focus:border-teal-500/35 dark:focus:ring-teal-900/35"
                />
              </label>
              <p v-if="pwdErr" class="text-[11px] text-amber-800 dark:text-amber-300/95">{{ pwdErr }}</p>
              <p v-if="pwdMsg" class="text-[11px] text-teal-800 dark:text-teal-300/95">{{ pwdMsg }}</p>
              <button
                type="submit"
                :disabled="pwdLoading"
                class="w-fit rounded-[2rem] bg-teal-600 px-8 py-2.5 text-[11px] tracking-[0.28em] text-white shadow-[0_4px_16px_rgba(13,148,136,0.25)] transition enabled:hover:bg-teal-600/95 disabled:cursor-wait disabled:opacity-70"
              >
                {{ pwdLoading ? '提交中…' : '保存新密码' }}
              </button>
            </form>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
