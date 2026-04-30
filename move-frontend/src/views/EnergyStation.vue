<script setup>
import { onMounted, ref, watch, nextTick } from 'vue'
import { RouterLink } from 'vue-router'
import request from '@/api/request'
import { useUserStore } from '@/store/userStore'

const userStore = useUserStore()

const TABS = Object.freeze({ ENERGY: 'energy', DIARY: 'diary' })
const activeTab = ref(TABS.ENERGY)

const samples = [
  { id: 1, text: '气定神闲，目舒脉缓；久坐之后，一寸松肩即一寸春。' },
  { id: 2, text: '合谷轻展，如读半行古帖；呼吸自深，不必向人证明刻苦。' },
  { id: 3, text: '大椎若松，天际自远。今日只问身内，不问身外事。' },
  { id: 4, text: '微动非争，乃与己和。气到处，便是归处。' },
  { id: 5, text: '目为神之舍，半刻敛光，胜却万千浮语。' },
  { id: 6, text: '番茄一瞬，亦可成境。收心即坐，坐处即山。' },
]

const diaries = ref([])
const diaryBody = ref('')
const diaryLoading = ref(false)
const saveLoading = ref(false)
const saveError = ref('')

const textareaRef = ref(null)

function shichenFromHour(hour) {
  if (hour === 0 || hour === 23) return '子'
  if (hour >= 1 && hour <= 2) return '丑'
  if (hour >= 3 && hour <= 4) return '寅'
  if (hour >= 5 && hour <= 6) return '卯'
  if (hour >= 7 && hour <= 8) return '辰'
  if (hour >= 9 && hour <= 10) return '巳'
  if (hour >= 11 && hour <= 12) return '午'
  if (hour >= 13 && hour <= 14) return '未'
  if (hour >= 15 && hour <= 16) return '申'
  if (hour >= 17 && hour <= 18) return '酉'
  if (hour >= 19 && hour <= 20) return '戌'
  return '亥'
}

function formatDiaryTime(iso) {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const shichen = shichenFromHour(d.getHours())
  return {
    long: `${y}.${m}.${day} · ${shichen}时`,
    short: `${m} / ${day}`,
  }
}

const TEXTAREA_MIN_PX = 160
const TEXTAREA_MAX_PX = 480

function autoResizeTextarea() {
  nextTick(() => {
    const el = textareaRef.value
    if (!el) return
    // 在「能量汇聚」时日记区 v-show 为 false，此时 scrollHeight 为 0；若设 height:0 切换回日记后不会自动重算，会看不见输入区
    if (el.offsetParent === null && el.getClientRects().length === 0) {
      el.style.removeProperty('height')
      return
    }
    el.style.height = 'auto'
    const h = el.scrollHeight
    const next = Math.max(TEXTAREA_MIN_PX, Math.min(h || TEXTAREA_MIN_PX, TEXTAREA_MAX_PX))
    el.style.height = `${next}px`
  })
}

async function loadDiaries() {
  if (!userStore.userId) {
    diaries.value = []
    return
  }
  diaryLoading.value = true
  saveError.value = ''
  try {
    const list = await request.get(`/api/diaries/${userStore.userId}`)
    diaries.value = Array.isArray(list) ? list : []
  } catch {
    saveError.value = '日记列表暂未能载入，可稍后再试。'
    diaries.value = []
  } finally {
    diaryLoading.value = false
  }
}

async function sealDiary() {
  const text = diaryBody.value.trim()
  if (!text) {
    saveError.value = '请先写下几行心境，再封存。'
    return
  }
  if (!userStore.userId) {
    saveError.value = '请先在用户中心或首页完成用户同步。'
    return
  }
  saveLoading.value = true
  saveError.value = ''
  try {
    const created = await request.post('/api/diaries/', {
      user_id: userStore.userId,
      content: text,
    })
    diaries.value = [created, ...diaries.value]
    diaryBody.value = ''
    autoResizeTextarea()
  } catch {
    saveError.value = '封存未成功，请检查网络后重试。'
  } finally {
    saveLoading.value = false
  }
}

