<script setup>
import { computed, ref, watch } from 'vue'
import { saveMicroWorkoutFinish } from '@/api/microWorkout'
import { useUserStore, CAT_STATE } from '@/store/userStore'
import { useWorkoutHistoryStore } from '@/store/workoutHistoryStore'

const props = defineProps({
  /** 与 MicroWorkoutRunner 中 buildResultPayload 结构一致 */
  result: { type: Object, default: null },
})

const emit = defineEmits(['done', 'dismiss'])

const userStore = useUserStore()
const historyStore = useWorkoutHistoryStore()

const isSubmitting = ref(false)
const errorMsg = ref('')
const displayQi = ref(0)
const displayCal = ref(0)
const glowOn = ref(true)

const reduceMotion = ref(
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
)

const targetQi = computed(() => Math.max(0, Math.round(props.result?.totalQi ?? 0)))
const targetCal = computed(() => Math.max(0, Math.round(props.result?.totalCalories ?? 0)))

const bodyPartBlocks = computed(() => {
  const items = props.result?.items
  if (!Array.isArray(items) || !items.length) return []
  const byPart = new Map()
  for (const it of items) {
    if (!it || (it.completedSets ?? 0) <= 0) continue
    const p = (it.bodyPart || '其他').trim() || '其他'
    if (!byPart.has(p)) {
      byPart.set(p, { bodyPart: p, benefits: new Set() })
    }
    const b = (it.benefits || '').trim()
    if (b) byPart.get(p).benefits.add(b)
  }
  return [...byPart.values()].map((x) => ({
    bodyPart: x.bodyPart,
    benefits: [...x.benefits],
  }))
})

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3
}

function runNumberRaf(from, to, setVal, durationMs) {
  if (reduceMotion.value) {
    setVal(to)
    return
  }
  const start = performance.now()
  const d = to - from
  function step(now) {
    const t = Math.min(1, (now - start) / durationMs)
    setVal(from + d * easeOutCubic(t))
    if (t < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

function animateIn() {
  const qi0 = 0
  const cal0 = 0
  displayQi.value = qi0
  displayCal.value = cal0
  const tq = targetQi.value
  const tc = targetCal.value
  runNumberRaf(qi0, tq, (v) => {
    displayQi.value = v
  }, 900)
  runNumberRaf(cal0, tc, (v) => {
    displayCal.value = v
  }, 700)
  glowOn.value = true
}

watch(
  () => props.result,
  (r) => {
    if (r) {
      errorMsg.value = ''
      animateIn()
    }
  },
  { immediate: true },
)

async function onCollect() {
  errorMsg.value = ''
  const r = props.result
  if (!r) {
    emit('done')
    return
  }
  isSubmitting.value = true
  const qiN = targetQi.value
  try {
    if (userStore.userId) {
      const res = await saveMicroWorkoutFinish(userStore.userId, {
        total_qi: qiN,
        total_calories: targetCal.value,
        plan_mode: r.planMode || 'custom',
        items: r.items || [],
      })
      const next = res?.qi_score
      if (next != null) userStore.qiScore = Number(next)
      else userStore.qiScore = (userStore.qiScore || 0) + qiN
      userStore._persistToStorage()
    } else {
      userStore.setCatState(CAT_STATE.HAPPY)
    }
    historyStore.recordFromWorkoutItems(r.items)
    userStore.setCatState(CAT_STATE.HAPPY)
    emit('done')
  } catch (e) {
    errorMsg.value = '与服务器同步失败。已将真气记入本机、并写入选单降权。'
    historyStore.recordFromWorkoutItems(r.items)
    if (userStore.userId) {
      userStore.qiScore = (userStore.qiScore || 0) + qiN
      userStore._persistToStorage()
    }
    userStore.setCatState(CAT_STATE.HAPPY)
    emit('done')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div
    v-if="result"
    class="w-full max-w-md rounded-[2.5rem] border border-stone-200/60 bg-[#FDFBF7] p-8 shadow-[0_12px_40px_rgba(0,0,0,0.07)] sm:p-10"
  >
    <div
      class="text-center"
      :class="[
        'rounded-[2rem] px-4 py-8 transition-shadow duration-1000',
        glowOn ? 'settle-qi-halo' : '',
      ]"
    >
      <p class="text-[10px] tracking-[0.5em] text-stone-500">得气</p>
      <p class="mt-4 text-4xl font-extralight tabular-nums text-stone-800 sm:text-5xl">
        +{{ Math.round(displayQi) }}
        <span class="text-base font-light tracking-[0.2em] text-teal-800"> 真气</span>
      </p>
      <p class="mt-2 text-sm tabular-nums text-stone-600">
        约消耗 <span class="text-stone-800">{{ Math.round(displayCal) }}</span> 千卡
      </p>
    </div>

    <div class="mt-8 border-t border-stone-200/50 pt-6">
      <h3 class="text-center text-[11px] font-normal tracking-[0.4em] text-stone-800">
        本次所及
      </h3>
      <ul
        v-if="bodyPartBlocks.length"
        class="mt-4 space-y-4"
      >
        <li
          v-for="(b, i) in bodyPartBlocks"
          :key="i + b.bodyPart"
          class="rounded-2xl border border-stone-200/50 bg-white/50 px-4 py-3 text-left shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
        >
          <p class="text-xs tracking-[0.2em] text-teal-800">{{ b.bodyPart }}</p>
          <p
            v-for="(line, j) in b.benefits"
            :key="j"
            class="mt-1.5 text-[12px] leading-relaxed text-stone-600"
          >
            {{ line }}
          </p>
        </li>
      </ul>
      <p
        v-else
        class="mt-4 text-center text-xs text-stone-500"
      >
        本轮无完成组，亦可静心为功
      </p>
    </div>

    <p
      v-if="errorMsg"
      class="mt-4 text-center text-[11px] text-amber-800/90"
    >
      {{ errorMsg }}
    </p>

    <div class="mt-8 flex flex-col items-center gap-3">
      <button
        type="button"
        :disabled="isSubmitting"
        class="w-full max-w-xs rounded-[2rem] bg-teal-600 px-8 py-3.5 text-xs tracking-[0.35em] text-white shadow-[0_8px_28px_rgba(13,148,136,0.28)] transition enabled:hover:bg-teal-600/95 disabled:cursor-wait disabled:opacity-80"
        @click="onCollect"
      >
        {{ isSubmitting ? '收纳中…' : '收纳真气' }}
      </button>
      <button
        type="button"
        class="text-[10px] tracking-[0.2em] text-stone-500 underline-offset-4 transition hover:text-stone-700 hover:underline"
        @click="emit('dismiss')"
      >
        稍后再说
      </button>
    </div>
  </div>
</template>

<style scoped>
.settle-qi-halo {
  animation: settle-qi-pulse 2.4s ease-in-out infinite;
  box-shadow: 0 0 24px 10px rgba(13, 148, 136, 0.12);
}

@keyframes settle-qi-pulse {
  0%,
  100% {
    box-shadow: 0 0 20px 8px rgba(13, 148, 136, 0.14);
  }
  50% {
    box-shadow: 0 0 40px 16px rgba(13, 148, 136, 0.28);
  }
}

@media (prefers-reduced-motion: reduce) {
  .settle-qi-halo {
    animation: none;
    box-shadow: 0 0 20px 8px rgba(13, 148, 136, 0.12);
  }
}
</style>
