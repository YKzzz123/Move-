<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { movementRuleById, movementRuleList } from '@/config/movementRules'
import { fetchRecentMicroMovementIdsFromServer } from '@/api/workoutHistoryHint'
import { pickWeightedRandomMovementIds } from '@/utils/weightedMovementPick'
import { useUserStore } from '@/store/userStore'
import { useWorkoutHistoryStore } from '@/store/workoutHistoryStore'

const emit = defineEmits(['confirm', 'cancel'])

const userStore = useUserStore()
const historyStore = useWorkoutHistoryStore()

/** UI 分类顺序：其余类别按中文排序 */
const BODY_PART_ORDER = ['眼部', '手部', '肩颈']

/** @type {import('vue').Ref<'random'|'custom'|null>} */
const mode = ref(null)
const randomIds = ref([])
/** @type {import('vue').Ref<string[]>} */
const customIds = ref([])
const loadingRandom = ref(false)

/** 各部位是否展开 { [bodyPart: string]: boolean }；仅 true 表示展开 */
const expandedBodyPartKeys = ref({})

/**
 * 自选：按 bodyPart 分组，顺序稳定
 * @returns {{ key: string, rules: typeof movementRuleList }[]}
 */
const groupedByBodyPart = computed(() => {
  const map = new Map()
  for (const r of movementRuleList) {
    const p = (r.bodyPart || '其他').trim() || '其他'
    if (!map.has(p)) map.set(p, [])
    map.get(p).push(r)
  }
  const keys = [...map.keys()].sort((a, b) => {
    const ia = BODY_PART_ORDER.indexOf(a)
    const ib = BODY_PART_ORDER.indexOf(b)
    if (ia === -1 && ib === -1) return a.localeCompare(b, 'zh-Hans-CN')
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })
  return keys.map((key) => ({ key, rules: map.get(key) ?? [] }))
})

function resetCustomAccordion() {
  expandedBodyPartKeys.value = {}
}

function pruneExpandedKeys() {
  const validKeys = new Set(groupedByBodyPart.value.map((x) => x.key))
  const next = {}
  for (const k of Object.keys(expandedBodyPartKeys.value)) {
    if (validKeys.has(k)) next[k] = expandedBodyPartKeys.value[k]
  }
  expandedBodyPartKeys.value = next
}

onMounted(() => {
  historyStore.hydrate()
  resetCustomAccordion()
})

watch(
  [mode, groupedByBodyPart],
  () => {
    if (mode.value === 'custom') {
      pruneExpandedKeys()
    }
  },
  { immediate: true },
)

function isPartExpanded(partKey) {
  return expandedBodyPartKeys.value[partKey] === true
}

function togglePart(partKey) {
  const cur = expandedBodyPartKeys.value[partKey] === true
  expandedBodyPartKeys.value = {
    ...expandedBodyPartKeys.value,
    [partKey]: !cur,
  }
}

async function buildRecentIdSet() {
  historyStore.hydrate()
  const local = historyStore.getRecentMovementIdsWithinDays(3)
  const remote = await fetchRecentMicroMovementIdsFromServer(userStore.userId, 3)
  return new Set([...local, ...remote])
}

async function onGenerateRandom() {
  loadingRandom.value = true
  try {
    const recent = await buildRecentIdSet()
    randomIds.value = pickWeightedRandomMovementIds(movementRuleList, recent)
  } finally {
    loadingRandom.value = false
  }
}

function setMode(m) {
  mode.value = m
  if (m === 'random') {
    randomIds.value = []
  }
  if (m === 'custom') {
    customIds.value = []
    resetCustomAccordion()
  }
}

function toggleCustom(id) {
  const cur = customIds.value
  const i = cur.indexOf(id)
  if (i >= 0) {
    customIds.value = cur.filter((x) => x !== id)
    return
  }
  if (cur.length >= 3) return
  customIds.value = [...cur, id]
}

const canConfirm = computed(() => {
  if (mode.value === 'random') return randomIds.value.length >= 1
  if (mode.value === 'custom') {
    const n = customIds.value.length
    return n >= 1 && n <= 3
  }
  return false
})