watch(
  () => userStore.userId,
  (id) => {
    if (id && activeTab.value === TABS.DIARY) {
      loadDiaries()
    }
  },
)

watch(activeTab, (tab) => {
  if (tab === TABS.DIARY) {
    if (userStore.userId) {
      loadDiaries()
    }
    nextTick(() => autoResizeTextarea())
  }
})

watch(diaryBody, () => {
  autoResizeTextarea()
})

onMounted(() => {
  if (userStore.userId) {
    loadDiaries()
  }
  if (activeTab.value === TABS.DIARY) {
    autoResizeTextarea()
  }
})
</script>

<template>
  <div class="flex flex-1 flex-col pb-24">
    <nav class="mx-auto w-full max-w-5xl px-6 pt-4 sm:px-8">
      <RouterLink
        to="/"
        class="inline-flex items-center gap-2 rounded-[2rem] border border-stone-200/60 bg-teal-50/90 px-4 py-2.5 text-[11px] tracking-[0.28em] text-teal-800 shadow-[0_4px_16px_rgb(0,0,0,0.04)] backdrop-blur-md transition hover:bg-teal-100"
      >
        <span aria-hidden="true" class="text-teal-600">←</span>
        返回首页
      </RouterLink>
    </nav>

    <div class="mx-auto mt-8 w-full max-w-5xl flex-1 px-6 sm:px-8">
      <header class="text-center sm:text-left">
        <p class="text-[11px] tracking-[0.45em] text-stone-500">能量站</p>
        <h1 class="mt-2 text-lg font-light tracking-[0.2em] text-stone-800">汇聚 · 灵光</h1>
        <p class="mt-2 text-[12px] text-stone-500">读箴言如饮茶，写日记如焚香</p>
      </header>

      <!-- 东方禅意 Segmented Control -->
      <div class="mt-10 flex justify-center sm:mt-8">
        <div
          class="inline-flex rounded-[2.5rem] border border-stone-200/60 bg-[#F0EBE3]/50 p-1.5 shadow-[inset_0_1px_2px_rgb(0,0,0,0.04)] backdrop-blur-sm"
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === TABS.ENERGY"
            class="min-w-[7.5rem] rounded-[2rem] px-5 py-2.5 text-[11px] tracking-[0.32em] transition duration-300"
            :class="
              activeTab === TABS.ENERGY
                ? 'bg-white/80 text-stone-800 shadow-[0_4px_16px_rgb(0,0,0,0.05)] ring-1 ring-stone-200/50 backdrop-blur-sm'
                : 'text-stone-500 hover:text-stone-600'
            "
            @click="activeTab = TABS.ENERGY"
          >
            能量汇聚
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === TABS.DIARY"
            class="min-w-[7.5rem] rounded-[2rem] px-5 py-2.5 text-[11px] tracking-[0.32em] transition duration-300"
            :class="
              activeTab === TABS.DIARY
                ? 'bg-white/80 text-stone-800 shadow-[0_4px_16px_rgb(0,0,0,0.05)] ring-1 ring-stone-200/50 backdrop-blur-sm'
                : 'text-stone-500 hover:text-stone-600'
            "
            @click="activeTab = TABS.DIARY"
          >
            灵光日记
          </button>
        </div>
      </div>

      <!-- Tab：金句 -->
      <div v-show="activeTab === TABS.ENERGY" class="mt-12">
        <p class="mb-8 text-center text-[10px] tracking-[0.4em] text-stone-500 sm:text-left">今日箴言 · 疗愈金句</p>
        <div class="columns-1 gap-6 sm:columns-2 lg:columns-3 [&>article]:mb-6">
          <article
            v-for="item in samples"
            :key="item.id"
            class="break-inside-avoid rounded-[2rem] border border-stone-200/60 bg-white/80 p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-md transition hover:border-teal-200/50 hover:bg-teal-50/30"
          >
            <p class="font-serif text-base leading-relaxed text-stone-800">
              {{ item.text }}
            </p>
            <p class="mt-6 text-right text-[10px] tracking-[0.35em] text-stone-500">— 随候</p>
          </article>
        </div>
      </div>

      <!-- Tab：日记 -->
      <div v-show="activeTab === TABS.DIARY" class="mt-12">
        <div
          v-if="!userStore.userId"
          class="mb-8 rounded-[2rem] border border-dashed border-stone-200/60 bg-white/50 px-6 py-8 text-center text-sm font-light text-stone-800 shadow-[0_4px_16px_rgb(0,0,0,0.04)]"
        >
          尚未同步用户身份，请先到
          <RouterLink
            to="/user"
            class="text-teal-700 underline-offset-4 transition hover:underline"
          >用户中心</RouterLink
          >
          或完成首页拉取，再书写灵光。
        </div>

        <div
          class="relative rounded-[2.5rem] border border-stone-200/60 bg-[#FDFBF7]/60 p-1 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
        >
          <div class="rounded-[2.3rem] border border-stone-200/40 bg-white/80 p-6 shadow-[inset_0_1px_2px_rgb(0,0,0,0.03)] backdrop-blur-md sm:p-8">
            <label class="sr-only" for="diary-paper">日记正文</label>
            <textarea
              id="diary-paper"
              ref="textareaRef"
              v-model="diaryBody"
              rows="4"
              :placeholder="userStore.userId ? '记录当下的气象与心境……' : '可在此先起草；登录/注册后将身份同步至用户中心，即可封存。'"
              class="min-h-40 w-full max-h-[30rem] resize-none overflow-y-auto border-0 bg-transparent font-serif text-base leading-relaxed text-stone-800 placeholder:text-stone-500 focus:border-0 focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-teal-200/50"
            />
            <div class="mt-4 flex flex-wrap items-center justify-end gap-3">
              <p v-if="saveError" class="mr-auto text-[11px] font-light text-stone-600">{{ saveError }}</p>
              <button
                type="button"
                :disabled="!userStore.userId || saveLoading"
                class="rounded-[2rem] border border-stone-200/60 bg-teal-50 px-6 py-2.5 text-[11px] tracking-[0.35em] text-teal-700 shadow-[0_4px_12px_rgb(0,0,0,0.04)] transition enabled:hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50"
                @click="sealDiary"
              >
                {{ saveLoading ? '封存中…' : '封存记录' }}
              </button>
            </div>
          </div>
        </div>

        <section class="mt-14">
          <div class="flex items-baseline justify-between gap-4 px-1">
            <h2 class="text-sm font-normal tracking-[0.3em] text-stone-800">往日灵光</h2>
            <span v-if="diaryLoading" class="text-[10px] text-stone-500">载入中…</span>
          </div>

          <p
            v-if="userStore.userId && !diaryLoading && diaries.length === 0"
            class="mt-8 text-center text-sm font-light text-stone-500"
          >
            尚无封存。写下第一行，让时间有迹可寻。
          </p>

          <ul
            v-if="diaries.length"
            class="mt-6 space-y-5 border-l border-stone-200/60 pl-6 sm:pl-8"
          >
            <li
              v-for="item in diaries"
              :key="item.id"
              class="relative pl-2"
            >
              <span
                class="absolute -left-6 top-1.5 h-2 w-2 rounded-full border border-stone-200/60 bg-[#FDFBF7] shadow-[0_1px_2px_rgb(0,0,0,0.04)] sm:-left-8"
                aria-hidden="true"
              />
              <p class="flex flex-wrap items-baseline gap-2 text-[11px] text-stone-500">
                <span class="font-light tracking-[0.12em] text-stone-500">
                  {{ formatDiaryTime(item.created_at).long }}
                </span>
                <span class="text-stone-400/80">·</span>
                <span class="text-stone-500">{{ formatDiaryTime(item.created_at).short }}</span>
              </p>
              <p class="mt-3 font-serif text-[15px] leading-relaxed text-stone-800">
                {{ item.content }}
              </p>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>
