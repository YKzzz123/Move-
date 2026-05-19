<script setup>
import { computed } from 'vue'

/** 真气驱动的悬浮与光晕（纯 CSS，无额外素材） */
const props = defineProps({
  /** 真气值，可与 userStore.qiScore 同步 */
  qiValue: { type: Number, default: 0 },
  portraitUrl: { type: String, required: true },
  /** 背景环底色（与状态一致），光晕由内联 box-shadow 叠加 */
  orbClass: { type: String, default: '' },
})

const QI_CAP = 2500
const LIFT_CAP_PX = 40
const BLUR_CAP_PX = 80

const qiSafe = computed(() => {
  const n = Number(props.qiValue)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(n, QI_CAP)
})

/** 上浮基准：translateY 为负表示上移，上限 40px 量级由 qi 换算 */
const qiLiftPx = computed(() => Math.min(qiSafe.value * 0.03, LIFT_CAP_PX))

const liftStyle = computed(() => ({
  transform: `translateY(${-qiLiftPx.value}px)`,
  transition: 'transform 700ms cubic-bezier(0.33, 1, 0.68, 1)',
}))

/** 薄荷绿 aura：blur、opacity 与 qi 成正比 */
const auraStyle = computed(() => {
  const q = qiSafe.value
  const blur = Math.min(q * 0.08, BLUR_CAP_PX)
  const op = Math.min(q / 1000, 0.8)
  const qiGlow = `0 0 ${blur}px rgba(74, 222, 128, ${op}), 0 0 ${Math.round(blur * 0.5)}px rgba(45, 212, 191, ${op * 0.85})`
  const basePad = `0 0 64px rgba(16, 185, 129, ${0.05 + Math.min(q / 2000, 0.06)})`
  return {
    boxShadow: `${qiGlow}, ${basePad}`,
    transition: 'box-shadow 700ms cubic-bezier(0.33, 1, 0.68, 1), filter 700ms cubic-bezier(0.33, 1, 0.68, 1)',
  }
})

/** 离地越高，地面投影越小、越淡 */
const groundShadowStyle = computed(() => {
  const lift = qiLiftPx.value
  const t = LIFT_CAP_PX > 0 ? Math.min(lift / LIFT_CAP_PX, 1) : 0
  const scale = Math.max(0.55, 1 - 0.48 * t)
  const opacity = Math.max(0.1, 0.36 - 0.26 * t)
  return {
    transform: `translate(-50%, 0) scale(${scale})`,
    opacity,
    transition: 'transform 700ms cubic-bezier(0.33, 1, 0.68, 1), opacity 700ms cubic-bezier(0.33, 1, 0.68, 1)',
  }
})
</script>

<template>
  <div class="relative flex w-[13rem] flex-col items-center pb-6 pt-2 sm:w-56">
    <div
      class="pointer-events-none absolute bottom-1 left-1/2 z-0 h-5 w-[54%] max-w-[12.5rem] rounded-[100%] bg-stone-900/[0.26] blur-[14px] dark:bg-black/[0.5]"
      :style="groundShadowStyle"
      aria-hidden="true"
    />

    <div class="relative z-10" :style="liftStyle">
      <div
        class="cat-qi-breathe flex h-52 w-52 items-center justify-center overflow-hidden rounded-full ring-1 ring-stone-200/50 dark:ring-stone-600/50 sm:h-56 sm:w-56"
        :class="orbClass"
        :style="auraStyle"
      >
        <img
          :src="portraitUrl"
          alt=""
          width="224"
          height="224"
          loading="lazy"
          decoding="async"
          class="h-full w-full object-cover object-center"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes cat-qi-breathe {
  0%,
  100% {
    transform: translateY(-5px);
  }
  50% {
    transform: translateY(5px);
  }
}
.cat-qi-breathe {
  animation: cat-qi-breathe 3.5s ease-in-out infinite;
}
</style>
