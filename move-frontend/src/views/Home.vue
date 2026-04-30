<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import MicroWorkoutRunner from '@/components/MicroWorkoutRunner.vue'
import PreWorkoutSelection from '@/components/PreWorkoutSelection.vue'
import WorkoutSettlement from '@/components/WorkoutSettlement.vue'
import { movementRuleById, movementRuleList } from '@/config/movementRules'
import { useUserStore, CAT_STATE } from '@/store/userStore'

const userStore = useUserStore()

/** 运动前选单 */
const showPreWorkout = ref(false)
/** 仅在选择选单并确认后进入边缘检测时挂载摄像头 */
const showEdgeSession = ref(false)
/** @type {import('vue').Ref<{ mode: 'random'|'custom', movementIds: string[] } | null>} */
const workoutSessionPlan = ref(null)
/** 步骤 3 结界/结算会消费；先缓存完整结果 */
const lastWorkoutResult = ref(null)
const showWorkoutSettlement = ref(false)

const PRESETS_MIN = [15, 25, 45]
const MAX_CUSTOM_MIN = 180

const totalDurationSec = ref(25 * 60)
const remainingSec = ref(25 * 60)
const isRunning = ref(false)
const showTimeModal = ref(false)
const showEndDialog = ref(false)
const customMinutes = ref(25)
let timerId = null

const mmss = computed(() => {
  const total = Math.max(0, remainingSec.value)
  const m = String(Math.floor(total / 60)).padStart(2, '0')
  const s = String(total % 60).padStart(2, '0')
  return `${m}:${s}`
})

const canEditDuration = computed(() => !isRunning.value)

const movementRuleNames = computed(() => movementRuleList.map((r) => r.name).join(' · '))

const workoutPlanLabel = computed(() => {
  const p = workoutSessionPlan.value
  if (!p?.movementIds?.length) return movementRuleNames.value
  return p.movementIds.map((id) => movementRuleById[id]?.name || id).join(' · ')
})

const catVisual = computed(() => {
  switch (userStore.currentCatState) {
    case CAT_STATE.HAPPY:
      return {
        label: '得气',
        sub: '心生喜悦',
        orb: 'bg-teal-50/90',
        halo: 'shadow-[0_0_120px_30px_rgba(13,148,136,0.10)]',
        dot: 'bg-teal-400',
      }
    case CAT_STATE.TIRED:
      return {
        label: '力竭',
        sub: '宜静宜养',
        orb: 'bg-stone-100/90',
        halo: 'shadow-[0_0_120px_30px_rgba(120,113,108,0.08)]',
        dot: 'bg-stone-400',
      }
    default:
      return {
        label: '待机',
        sub: '修行如常',
        orb: 'bg-emerald-50/90',
        halo: 'shadow-[0_0_120px_30px_rgba(16,185,129,0.09)]',
        dot: 'bg-emerald-300',
      }
  }
})

function clearTimer() {
  if (timerId) {
    clearInterval(timerId)
    timerId = null
  }
}

function onTick() {
  if (remainingSec.value <= 0) {
    onTimerComplete()
    return
  }
  remainingSec.value -= 1
  userStore.tickSession(1)
  if (remainingSec.value <= 0) {
    onTimerComplete()
  }
}

function onTimerComplete() {
  clearTimer()
  isRunning.value = false
  showEndDialog.value = true
  userStore.endSession({ qualified: false })
}

function startFocus() {
  if (isRunning.value) return
  isRunning.value = true
  showEndDialog.value = false
  if (remainingSec.value <= 0) {
    remainingSec.value = totalDurationSec.value
  }
  userStore.startSession({ durationSec: remainingSec.value })
  timerId = setInterval(onTick, 1000)
}

function pauseFocus() {
  isRunning.value = false
  clearTimer()
}

function abandonFocus() {
  clearTimer()
  isRunning.value = false
  remainingSec.value = totalDurationSec.value
  userStore.resetSession()
  userStore.setCatState(CAT_STATE.TIRED)
}

function openTimeModal() {
  if (!canEditDuration.value) return
  customMinutes.value = Math.max(1, Math.round(totalDurationSec.value / 60))
  showTimeModal.value = true
}

