<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { movementRuleList } from '@/config/movementRules'
import bodyDiagramUrl from '@/assets/body/body.svg?url'
import bodyBackDiagramUrl from '@/assets/body/body-back.svg?url'

const BODY_PART_ORDER = ['眼部', '手部', '肩颈', '其他']
const CANVAS_WIDTH = 524
const CANVAS_HEIGHT = 1044

/** 伪运镜：按当前聚焦部位缩放与位移（百分比） */
const CAMERA_BY_PART = {
  眼部: { scale: 2.35, tx: 0, ty: 35 },
  手部: { scale: 1.8, tx: -20, ty: 0 },
  肩颈: { scale: 1.8, tx: 0, ty: 30 },
  其他: { scale: 1.08, tx: 0, ty: 4 },
}

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

/** 当前展开的手风琴部位 key -> boolean */
const expandedBodyParts = ref({})
/** 当前运镜/导航聚焦的部位 */
const activeBodyPart = ref(null)
/** 悬浮高亮的动作 id */
const hoveredRuleId = ref(null)
/** 点击锁定的动作 id（再次点击同条取消） */
const pinnedRuleId = ref(null)
/** 当前展开详情的动作 id */
const expandedActionId = ref(null)

const highlightRuleId = computed(() => pinnedRuleId.value || hoveredRuleId.value)
const activeBodyImageUrl = computed(() =>
  activeBodyPart.value === '肩颈' ? bodyBackDiagramUrl : bodyDiagramUrl,
)

/** 仅施加在「运镜 Canvas」上：先居中对齐视口，再 scale / pan，与底图+穴位同层绑定 */
const canvasTransformStyle = computed(() => {
  const key = activeBodyPart.value || '其他'
  const c = CAMERA_BY_PART[key] ?? CAMERA_BY_PART['其他']
  return {
    transform: `translate(-50%, -50%) scale(${c.scale}) translate(${c.tx}%, ${c.ty}%)`,
    transformOrigin: '50% 38%',
    transition: 'transform 0.8s cubic-bezier(0.25, 1, 0.5, 1)',
    willChange: 'transform',
  }
})

/** 所有穴位展平；labelX/labelY 为空时回退到点位 */
const allDots = computed(() => {
  const out = []
  for (const r of movementRuleList) {
    for (const ap of r.acupoints || []) {
      if (ap.name == null || ap.x == null || ap.y == null) continue
      out.push({
        ruleId: r.id,
        name: String(ap.name),
        x: Number(ap.x),
        y: Number(ap.y),
        labelX: ap.labelX != null ? Number(ap.labelX) : Number(ap.x),
        labelY: ap.labelY != null ? Number(ap.labelY) : Number(ap.y),
      })
    }
  }
  return out
})

const litAcupoints = computed(() => {
  if (highlightRuleId.value == null) return []
  return allDots.value.filter((d) => d.ruleId === highlightRuleId.value)
})

function toCanvasX(percent) {
  return (Number(percent) / 100) * CANVAS_WIDTH
}

function toCanvasY(percent) {
  return (Number(percent) / 100) * CANVAS_HEIGHT
}

function labelAnchor(d) {
  return d.labelX >= d.x ? 'start' : 'end'
}

function labelTextX(d) {
  return toCanvasX(d.labelX) + (labelAnchor(d) === 'start' ? 6 : -6)
}

// 临时开发工具：点击画布测量百分比坐标
const debugClickPoint = ref(null)

function handleCanvasClick(event) {
  const target = event.currentTarget
  if (!target) return

  const rect = target.getBoundingClientRect()
  const rawX = ((event.clientX - rect.left) / rect.width) * 100
  const rawY = ((event.clientY - rect.top) / rect.height) * 100

  const x = Number(Math.min(100, Math.max(0, rawX)).toFixed(1))
  const y = Number(Math.min(100, Math.max(0, rawY)).toFixed(1))

  debugClickPoint.value = { x, y }
  console.log('点击点坐标:', { x, y })
}

function toggleAccordion(key) {
  // 切换大部位时，清空上一个部位的穴位高亮
  hoveredRuleId.value = null
  pinnedRuleId.value = null
  expandedActionId.value = null
  expandedBodyParts.value = {
    ...expandedBodyParts.value,
    [key]: !expandedBodyParts.value[key],
  }
  activeBodyPart.value = key
}

function onMovementEnter(rule) {
  hoveredRuleId.value = rule.id
  activeBodyPart.value = rule.bodyPart || '其他'
}

function onMovementLeave() {
  hoveredRuleId.value = null
}

