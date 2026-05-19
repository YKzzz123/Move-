<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { fetchMicroWorkoutCalendarDates } from '@/api/microWorkout'
import { useDailyWorkoutCheckinStore } from '@/store/dailyWorkoutCheckinStore'
import { useUserStore } from '@/store/userStore'

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日']

const userStore = useUserStore()
const checkinStore = useDailyWorkoutCheckinStore()

const expanded = ref(false)

const now = new Date()
const viewYear = ref(now.getFullYear())
const viewMonth = ref(now.getMonth() + 1)

function ymdFromParts(y, m, dayNum) {
  return `${y}-${String(m).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
}

function todayYmd() {
  const d = new Date()
  return ymdFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

const gridCells = computed(() => {
  const y = viewYear.value
  const m = viewMonth.value
  const first = new Date(y, m - 1, 1)
  const lastDay = new Date(y, m, 0).getDate()
  const pad = (first.getDay() + 6) % 7
  const dates = checkinStore.activeDates
  const today = todayYmd()

  /** @type {{ type: string, day?: number, ymd?: string, hasWorkout?: boolean, isToday?: boolean }[]} */
  const cells = []
  for (let i = 0; i < pad; i += 1) {
    cells.push({ type: 'empty' })
  }
  for (let d = 1; d <= lastDay; d += 1) {
    const ymd = ymdFromParts(y, m, d)
    cells.push({
      type: 'day',
      day: d,
      ymd,
      hasWorkout: dates.includes(ymd),
      isToday: ymd === today,
    })
  }
  return cells
})

const monthTitle = computed(
  () => `${viewYear.value}年 ${viewMonth.value}月`,
)

async function syncServerMonth() {
  const uid = userStore.userId
  if (!uid) return
  try {
    const res = await fetchMicroWorkoutCalendarDates(uid, viewYear.value, viewMonth.value)
    checkinStore.mergeServerDates(res?.dates)
  } catch {
    /* 离线或接口不可用时仅依靠本地 */
  }
}

function prevMonth() {
  let y = viewYear.value
  let mo = viewMonth.value - 1
  if (mo < 1) {
    mo = 12
    y -= 1
  }
  viewYear.value = y
  viewMonth.value = mo
}

function nextMonth() {
  let y = viewYear.value
  let mo = viewMonth.value + 1
  if (mo > 12) {
    mo = 1
    y += 1
  }
  viewYear.value = y
  viewMonth.value = mo
}

function togglePanel() {
  expanded.value = !expanded.value
}

function onDocKeydown(e) {
  if (e.key === 'Escape') expanded.value = false
}

onMounted(() => {
  checkinStore.hydrate()
  syncServerMonth()
  document.addEventListener('keydown', onDocKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onDocKeydown)
})

watch([viewYear, viewMonth, () => userStore.userId], () => {
  checkinStore.hydrate()
  syncServerMonth()
})
</script>

<template>
  <div
    class="pointer-events-none fixed z-40 flex flex-col items-end gap-2 select-none
           top-[max(5.5rem,env(safe-area-inset-top)+4.75rem)]
           right-[max(1.25rem,calc((100vw-64rem)/2+2rem))]
           sm:top-[6.75rem]"
    aria-label="每日运动打卡"
  >
    <button
      type="button"
      class="checkin-flag-btn pointer-events-auto flex h-11 w-11 items-center justify-center rounded-2xl
             border border-teal-400/35 bg-teal-500/[0.14] text-teal-600 shadow-[0_4px_20px_rgba(13,148,136,0.18)]
             backdrop-blur-md transition hover:border-teal-400/55 hover:bg-teal-500/[0.22] hover:text-teal-500
             focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/50 focus-visible:ring-offset-2
             focus-visible:ring-offset-[#F7F5F0] dark:border-teal-500/30 dark:bg-teal-500/[0.12] dark:text-teal-300
             dark:shadow-[0_4px_24px_rgba(45,212,191,0.12)] dark:hover:border-teal-400/45 dark:hover:bg-teal-500/[0.2]
             dark:hover:text-teal-200 dark:focus-visible:ring-teal-500/40 dark:focus-visible:ring-offset-[#0c1211]"
      :aria-expanded="expanded"
      aria-controls="workout-checkin-panel"
      :title="expanded ? '收起打卡日历' : '展开运动打卡'"
      @click="togglePanel"
    >
      <svg
        class="checkin-flag-icon h-[1.35rem] w-[1.05rem] shrink-0"
        viewBox="0 0 20 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M4 3v22"
          stroke="currentColor"
          stroke-width="1.65"
          stroke-linecap="round"
        />
        <path
          d="M6.2 5.2L17 10.4 6.2 16V5.2z"
          fill="currentColor"
          fill-opacity="0.88"
        />
      </svg>
    </button>

    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-95 translate-y-1"
      enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100 translate-y-0"
      leave-to-class="opacity-0 scale-95 translate-y-1"
    >
      <div
        v-show="expanded"
        id="workout-checkin-panel"
        class="pointer-events-auto w-[min(18.5rem,calc(100vw-2.5rem))] origin-top-right"
      >
        <div
          class="rounded-[1.75rem] border border-stone-200/65 bg-[#FDFBF7]/92 px-3 py-3 shadow-[0_10px_40px_rgba(0,0,0,0.08)] backdrop-blur-lg dark:border-stone-600/50 dark:bg-stone-900/88 dark:shadow-[0_12px_44px_rgba(0,0,0,0.5)]"
        >
          <div class="flex items-center justify-between gap-2 px-1">
            <p class="text-[10px] font-medium tracking-[0.35em] text-stone-600 dark:text-stone-300">
              运动打卡
            </p>
            <div class="flex items-center gap-0.5">
              <button
                type="button"
                class="flex h-7 w-7 items-center justify-center rounded-xl text-stone-500 transition hover:bg-stone-100/90 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800/80 dark:hover:text-stone-100"
                aria-label="上一月"
                @click="prevMonth"
              >
                ‹
              </button>
              <button
                type="button"
                class="flex h-7 w-7 items-center justify-center rounded-xl text-stone-500 transition hover:bg-stone-100/90 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800/80 dark:hover:text-stone-100"
                aria-label="下一月"
                @click="nextMonth"
              >
                ›
              </button>
            </div>
          </div>
          <p class="mt-1 px-1 text-center text-[11px] tabular-nums tracking-[0.15em] text-stone-800 dark:text-stone-100">
            {{ monthTitle }}
          </p>

          <div class="mt-2 grid grid-cols-7 gap-y-0.5 text-center">
            <span
              v-for="w in WEEK_LABELS"
              :key="w"
              class="pb-1 text-[9px] font-normal text-stone-400 dark:text-stone-500"
            >
              {{ w }}
            </span>
            <template v-for="(cell, i) in gridCells" :key="i">
              <div v-if="cell.type === 'empty'" class="h-9" />
              <div
                v-else
                class="flex h-9 flex-col items-center justify-start gap-0.5 pt-0.5"
                :class="cell.isToday ? 'rounded-lg ring-1 ring-teal-400/50 dark:ring-teal-500/40' : ''"
              >
                <span
                  class="text-[11px] tabular-nums leading-none text-stone-700 dark:text-stone-200"
                  :class="cell.isToday ? 'font-medium text-teal-800 dark:text-teal-200' : ''"
                >
                  {{ cell.day }}
                </span>
                <span
                  v-if="cell.hasWorkout"
                  class="checkin-dot checkin-dot--on"
                  aria-hidden="true"
                />
                <span
                  v-else
                  class="checkin-dot checkin-dot--off"
                  aria-hidden="true"
                />
              </div>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.checkin-flag-btn {
  filter: drop-shadow(0 0 10px rgba(45, 212, 191, 0.35)) drop-shadow(0 0 4px rgba(255, 255, 255, 0.25));
}

:root.dark .checkin-flag-btn {
  filter: drop-shadow(0 0 12px rgba(45, 212, 191, 0.22)) drop-shadow(0 0 6px rgba(255, 255, 255, 0.08));
}

.checkin-flag-icon {
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.12));
}

.checkin-dot {
  display: block;
  border-radius: 9999px;
  flex-shrink: 0;
}

.checkin-dot--on {
  width: 0.34rem;
  height: 0.34rem;
  margin-top: 1px;
  background: rgb(34, 197, 94);
  box-shadow:
    0 0 5px 2px rgba(255, 255, 255, 0.65),
    0 0 12px 4px rgba(34, 197, 94, 0.45);
}

.checkin-dot--off {
  width: 0.28rem;
  height: 0.28rem;
  margin-top: 2px;
  background: rgb(168, 162, 158);
  opacity: 0.55;
}

:root.dark .checkin-dot--off {
  background: rgb(120, 113, 108);
  opacity: 0.65;
}

@media (prefers-reduced-motion: reduce) {
  .checkin-flag-btn {
    filter: drop-shadow(0 0 6px rgba(45, 212, 191, 0.2));
  }

  .checkin-dot--on {
    box-shadow:
      0 0 4px 1px rgba(255, 255, 255, 0.5),
      0 0 8px 2px rgba(34, 197, 94, 0.35);
  }
}
</style>