function closeTimeModal() {
  showTimeModal.value = false
}

function applyPreset(minutes) {
  const sec = minutes * 60
  totalDurationSec.value = sec
  remainingSec.value = sec
  showTimeModal.value = false
}

function applyCustomMinutes() {
  const m = Math.min(MAX_CUSTOM_MIN, Math.max(1, Number(customMinutes.value) || 1))
  applyPreset(m)
}

function closeEndDialog() {
  showEndDialog.value = false
  remainingSec.value = totalDurationSec.value
  userStore.setCatState(CAT_STATE.IDLE)
}

function startEdgeMotion() {
  showEndDialog.value = false
  remainingSec.value = totalDurationSec.value
  userStore.setCatState(CAT_STATE.HAPPY)
  showPreWorkout.value = true
}

function enterExercise() {
  pauseFocus()
  userStore.setCatState(CAT_STATE.HAPPY)
  showPreWorkout.value = true
}

function onPreWorkoutConfirm(payload) {
  workoutSessionPlan.value = payload
  showPreWorkout.value = false
  showEdgeSession.value = true
}

function onPreWorkoutCancel() {
  showPreWorkout.value = false
}

function exitEdgeSession() {
  showEdgeSession.value = false
  workoutSessionPlan.value = null
}

function onWorkoutComplete(result) {
  lastWorkoutResult.value = result
  showEdgeSession.value = false
  workoutSessionPlan.value = null
  userStore.setCatState(CAT_STATE.HAPPY)
  showWorkoutSettlement.value = true
}

function onSettlementDone() {
  showWorkoutSettlement.value = false
  lastWorkoutResult.value = null
}

function onSettlementDismiss() {
  showWorkoutSettlement.value = false
  lastWorkoutResult.value = null
  userStore.setCatState(CAT_STATE.IDLE)
}

watch(showTimeModal, (open) => {
  if (open) {
    customMinutes.value = Math.max(1, Math.round(totalDurationSec.value / 60))
  }
})

onUnmounted(() => {
  clearTimer()
})
</script>