function onMovementClick(rule) {
  const nextExpanded = expandedActionId.value === rule.id ? null : rule.id
  expandedActionId.value = nextExpanded
  pinnedRuleId.value = nextExpanded
  hoveredRuleId.value = null
  activeBodyPart.value = rule.bodyPart || '其他'
}

onMounted(() => {
  const g = groupedByBodyPart.value
  if (g[0]) {
    activeBodyPart.value = g[0].key
    expandedBodyParts.value = { [g[0].key]: true }
  }
})

watch(
  () => pinnedRuleId.value,
  (id) => {
    if (id != null) {
      const r = movementRuleList.find((x) => x.id === id)
      if (r) activeBodyPart.value = r.bodyPart || '其他'
    }
  },
)

watch(
  () => activeBodyPart.value,
  (part) => {
    // 兜底：当前部位变化后，若旧高亮不属于该部位，立即清理
    if (part == null) return
    if (pinnedRuleId.value != null) {
      const pinned = movementRuleList.find((x) => x.id === pinnedRuleId.value)
      if (pinned && (pinned.bodyPart || '其他') !== part) pinnedRuleId.value = null
    }
    if (hoveredRuleId.value != null) {
      const hovered = movementRuleList.find((x) => x.id === hoveredRuleId.value)
      if (hovered && (hovered.bodyPart || '其他') !== part) hoveredRuleId.value = null
    }
    if (expandedActionId.value != null) {
      const expanded = movementRuleList.find((x) => x.id === expandedActionId.value)
      if (expanded && (expanded.bodyPart || '其他') !== part) expandedActionId.value = null
    }
  },
)
</script>

