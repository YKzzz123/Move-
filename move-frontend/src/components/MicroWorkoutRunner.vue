<script setup>
import { ref, computed, watch } from 'vue'
import CameraDetector from '@/components/CameraDetector.vue'
import { movementRuleById } from '@/config/movementRules'

const props = defineProps({
  plan: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['workoutComplete', 'exit'])

const cameraRef = ref(null)
const MAX_TARGET_SETS = 12

/**
 * @typedef {{ movementId: string, currentSet: number, targetSets: number, skipped: boolean }} QueuedMover
 * @type {import('vue').Ref<QueuedMover[]>}
 */
const queue = ref([])

const currentIndex = ref(0)
const sessionFinished = ref(false)

function buildQueue() {
  const ids = props.plan?.movementIds || []
  return ids
    .filter((id) => movementRuleById[id])
    .map((id) => {
      const r = movementRuleById[id]
      return {
        movementId: id,
        currentSet: 0,
        targetSets: Math.max(1, r.defaultSets ?? 3),
        skipped: false,
      }
    })
}

watch(
  () => props.plan,
  (p) => {
    if (!p?.movementIds?.length) {
      queue.value = []
      return
    }
    queue.value = buildQueue()
    currentIndex.value = 0
    sessionFinished.value = false
  },
  { immediate: true, deep: true },
)

const currentItem = computed(() => {
  const q = queue.value
  const i = currentIndex.value
  if (!q.length || i < 0 || i >= q.length) return null
  return q[i]
})

const currentRule = computed(() => {
  const id = currentItem.value?.movementId
  return id ? movementRuleById[id] : null
})

const trackRuleId = computed(() => currentItem.value?.movementId ?? null)

const progressLabel = computed(() => {
  const cur = currentItem.value
  if (!cur) return ''
  return `已完成 ${cur.currentSet} / 共 ${cur.targetSets} 组`
})

const queuePreview = computed(() =>
  queue.value.map((q, i) => {
    const r = movementRuleById[q.movementId]
    const name = r?.name || q.movementId
    const mark =
      i < currentIndex.value ? 'done' : i === currentIndex.value ? 'current' : 'todo'
    return { name, mark, i }
  }),
)

function bumpTarget(delta) {
  const cur = currentItem.value
  if (!cur || cur.skipped || sessionFinished.value) return
  const next = Math.min(MAX_TARGET_SETS, Math.max(1, cur.targetSets + delta))
  if (next < cur.currentSet) {
    cur.targetSets = cur.currentSet
  } else {
    cur.targetSets = next
  }
  tryAdvanceIfTargetMet()
}

function tryAdvanceIfTargetMet() {
  const cur = currentItem.value
  if (!cur || cur.skipped) return
  if (cur.currentSet >= cur.targetSets) {
    goNextOrFinish()
  }
}

function goNextOrFinish() {
  if (sessionFinished.value) return
  if (currentIndex.value < queue.value.length - 1) {
    currentIndex.value += 1
  } else {
    finishWorkout()
  }
}

function onActionComplete({ id }) {
  if (sessionFinished.value) return
  const cur = currentItem.value
  if (!cur || id !== cur.movementId || cur.skipped) return
  if (cur.currentSet < cur.targetSets) {
    cur.currentSet += 1
  }
  if (cur.currentSet >= cur.targetSets) {
    goNextOrFinish()
  }
}

function skipCurrent() {
  if (sessionFinished.value) return
  const cur = currentItem.value
  if (!cur) return
  cur.skipped = true
  goNextOrFinish()
}

function buildResultPayload() {
  const planMode = props.plan?.mode || 'custom'
  let totalQi = 0
  let totalCal = 0
  const items = queue.value.map((q) => {
    const r = movementRuleById[q.movementId]
    const name = r?.name || q.movementId
    const done = q.currentSet
    const qi = done * (r?.qiPerSet ?? 0)
    const cal = done * (r?.caloriesPerSet ?? 0)
    totalQi += qi
    totalCal += cal
    return {
      movementId: q.movementId,
      name,
      targetSets: q.targetSets,
      completedSets: q.currentSet,
      skipped: q.skipped,
      qiGained: qi,
      calories: cal,
      bodyPart: r?.bodyPart,
      benefits: r?.benefits,
    }
  })
  return {
    planMode,
    items,
    totalQi,
    totalCalories: totalCal,
  }
}

function finishWorkout() {
  if (sessionFinished.value) return
  sessionFinished.value = true
  try {
    cameraRef.value?.stop?.()
  } catch {
    /* ignore */
  }
  emit('workoutComplete', buildResultPayload())
}

function onEndSession() {
  if (!sessionFinished.value) {
    try {
      cameraRef.value?.stop?.()
    } catch {
      /* ignore */
    }
  }
  emit('exit')
}
</script>

<template>
  <div v-if="queue.length" class="w-full">
    <div
      class="flex flex-col gap-8 lg:flex-row lg:items-stretch lg:gap-8 lg:justify-center"
    >
      <aside
        class="order-2 flex w-full max-w-md shrink-0 flex-col rounded-[2.5rem] border border-stone-200/60 bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] lg:order-1 lg:w-80"
      >
        <p
          v-if="currentRule"
          class="text-[10px] tracking-[0.4em] text-stone-500"
        >
          当前
        </p>
        <h3
          v-if="currentRule"
          class="mt-1 text-sm font-normal tracking-[0.25em] text-stone-800"
        >
          {{ currentRule.name }}
        </h3>
        <p
          v-if="currentRule"
          class="mt-3 text-[12px] leading-relaxed text-stone-600"
        >
          {{ currentRule.instruction }}
        </p>

        <div
          v-if="currentItem && currentRule"
          class="mt-6 rounded-[1.5rem] border border-stone-200/50 bg-[#FDFBF7] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
        >
          <p class="text-center text-2xl font-extralight tabular-nums text-teal-800">
            {{ progressLabel }}
          </p>
          <p class="mt-1 text-center text-[10px] text-stone-500">
            {{ currentRule.instructionSummary }}
          </p>
          <div class="mt-4 flex items-center justify-center gap-2">
            <span class="text-[10px] text-stone-500">本动作目标组</span>
            <button
              type="button"
              :disabled="currentItem.targetSets <= 1 || currentItem.skipped"
              class="h-8 w-8 rounded-2xl border border-stone-200/60 bg-white text-stone-600 transition enabled:hover:border-teal-200 enabled:hover:bg-teal-50/60 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="减少目标组"
              @click="bumpTarget(-1)"
            >
              −
            </button>
            <span
              class="min-w-[2.5rem] text-center text-sm tabular-nums text-stone-800"
            >{{ currentItem.targetSets }}</span>
            <button
              type="button"
              :disabled="currentItem.targetSets >= MAX_TARGET_SETS || currentItem.skipped"
              class="h-8 w-8 rounded-2xl border border-stone-200/60 bg-white text-stone-600 transition enabled:hover:border-teal-200 enabled:hover:bg-teal-50/60 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="增加目标组"
              @click="bumpTarget(1)"
            >
              +
            </button>
          </div>
        </div>

        <ul
          v-if="queuePreview.length"
          class="mt-6 space-y-2 border-t border-stone-200/40 pt-4 text-[10px] text-stone-500"
        >
          <li
            v-for="(row, i) in queuePreview"
            :key="row.i + row.name"
            class="flex items-center justify-between"
          >
            <span
              :class="{
                'text-teal-800': row.mark === 'current',
                'text-stone-400 line-through': row.mark === 'done',
              }"
            >{{ i + 1 }}. {{ row.name }}</span>
            <span v-if="row.mark === 'current'" class="text-stone-400">进行</span>
            <span v-else-if="row.mark === 'done'" class="text-stone-400">已过</span>
            <span v-else>待行</span>
          </li>
        </ul>

        <div class="mt-8">
          <button
            type="button"
            :disabled="sessionFinished"
            class="w-full rounded-[2rem] border border-dashed border-stone-200/80 bg-white/30 py-2.5 text-center text-[11px] tracking-[0.2em] text-stone-500 transition hover:border-stone-300/80 hover:bg-stone-50/80 disabled:opacity-40"
            @click="skipCurrent"
          >
            跳过当前动作
          </button>
        </div>
      </aside>

      <div class="order-1 min-w-0 flex-1 lg:order-2">
        <CameraDetector
          ref="cameraRef"
          :track-rule-id="trackRuleId"
          :sequence-stamp="currentIndex"
          @action-complete="onActionComplete"
        />
      </div>
    </div>

    <div class="mt-8 flex justify-center">
      <button
        type="button"
        class="rounded-[2rem] border border-stone-200/60 bg-teal-50 px-8 py-2.5 text-xs tracking-[0.25em] text-teal-800 transition hover:bg-teal-100"
        @click="onEndSession"
      >
        结束运动
      </button>
    </div>
  </div>
  <p
    v-else
    class="py-8 text-center text-sm text-stone-500"
  >
    无有效动作，请返回选单
  </p>
</template>