<template>
  <div class="flex flex-1 flex-col">
    <main
      class="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 px-6 pb-24 pt-6 sm:px-8 lg:flex-row lg:items-stretch lg:gap-10 lg:px-8 lg:pt-10"
    >
      <!-- 左侧：猫咪视觉 -->
      <section
        class="flex flex-1 flex-col items-center justify-start lg:max-w-md lg:justify-center"
      >
        <div
          class="flex h-52 w-52 items-center justify-center rounded-full ring-1 ring-stone-200/50 transition-all duration-700 sm:h-56 sm:w-56"
          :class="[catVisual.orb, catVisual.halo]"
        >
          <span class="h-2.5 w-2.5 rounded-full transition-colors duration-700" :class="catVisual.dot"></span>
        </div>
        <p class="mt-8 text-sm tracking-[0.5em] text-stone-800">{{ catVisual.label }}</p>
        <p class="mt-2 text-[11px] tracking-[0.3em] text-stone-500">{{ catVisual.sub }}</p>
        <p
          v-if="userStore.zodiacCatType"
          class="mt-1 text-[11px] tracking-[0.3em] text-stone-500"
        >
          {{ userStore.zodiacCatType }}
        </p>
      </section>

      <!-- 右侧：番茄钟卡片 -->
      <section
        class="flex w-full flex-1 flex-col justify-center lg:max-w-md lg:pr-0 xl:max-w-lg"
      >
        <div
          class="rounded-[2.5rem] border border-stone-200/60 bg-white/80 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-md sm:p-10"
        >
          <div class="mb-2 flex items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <p class="text-[11px] tracking-[0.45em] text-stone-500">POMODORO</p>
              <span
                v-show="isRunning"
                class="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.55)]"
                :class="isRunning ? 'animate-pulse' : ''"
                aria-hidden="true"
              />
            </div>
            <p class="text-[10px] text-stone-500">专注</p>
          </div>

          <button
            type="button"
            :disabled="!canEditDuration"
            class="group relative mt-2 w-full text-left transition"
            :class="canEditDuration ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'"
            @click="openTimeModal"
          >
            <span
              class="block w-full text-center font-extralight text-6xl leading-none tracking-tight text-stone-800 tabular-nums transition group-hover:text-teal-800/90 sm:text-7xl"
            >
              {{ mmss }}
            </span>
            <span
              class="mt-2 block text-center text-[10px] tracking-[0.2em] text-stone-500 group-hover:text-stone-600"
            >
              {{ canEditDuration ? '点击调整时长' : '专注中' }}
            </span>
          </button>

          <div class="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-3">
            <button
              v-if="!isRunning"
              type="button"
              @click="startFocus"
              class="flex-1 rounded-[2rem] bg-emerald-600 px-6 py-3 text-xs font-medium tracking-[0.2em] text-white shadow-[0_8px_24px_rgb(5,150,105,0.22)] transition hover:bg-emerald-600/95 sm:min-w-[7rem]"
            >
              开始专注
            </button>
            <button
              v-else
              type="button"
              @click="pauseFocus"
              class="flex-1 rounded-[2rem] border border-stone-200/60 bg-white/90 px-6 py-3 text-xs tracking-[0.2em] text-stone-800 transition hover:bg-[#FDFBF7] sm:min-w-[7rem]"
            >
              暂停
            </button>
            <button
              type="button"
              @click="abandonFocus"
              class="flex-1 rounded-[2rem] border border-stone-200/60 bg-teal-50/80 px-6 py-3 text-xs tracking-[0.2em] text-teal-800 transition hover:bg-teal-100 sm:min-w-[7rem]"
            >
              放弃
            </button>
          </div>

          <div class="mt-10 text-center">
            <button
              type="button"
              @click="enterExercise"
              class="text-xs tracking-[0.45em] text-teal-700 underline-offset-[10px] transition hover:underline"
            >
              进入运动
            </button>
          </div>
        </div>
      </section>
    </main>

    <footer
      class="relative z-10 mx-auto w-full max-w-5xl px-8 pb-10 text-center text-[11px] tracking-[0.4em] text-stone-500"
    >
      静坐养气 · 留白即修行
    </footer>

    <!-- 时长设置：毛玻璃 Modal -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showTimeModal"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="time-modal-title"
      >
        <button
          type="button"
          class="absolute inset-0 bg-stone-800/10 backdrop-blur-sm"
          @click="closeTimeModal"
        />
        <div
          class="relative z-10 w-full max-w-sm rounded-[2.5rem] border border-stone-200/60 bg-[#FDFBF7]/95 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl"
        >
          <h2 id="time-modal-title" class="text-center text-sm tracking-[0.35em] text-stone-800">
            选择专注时长
          </h2>
          <p class="mt-2 text-center text-[11px] text-stone-500">预设或自填分钟，留白由你</p>
          <div class="mt-6 flex flex-wrap justify-center gap-2">
            <button
              v-for="m in PRESETS_MIN"
              :key="m"
              type="button"
              @click="applyPreset(m)"
              class="min-w-[4.5rem] rounded-2xl border border-stone-200/60 bg-white/80 px-4 py-2.5 text-xs text-stone-800 shadow-[0_4px_16px_rgb(0,0,0,0.04)] transition hover:border-teal-300/50 hover:bg-teal-50"
            >
              {{ m }} 分
            </button>
          </div>
          <div
            class="mt-6 flex items-end justify-center gap-3 border-t border-stone-200/50 pt-6"
          >
            <label class="flex flex-1 flex-col gap-1 text-[10px] text-stone-500">
              自定义（分钟）
              <input
                v-model.number="customMinutes"
                type="number"
                :min="1"
                :max="MAX_CUSTOM_MIN"
                class="w-full rounded-2xl border border-stone-200/60 bg-white/90 px-4 py-2.5 text-center text-stone-800 shadow-[inset_0_1px_2px_rgb(0,0,0,0.04)] outline-none focus:border-teal-300/60 focus:ring-2 focus:ring-teal-100/50"
              />
            </label>
            <button
              type="button"
              @click="applyCustomMinutes"
              class="shrink-0 rounded-2xl bg-teal-600 px-4 py-2.5 text-xs text-white shadow-[0_4px_16px_rgb(0,0,0,0.08)] transition hover:bg-teal-600/95"
            >
              应用
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 结束引导 -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="showEndDialog"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-dialog-title"
      >
        <div class="absolute inset-0 bg-stone-800/10 backdrop-blur-sm" @click="closeEndDialog" />
        <div
          class="relative z-10 w-full max-w-md rounded-[2.5rem] border border-stone-200/60 bg-white/90 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.05)] backdrop-blur-md"
        >
          <h2
            id="end-dialog-title"
            class="text-center text-sm font-normal tracking-[0.35em] text-stone-800"
          >
            本轮专注已结束
          </h2>
          <p class="mt-4 text-center text-sm leading-relaxed text-stone-600">
            久坐之后，身轻一寸，气定一分。<br />
            接下来可在本地开启摄像头，完成微运动与边缘检测，温柔唤醒身体。
          </p>
          <div class="mt-8 flex flex-col gap-3">
            <button
              type="button"
              @click="startEdgeMotion"
              class="w-full rounded-[2rem] bg-emerald-600 py-3.5 text-xs tracking-[0.35em] text-white shadow-[0_8px_24px_rgb(5,150,105,0.2)] transition hover:bg-emerald-600/95"
            >
              点击开启边缘检测
            </button>
            <button
              type="button"
              @click="closeEndDialog"
              class="w-full rounded-[2rem] border border-stone-200/60 bg-teal-50 py-3 text-xs tracking-[0.25em] text-teal-800 transition hover:bg-teal-100"
            >
              稍后再说
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 微运动选单：随机 / 自选 -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showPreWorkout"
        class="fixed inset-0 z-[70] flex flex-col items-center justify-center overflow-y-auto p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pre-workout-title"
      >
        <div class="absolute inset-0 bg-stone-800/10 backdrop-blur-sm" @click="onPreWorkoutCancel" />
        <div class="relative z-10 my-auto flex w-full justify-center py-4">
          <PreWorkoutSelection
            @confirm="onPreWorkoutConfirm"
            @cancel="onPreWorkoutCancel"
          />
        </div>
      </div>
    </Transition>

    <!-- 微运动：仅此时挂载摄像头与骨架绘制 -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showEdgeSession"
        class="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-y-auto p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edge-session-title"
      >
        <div class="absolute inset-0 bg-stone-800/15 backdrop-blur-sm" @click="exitEdgeSession" />
        <div
          class="relative z-10 my-auto w-full max-w-5xl rounded-[2.5rem] border border-stone-200/60 bg-[#FDFBF7]/95 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.08)] sm:p-8"
        >
          <h2
            id="edge-session-title"
            class="text-center text-sm font-normal tracking-[0.3em] text-stone-800"
          >
            微运动 · 入境行功
          </h2>
          <p class="mt-2 text-center text-[11px] text-stone-500">
            本地摄像头与骨架仅供姿态可视化；需允许访问摄像头
          </p>
          <p class="mt-3 text-center text-[10px] leading-relaxed text-stone-500">
            本轮：{{ workoutPlanLabel }}
          </p>
          <div class="mt-6 w-full min-w-0">
            <MicroWorkoutRunner
              v-if="workoutSessionPlan?.movementIds?.length"
              :plan="workoutSessionPlan"
              @workout-complete="onWorkoutComplete"
              @exit="exitEdgeSession"
            />
          </div>
        </div>
      </div>
    </Transition>

    <!-- 步骤 4：结界 / 结算 -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showWorkoutSettlement"
        class="fixed inset-0 z-[80] flex flex-col items-center justify-center overflow-y-auto p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settlement-title"
      >
        <div
          class="absolute inset-0 bg-stone-800/15 backdrop-blur-sm"
          @click="onSettlementDismiss"
        />
        <div class="relative z-10 my-auto w-full max-w-md py-4">
          <p id="settlement-title" class="sr-only">微运动结界与收纳真气</p>
          <WorkoutSettlement
            v-if="lastWorkoutResult"
            :result="lastWorkoutResult"
            @done="onSettlementDone"
            @dismiss="onSettlementDismiss"
          />
        </div>
      </div>
    </Transition>
  </div>
</template>