function onConfirm() {
  if (!canConfirm.value) return
  const movementIds = mode.value === 'random' ? [...randomIds.value] : [...customIds.value]
  emit('confirm', { mode: mode.value, movementIds })
}

/** 随机结果：分【部位】+ 名 · 分隔 */
const randomSegments = computed(() =>
  randomIds.value.map((id) => {
    const r = movementRuleById[id]
    return {
      id,
      part: (r?.bodyPart || '其他').trim() || '其他',
      name: r?.name || id,
    }
  }),
)
</script>

<template>
  <div
    class="w-full max-w-lg rounded-[2.5rem] border border-stone-200/60 bg-[#FDFBF7] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.06)] sm:p-10"
  >
    <h2
      id="pre-workout-title"
      class="text-center text-sm font-normal tracking-[0.35em] text-stone-800"
    >
      微运动 · 选单
    </h2>
    <p class="mt-3 text-center text-[11px] leading-relaxed text-stone-500">
      先择一式再入境：随机偏向近日少练者；自选可勾 1～3 项
    </p>

    <div class="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-4">
      <button
        type="button"
        :class="[
          'rounded-[2rem] border px-5 py-4 text-left transition',
          mode === 'random'
            ? 'border-teal-300/60 bg-white shadow-[0_4px_20px_rgb(0,0,0,0.04)]'
            : 'border-stone-200/60 bg-white/60 hover:border-stone-300/60 hover:bg-white/90',
        ]"
        @click="setMode('random')"
      >
        <span class="text-xs tracking-[0.28em] text-stone-800">随机抽选</span>
        <span class="mt-2 block text-[10px] leading-relaxed text-stone-500">
          加权：近 3 天练过的易降权
        </span>
      </button>
      <button
        type="button"
        :class="[
          'rounded-[2rem] border px-5 py-4 text-left transition',
          mode === 'custom'
            ? 'border-teal-300/60 bg-white shadow-[0_4px_20px_rgb(0,0,0,0.04)]'
            : 'border-stone-200/60 bg-white/60 hover:border-stone-300/60 hover:bg-white/90',
        ]"
        @click="setMode('custom')"
      >
        <span class="text-xs tracking-[0.28em] text-stone-800">自选动作</span>
        <span class="mt-2 block text-[10px] leading-relaxed text-stone-500">
          从列表勾选 1～3 项
        </span>
      </button>
    </div>

    <div
      v-if="mode === 'random'"
      class="mt-8 space-y-4 rounded-[2rem] border border-stone-200/50 bg-white/50 p-5 shadow-[inset_0_1px_0_rgb(255,255,255,0.6)]"
    >
      <p class="text-[11px] leading-relaxed text-stone-600">
        近期做过的动作权重为 <span class="tabular-nums text-stone-800">1</span>，未做或超出窗口为
        <span class="tabular-nums text-stone-800">3</span>，每次抽 1～3 个不重复项。
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="button"
          :disabled="loadingRandom"
          class="rounded-[2rem] bg-teal-600 px-5 py-2.5 text-xs tracking-[0.2em] text-white shadow-[0_4px_16px_rgba(13,148,136,0.25)] transition enabled:hover:bg-teal-600/95 disabled:cursor-wait disabled:opacity-80"
          @click="onGenerateRandom"
        >
          {{ loadingRandom ? '合算中…' : '生成组合' }}
        </button>
        <button
          v-if="randomIds.length"
          type="button"
          :disabled="loadingRandom"
          class="rounded-[2rem] border border-stone-200/60 bg-white/80 px-4 py-2.5 text-[11px] tracking-[0.15em] text-stone-600 transition hover:border-teal-200/60 hover:bg-teal-50/50"
          @click="onGenerateRandom"
        >
          换一批
        </button>
      </div>
      <p
        v-if="randomIds.length"
        class="text-center text-sm leading-relaxed text-stone-800"
      >
        <template v-for="(seg, i) in randomSegments" :key="seg.id">
          <span v-if="i > 0" class="mx-0.5 text-stone-400">·</span>
          <span class="text-teal-700/70">【{{ seg.part }}】</span><span>{{ seg.name }}</span>
        </template>
      </p>
      <p
        v-else
        class="text-center text-[11px] text-stone-400"
      >
        点击「生成组合」
      </p>
    </div>

    <div
      v-else-if="mode === 'custom'"
      class="mt-8 space-y-4"
      role="group"
      aria-label="自选动作，最多三项"
    >
      <p class="px-1 text-[10px] text-stone-500">
        已选 {{ customIds.length }} / 3
      </p>

      <div
        class="custom-accordion-scroll max-h-72 overflow-y-auto overscroll-contain pr-2"
      >
        <div class="space-y-2">
          <div
            v-for="group in groupedByBodyPart"
            :key="group.key"
            class="overflow-hidden rounded-[1.25rem] border border-stone-200/50 bg-white/40 shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
          >
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 rounded-[1.25rem] px-4 py-3.5 text-left transition hover:bg-stone-50"
              :aria-expanded="isPartExpanded(group.key)"
              :aria-controls="`accordion-panel-${group.key}`"
              @click="togglePart(group.key)"
            >
              <span class="text-xs tracking-[0.25em] text-stone-800">{{ group.key }}</span>
              <svg
                class="h-4 w-4 shrink-0 text-stone-500 transition-transform duration-300 ease-out"
                :class="isPartExpanded(group.key) ? 'rotate-180' : ''"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M5 7.5 L10 12.5 L15 7.5" />
              </svg>
            </button>

            <div
              class="grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
              :class="isPartExpanded(group.key) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
            >
              <div class="min-h-0">
                <div
                  :id="`accordion-panel-${group.key}`"
                  class="space-y-2 border-t border-stone-200/40 px-3 pb-3 pt-2"
                  role="region"
                >
                  <label
                    v-for="r in group.rules"
                    :key="r.id"
                    :class="[
                      'flex cursor-pointer items-start gap-3 rounded-[1.5rem] border p-4 transition',
                      customIds.includes(r.id)
                        ? 'border-teal-300/50 bg-white shadow-[0_4px_16px_rgb(0,0,0,0.04)]'
                        : 'border-stone-200/50 bg-white/50 hover:border-stone-300/50',
                    ]"
                  >
                    <input
                      type="checkbox"
                      class="mt-0.5 h-4 w-4 shrink-0 rounded border-stone-300 text-teal-600 focus:ring-teal-500/30"
                      :checked="customIds.includes(r.id)"
                      :disabled="!customIds.includes(r.id) && customIds.length >= 3"
                      @change="toggleCustom(r.id)"
                    />
                    <span class="min-w-0">
                      <span class="text-xs tracking-[0.2em] text-stone-800">{{ r.name }}</span>
                      <span class="mt-0.5 block text-[10px] text-stone-500">
                        {{ r.instructionSummary }}
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-end">
      <button
        type="button"
        class="rounded-[2rem] border border-stone-200/60 bg-white/80 px-6 py-2.5 text-xs tracking-[0.2em] text-stone-600 transition hover:bg-stone-50"
        @click="emit('cancel')"
      >
        返回
      </button>
      <button
        type="button"
        :disabled="!canConfirm"
        class="rounded-[2rem] bg-teal-600 px-6 py-2.5 text-xs tracking-[0.2em] text-white shadow-[0_4px_20px_rgba(13,148,136,0.2)] transition enabled:hover:bg-teal-600/95 disabled:cursor-not-allowed disabled:opacity-50"
        @click="onConfirm"
      >
        开始
      </button>
    </div>
  </div>
</template>

<style scoped>
.custom-accordion-scroll {
  scrollbar-width: thin;
  scrollbar-color: #e7e5e4 transparent;
}

.custom-accordion-scroll::-webkit-scrollbar {
  width: 5px;
}

.custom-accordion-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.custom-accordion-scroll::-webkit-scrollbar-thumb {
  background-color: #e7e5e4;
  border-radius: 9999px;
}

.custom-accordion-scroll::-webkit-scrollbar-thumb:hover {
  background-color: #d6d3d1;
}
</style>