<template>
  <div
    class="min-h-[calc(100vh-4.5rem)] bg-[#FDFBF7] text-stone-800"
    style="font-family: var(--font-sans, ui-sans-serif)"
  >
    <div class="mx-auto max-w-6xl px-4 pb-12 pt-6 sm:px-6">
      <header class="mb-6 border-b border-stone-200/70 pb-4">
        <p class="text-sm font-medium uppercase tracking-[0.2em] text-stone-500">
          Movement · Library
        </p>
        <h1 class="mt-1 text-2xl font-light tracking-tight text-stone-800 sm:text-3xl">
          经络运动库
        </h1>
        <p class="mt-2 max-w-xl text-sm leading-relaxed text-stone-500">
          右侧选择动作，左侧人机互动查看相关穴位；悬停或点击以高亮。
        </p>
      </header>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        <!-- 左 5：视口 + 运镜 Canvas（底图与穴位同层变换，避免错位） -->
        <section
          class="relative overflow-hidden rounded-[2rem] border border-stone-200/60 bg-[#FDFBF7]/80 shadow-sm lg:col-span-5"
        >
          <div
            class="relative mx-auto h-[min(52vh,420px)] w-full min-h-[280px] max-w-full overflow-hidden lg:h-[min(58vh,480px)] lg:min-h-[360px]"
          >
            <!-- 运镜画布：整层 scale + translate，穴位与 img 相对静止 -->
            <div
              class="absolute left-1/2 top-1/2 w-[min(86vw,288px)] max-w-[288px]"
              :style="canvasTransformStyle"
            >
              <div class="relative w-full">
                <svg
                  class="relative z-0 block h-auto w-full"
                  :viewBox="`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-label="经络人体图"
                  @click="handleCanvasClick"
                >
                  <!-- 人体底图层 -->
                  <g>
                    <image
                      :href="activeBodyImageUrl"
                      x="0"
                      y="0"
                      :width="CANVAS_WIDTH"
                      :height="CANVAS_HEIGHT"
                      preserveAspectRatio="xMidYMid meet"
                      class="opacity-40"
                    />
                  </g>

                  <!-- 引出线层 -->
                  <g>
                    <line
                      v-for="(d, i) in litAcupoints"
                      :key="`line-${d.ruleId}-${d.name}-${i}`"
                      :x1="toCanvasX(d.x)"
                      :y1="toCanvasY(d.y)"
                      :x2="toCanvasX(d.labelX)"
                      :y2="toCanvasY(d.labelY)"
                      class="stroke-stone-300 opacity-50"
                      stroke-width="0.5"
                      vector-effect="non-scaling-stroke"
                    />
                  </g>

                  <!-- 穴位点层 -->
                  <g>
                    <circle
                      v-for="(d, i) in litAcupoints"
                      :key="`dot-${d.ruleId}-${d.name}-${i}`"
                      :cx="toCanvasX(d.x)"
                      :cy="toCanvasY(d.y)"
                      r="4"
                      class="fill-teal-400"
                    />
                  </g>

                  <!-- 文字标签层 -->
                  <g>
                    <text
                      v-for="(d, i) in litAcupoints"
                      :key="`label-${d.ruleId}-${d.name}-${i}`"
                      :x="labelTextX(d)"
                      :y="toCanvasY(d.labelY)"
                      :text-anchor="labelAnchor(d)"
                      dominant-baseline="middle"
                      class="fill-stone-600 font-sans whitespace-nowrap select-none"
                      style="font-size: 9pt"
                    >
                      {{ d.name }}穴
                    </text>
                  </g>
                </svg>

                <!-- 临时开发工具：点击后显示红色十字，辅助目测对位 -->
                <div
                  v-if="debugClickPoint"
                  class="pointer-events-none absolute z-[999] h-4 w-4 -translate-x-1/2 -translate-y-1/2"
                  :style="{ left: `${debugClickPoint.x}%`, top: `${debugClickPoint.y}%` }"
                  aria-hidden="true"
                >
                  <span class="absolute left-1/2 top-0 h-full w-[2px] -translate-x-1/2 bg-red-500" />
                  <span class="absolute left-0 top-1/2 h-[2px] w-full -translate-y-1/2 bg-red-500" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 右 7：分组手风琴 -->
        <section class="flex flex-col gap-1 lg:col-span-7">
          <div
            v-for="group in groupedByBodyPart"
            :key="group.key"
            class="overflow-hidden rounded-2xl border border-stone-200/70 bg-white/50"
          >
            <button
              type="button"
              class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-stone-50/90"
              :class="activeBodyPart === group.key ? 'text-teal-600' : 'text-stone-800'"
              @click="toggleAccordion(group.key)"
            >
              <span class="text-sm font-medium">{{ group.key }}</span>
              <span class="text-xs text-stone-500">{{ group.rules.length }} 式</span>
              <span
                class="ml-auto shrink-0 text-stone-400 transition-transform duration-300"
                :class="expandedBodyParts[group.key] ? 'rotate-180' : ''"
                aria-hidden="true"
              >
                ▾
              </span>
            </button>

            <div v-show="expandedBodyParts[group.key]" class="border-t border-stone-100/90">
              <div
                v-for="rule in group.rules"
                :key="rule.id"
                class="border-b border-stone-100/70 last:border-b-0"
              >
                <button
                  type="button"
                  class="flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-teal-50/50"
                  :class="
                    highlightRuleId === rule.id
                      ? 'bg-teal-50/80 ring-1 ring-inset ring-teal-200/80'
                      : ''
                  "
                  @mouseenter="onMovementEnter(rule)"
                  @mouseleave="onMovementLeave"
                  @click="onMovementClick(rule)"
                >
                  <span class="text-sm text-stone-800">{{ rule.name }}</span>
                  <span class="text-xs text-stone-500">{{ rule.description }}</span>
                </button>

                <transition
                  enter-active-class="transition-[grid-template-rows,opacity] duration-300 ease-out"
                  leave-active-class="transition-[grid-template-rows,opacity] duration-200 ease-in"
                  enter-from-class="grid-rows-[0fr] opacity-0"
                  enter-to-class="grid-rows-[1fr] opacity-100"
                  leave-from-class="grid-rows-[1fr] opacity-100"
                  leave-to-class="grid-rows-[0fr] opacity-0"
                >
                  <div
                    v-if="expandedActionId === rule.id"
                    class="mx-3 mb-3 grid overflow-hidden rounded-xl border-t border-stone-100 bg-teal-50/30"
                  >
                    <div class="min-h-0 px-4 py-4">
                      <div class="flex flex-col">
                        <div class="mb-4">
                          <span class="mb-1 block text-xs tracking-widest text-teal-700/70">
                            「 动作要领 」
                          </span>
                          <p class="font-serif text-sm leading-relaxed text-stone-600">
                            {{ rule.essentials }}
                          </p>
                        </div>

                        <div class="mb-4">
                          <span class="mb-1 block text-xs tracking-widest text-teal-700/70">
                            「 身体益处 」
                          </span>
                          <p class="font-serif text-sm leading-relaxed text-stone-600">
                            {{ rule.physicalBenefits }}
                          </p>
                        </div>

                        <div>
                          <span class="mb-1 block text-xs tracking-widest text-teal-700/70">
                            「 中医脉络 」
                          </span>
                          <p class="font-serif text-sm leading-relaxed text-stone-600">
                            {{ rule.tcmConnection }}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </transition>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
