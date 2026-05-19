<script setup>
import { onMounted, ref, computed, watch, nextTick } from 'vue'
import { RouterLink } from 'vue-router'
import request from '@/api/request'
import { deleteDiary, updateDiary } from '@/api/diary'
import { getRandomEnergyQuote, postEnergyEcho } from '@/api/energyStation'
import { formatAxiosApiError } from '@/api/apiErrors'
import { useUserStore } from '@/store/userStore'

const userStore = useUserStore()

const TABS = Object.freeze({ ENERGY: 'energy', DIARY: 'diary' })
const activeTab = ref(TABS.ENERGY)

const diaries = ref([])
const diaryLoading = ref(false)

/** 今日、昨日、前日 三天内是否有封存日记（按日历日） */
function isDiaryInLastThreeCalendarDays(iso) {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return false
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const start = new Date()
  start.setDate(start.getDate() - 2)
  start.setHours(0, 0, 0, 0)
  return t >= start && t <= end
}

const hasRecentDiary = computed(() => {
  if (!userStore.userId || !diaries.value.length) return false
  return diaries.value.some((d) => isDiaryInLastThreeCalendarDays(d.created_at))
})

/** 随机箴言与「今日回响进行中」互斥：有近三日日记且已进入回响流程时隐藏箴言卡 */
const showEnergyRandomCard = computed(() => {
  if (!hasRecentDiary.value) return true
  return echoPhase.value === 'idle'
})

const showEnergyEchoActive = computed(() => {
  return hasRecentDiary.value && echoPhase.value !== 'idle'
})

/** 状态 A：随机箴言（无解语） */
const randomQuote = ref(null)
const randomQuoteLoading = ref(false)
const randomQuoteHint = ref('')
const quoteFadeKey = ref(0)

/** 状态 B：今日回响 */
const echoPhase = ref('idle')
const echoError = ref('')
/** @type {import('vue').Ref<{ quote: string, source: string, explanation: string } | null>} */
const echoResult = ref(null)

async function fetchRandomQuote() {
  randomQuoteLoading.value = true
  randomQuoteHint.value = ''
  try {
    const data = await getRandomEnergyQuote()
    randomQuote.value = {
      quote: data.quote ?? '',
      source: data.source ?? '',
    }
    quoteFadeKey.value += 1
  } catch {
    randomQuote.value = null
    randomQuoteHint.value = '箴言暂不可读，稍候再试也无妨。'
  } finally {
    randomQuoteLoading.value = false
  }
}

function refreshRandomQuote() {
  fetchRandomQuote()
}

function pickRecentDiaryTextForEcho() {
  if (!userStore.userId || !diaries.value.length) return ''
  const recent = diaries.value.filter((d) => isDiaryInLastThreeCalendarDays(d.created_at))
  recent.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  return recent[0]?.content?.trim() ?? ''
}

function resetEchoSurface() {
  echoPhase.value = 'idle'
  echoResult.value = null
  echoError.value = ''
}

async function runEnergyEcho() {
  echoError.value = ''
  const text = pickRecentDiaryTextForEcho()
  if (!text) {
    echoError.value = '近几日还没有封存的心情，先去灵光日记里写几句吧。'
    return
  }
  echoPhase.value = 'loading'
  echoResult.value = null
  try {
    const data = await postEnergyEcho(text)
    echoResult.value = {
      quote: data.quote ?? '',
      source: data.source ?? '',
      explanation: data.explanation ?? '',
    }
    echoPhase.value = 'result'
  } catch (err) {
    echoPhase.value = 'idle'
    echoError.value = formatAxiosApiError(err) || '回响未至，请稍后再试。'
  }
}

function listenAgain() {
  resetEchoSurface()
}

watch(hasRecentDiary, () => {
  resetEchoSurface()
})

watch(activeTab, (tab) => {
  if (tab === TABS.DIARY && userStore.userId) {
    loadDiaries()
  }
  nextTick(() => autoResizeTextarea())
  if (tab === TABS.ENERGY) {
    if (!userStore.userId || !diaryLoading.value) {
      if (!randomQuote.value && !randomQuoteLoading.value) fetchRandomQuote()
    }
  }
})

watch(diaryLoading, (loading) => {
  if (
    !loading &&
    activeTab.value === TABS.ENERGY &&
    !randomQuote.value &&
    !randomQuoteLoading.value
  ) {
    fetchRandomQuote()
  }
})

const diaryBody = ref('')
const saveLoading = ref(false)
const saveError = ref('')
const listActionError = ref('')

const textareaRef = ref(null)

/** 本地现代时间，精确到分钟 */
function formatDiaryTime(iso) {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const editingId = ref(null)
const editingBody = ref('')
const savingEdit = ref(false)
const deletingId = ref(null)

/** 展开的日记 id（封存折叠之外的阅读态） */
/** @type {import('vue').Ref<Set<number>>} */
const expandedDiaryIds = ref(new Set())

function isDiaryExpanded(id) {
  return expandedDiaryIds.value.has(Number(id))
}

function expandDiary(id) {
  const n = Number(id)
  const next = new Set(expandedDiaryIds.value)
  next.add(n)
  expandedDiaryIds.value = next
}

function collapseDiary(id) {
  const n = Number(id)
  if (editingId.value != null && Number(editingId.value) === n) cancelEdit()
  const next = new Set(expandedDiaryIds.value)
  next.delete(n)
  expandedDiaryIds.value = next
}

function diaryCoverLabel(item) {
  const s = item?.ai_summary != null ? String(item.ai_summary).trim() : ''
  if (s) return s
  return '🔒 封存的灵光'
}

function startEdit(item) {
  listActionError.value = ''
  expandDiary(item.id)
  editingId.value = Number(item.id)
  editingBody.value = item.content
}

function cancelEdit() {
  editingId.value = null
  editingBody.value = ''
}

function isEditingDiary(item) {
  return editingId.value != null && Number(editingId.value) === Number(item.id)
}

async function saveEdit(diaryId) {
  const text = editingBody.value.trim()
  if (!text) {
    listActionError.value = '正文不能为空。'
    return
  }
  const uid = userStore.userId
  if (uid == null || Number(uid) <= 0) {
    listActionError.value = '请先完成登录或用户同步。'
    return
  }
  const idNum = Number(diaryId)
  const userNum = Number(uid)
  savingEdit.value = true
  listActionError.value = ''
  try {
    const updated = await updateDiary(idNum, {
      user_id: userNum,
      content: text,
    })
    const i = diaries.value.findIndex((x) => Number(x.id) === idNum)
    if (i !== -1) diaries.value[i] = updated
    cancelEdit()
    scheduleDiaryListRefreshAfterEdit()
  } catch (err) {
    listActionError.value = formatAxiosApiError(err) || '保存失败，请稍后再试。'
  } finally {
    savingEdit.value = false
  }
}

async function removeDiary(diaryId) {
  if (!userStore.userId) return
  if (!window.confirm('确定删除这条日记？删除后无法恢复。')) return
  deletingId.value = Number(diaryId)
  listActionError.value = ''
  try {
    await deleteDiary(Number(diaryId), Number(userStore.userId))
    const rid = Number(diaryId)
    diaries.value = diaries.value.filter((x) => Number(x.id) !== rid)
    const nextExp = new Set(expandedDiaryIds.value)
    nextExp.delete(rid)
    expandedDiaryIds.value = nextExp
    if (editingId.value != null && Number(editingId.value) === rid) cancelEdit()
  } catch {
    listActionError.value = '删除失败，请稍后再试。'
  } finally {
    deletingId.value = null
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

async function loadDiariesQuiet() {
  if (!userStore.userId) return
  try {
    const list = await request.get(`/api/diaries/${userStore.userId}`)
    if (Array.isArray(list)) diaries.value = list
  } catch {
    /* 静默刷新失败不影响已保存的正文 */
  }
}

/** 新建/编辑保存后豆包异步生成封面，分几次静默拉列表刷新 ai_summary */
function scheduleDiaryListRefreshAfterEdit() {
  const delaysMs = [2000, 6000, 14000, 32000]
  for (const ms of delaysMs) {
    window.setTimeout(() => {
      void loadDiariesQuiet()
    }, ms)
  }
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
    const created = await request.post(
      '/api/diaries/',
      {
        user_id: userStore.userId,
        content: text,
      },
      { timeout: 45_000 },
    )
    diaries.value = [created, ...diaries.value]
    diaryBody.value = ''
    autoResizeTextarea()
    scheduleDiaryListRefreshAfterEdit()
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

watch(diaryBody, () => {
  autoResizeTextarea()
})

onMounted(() => {
  if (userStore.userId) {
    loadDiaries()
  }
  if (activeTab.value === TABS.DIARY) {
    nextTick(() => autoResizeTextarea())
  }
  if (activeTab.value === TABS.ENERGY) {
    nextTick(() => {
      if (!randomQuote.value && !randomQuoteLoading.value) fetchRandomQuote()
    })
  }
})
</script>

<template>
  <div class="flex flex-1 flex-col pb-24">
    <div class="mx-auto mt-8 w-full max-w-5xl flex-1 px-6 sm:px-8">
      <header class="text-center sm:text-left">
        <p class="text-[11px] tracking-[0.45em] text-stone-500 dark:text-stone-400">能量站</p>
        <h1 class="mt-2 text-lg font-light tracking-[0.2em] text-stone-800 dark:text-stone-100">汇聚 · 灵光</h1>
        <p class="mt-2 text-[12px] text-stone-500 dark:text-stone-400">读箴言如饮茶，写日记如焚香</p>
      </header>

      <!-- 东方禅意 Segmented Control -->
      <div class="mt-10 flex justify-center sm:mt-8">
        <div
          class="inline-flex rounded-[2.5rem] border border-stone-200/60 bg-[#F0EBE3]/50 p-1.5 shadow-[inset_0_1px_2px_rgb(0,0,0,0.04)] backdrop-blur-sm dark:border-stone-600/50 dark:bg-stone-800/65"
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === TABS.ENERGY"
            class="min-w-[7.5rem] rounded-[2rem] px-5 py-2.5 text-[11px] tracking-[0.32em] transition duration-300"
            :class="
              activeTab === TABS.ENERGY
                ? 'bg-white/80 text-stone-800 shadow-[0_4px_16px_rgb(0,0,0,0.05)] ring-1 ring-stone-200/50 backdrop-blur-sm dark:bg-stone-900/85 dark:text-stone-50 dark:ring-stone-600/50 dark:shadow-[0_4px_16px_rgb(0,0,0,0.35)]'
                : 'text-stone-500 hover:text-stone-600 dark:text-stone-400 dark:hover:text-stone-200'
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
                ? 'bg-white/80 text-stone-800 shadow-[0_4px_16px_rgb(0,0,0,0.05)] ring-1 ring-stone-200/50 backdrop-blur-sm dark:bg-stone-900/85 dark:text-stone-50 dark:ring-stone-600/50 dark:shadow-[0_4px_16px_rgb(0,0,0,0.35)]'
                : 'text-stone-500 hover:text-stone-600 dark:text-stone-400 dark:hover:text-stone-200'
            "
            @click="activeTab = TABS.DIARY"
          >
            灵光日记
          </button>
        </div>
      </div>

      <!-- Tab：能量汇聚 -->
      <div v-show="activeTab === TABS.ENERGY" class="mt-8 sm:mt-10">
        <p class="sr-only">随机箴言与今日回响</p>

        <div class="mx-auto flex w-full max-w-lg flex-col px-1 pb-10">
          <!-- 主卡槽：随机箴言 与 回响（加载/结果）二选一 -->
          <div
            v-show="showEnergyRandomCard"
            class="relative w-full rounded-3xl border border-stone-200/50 bg-stone-900/[0.04] p-8 shadow-[0_8px_40px_rgba(0,0,0,0.06)] backdrop-blur-md dark:border-white/10 dark:bg-black/20 dark:shadow-[0_12px_48px_rgba(0,0,0,0.45)] sm:p-10 md:p-12"
          >
            <Transition name="eco-fade" mode="out-in">
              <div
                v-if="randomQuote && !randomQuoteLoading"
                :key="quoteFadeKey"
                class="flex min-h-[9rem] flex-col justify-center"
              >
                <p
                  class="text-center text-[1.05rem] font-normal italic leading-[1.9] tracking-wide text-stone-800 sm:text-[1.2rem] dark:text-stone-100"
                  style="
                    font-family:
                      'STSong', 'Songti SC', 'SimSun', 'Noto Serif SC', 'Source Han Serif SC', serif;
                  "
                >
                  {{ randomQuote.quote }}
                </p>
                <p
                  class="mt-10 text-right text-[10px] font-light tracking-[0.28em] text-stone-500/90 dark:text-stone-400/85"
                >
                  — {{ randomQuote.source }}
                </p>
              </div>
              <div
                v-else
                key="eco-rq-skel"
                class="flex min-h-[9rem] flex-col items-center justify-center gap-4 py-4"
              >
                <span
                  class="h-1 w-14 rounded-full bg-gradient-to-r from-transparent via-stone-300/60 to-transparent dark:via-white/25"
                />
                <p class="text-[11px] font-extralight tracking-[0.2em] text-stone-500 dark:text-stone-400">
                  静候一纸墨香…
                </p>
              </div>
            </Transition>

            <p
              v-if="randomQuoteHint"
              class="mt-6 text-center text-[10px] font-light text-stone-500/85 dark:text-stone-400/80"
            >
              {{ randomQuoteHint }}
            </p>

            <div class="mt-10 flex justify-center border-t border-white/5 pt-8 dark:border-white/10">
              <button
                type="button"
                :disabled="randomQuoteLoading"
                class="inline-flex items-center gap-2 rounded-full border border-stone-300/45 bg-white/35 px-5 py-2.5 text-[11px] font-light tracking-[0.12em] text-stone-600 shadow-sm backdrop-blur-sm transition-all duration-500 enabled:hover:border-teal-400/35 enabled:hover:bg-teal-50/45 enabled:hover:text-teal-900 disabled:cursor-wait disabled:opacity-50 dark:border-white/12 dark:bg-white/[0.06] dark:text-stone-300 dark:enabled:hover:border-white/20 dark:enabled:hover:bg-white/10 dark:enabled:hover:text-stone-50"
                @click="refreshRandomQuote"
              >
                <svg
                  class="h-3.5 w-3.5 shrink-0 opacity-75"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                  />
                </svg>
                换一条
              </button>
            </div>
          </div>

          <!-- 今日回响进行中：与原箴言卡同一主槽位，互斥显示 -->
          <div
            v-if="showEnergyEchoActive"
            class="relative w-full overflow-hidden rounded-3xl border border-stone-200/50 bg-stone-900/[0.04] shadow-[0_8px_40px_rgba(0,0,0,0.06)] backdrop-blur-md dark:border-white/10 dark:bg-black/20 dark:shadow-[0_12px_48px_rgba(0,0,0,0.45)]"
          >
            <div
              v-if="echoPhase === 'loading'"
              class="flex min-h-[14rem] flex-col items-center justify-center gap-8 px-8 py-12"
            >
              <div class="eco-breathe-ring relative flex h-28 w-28 items-center justify-center">
                <span class="eco-breathe-pulse absolute inset-2 rounded-full border border-teal-300/40 dark:border-teal-600/35" />
                <span class="eco-breathe-core relative h-2 w-2 rounded-full bg-teal-400/80 dark:bg-teal-400/70" />
              </div>
              <p class="eco-breathe-text text-center text-[12px] font-extralight tracking-[0.35em] text-stone-600 dark:text-stone-300">
                正在为你翻阅经典…
              </p>
            </div>

            <Transition v-else name="eco-fade" mode="out-in">
              <article
                v-if="echoPhase === 'result' && echoResult"
                key="eco-result"
                class="w-full p-8 sm:p-10 md:p-12"
              >
                <div class="pb-8">
                  <p
                    class="text-center text-[1.05rem] font-normal italic leading-[1.9] tracking-wide text-stone-800 sm:text-[1.15rem] dark:text-stone-100"
                    style="
                      font-family:
                        'STSong', 'Songti SC', 'SimSun', 'Noto Serif SC', 'Source Han Serif SC', serif;
                    "
                  >
                    {{ echoResult.quote }}
                  </p>
                  <p
                    class="mt-8 text-right text-[10px] font-light tracking-[0.28em] text-stone-500/90 dark:text-stone-400/85"
                  >
                    — {{ echoResult.source }}
                  </p>
                </div>
                <div
                  class="mx-auto mb-8 h-px w-full max-w-xs bg-gradient-to-r from-transparent via-stone-300/50 to-transparent dark:via-white/15"
                  aria-hidden="true"
                />
                <p
                  class="text-[0.8125rem] font-normal leading-[1.85] text-stone-600/85 dark:text-stone-300/80"
                >
                  {{ echoResult.explanation }}
                </p>
                <div class="mt-10 flex justify-center">
                  <button
                    type="button"
                    class="text-[10px] font-light tracking-[0.28em] text-stone-500 underline-offset-4 transition hover:text-teal-800 dark:text-stone-400 dark:hover:text-teal-200"
                    @click="listenAgain"
                  >
                    再听一回响
                  </button>
                </div>
              </article>
            </Transition>
          </div>

          <p
            v-if="!hasRecentDiary"
            class="mt-8 max-w-sm self-center px-3 text-center text-[10px] font-light leading-relaxed tracking-wide text-stone-500/90 dark:text-stone-400/85"
          >
            最近没有留下碎碎念，送你一句箴言。去『灵光日记』写点什么吧~
          </p>

        <!-- 近三日有日记且未进入回响流程：引导与获取按钮 -->
        <div
          v-if="hasRecentDiary && echoPhase === 'idle'"
          class="mt-12 flex min-h-[min(40vh,320px)] flex-col items-center justify-start px-0"
        >
          <p
            class="mb-8 max-w-xs text-center text-[0.95rem] font-extralight leading-relaxed tracking-[0.14em] text-stone-700 dark:text-stone-200 sm:text-[1.05rem]"
          >
            你的碎碎念，宇宙都听到了
          </p>
          <p
            v-if="echoError"
            class="mb-5 max-w-sm px-2 text-center text-[10px] font-light leading-relaxed text-stone-500 dark:text-stone-400"
          >
            {{ echoError }}
          </p>
          <button
            type="button"
            class="eco-cta group relative overflow-hidden rounded-full border border-teal-200/55 bg-teal-50/80 px-10 py-3.5 text-[11px] font-light tracking-[0.28em] text-teal-900 shadow-[0_6px_28px_rgba(20,184,166,0.15)] transition-all duration-500 hover:border-teal-300/70 hover:bg-teal-50 hover:shadow-[0_8px_32px_rgba(20,184,166,0.22)] dark:border-teal-800/50 dark:bg-teal-950/45 dark:text-teal-100 dark:shadow-[0_8px_32px_rgba(0,0,0,0.35)] dark:hover:bg-teal-900/35"
            @click="runEnergyEcho"
          >
            <span class="relative z-10">获取今日回响</span>
          </button>
        </div>
        </div>
      </div>

      <!-- Tab：日记 -->
      <div v-show="activeTab === TABS.DIARY" class="mt-12">
        <div
          v-if="!userStore.userId"
          class="mb-8 rounded-[2rem] border border-dashed border-stone-200/60 bg-white/50 px-6 py-8 text-center text-sm font-light text-stone-800 shadow-[0_4px_16px_rgb(0,0,0,0.04)] dark:border-stone-600/50 dark:bg-stone-900/50 dark:text-stone-200"
        >
          尚未同步用户身份，请先
          <RouterLink
            to="/login"
            class="text-teal-700 underline-offset-4 transition hover:underline dark:text-teal-300"
          >登录</RouterLink>
          或
          <RouterLink
            to="/register"
            class="text-teal-700 underline-offset-4 transition hover:underline dark:text-teal-300"
          >注册</RouterLink>
          ，再书写灵光。
        </div>

        <div
          class="relative rounded-[2.5rem] border border-stone-200/60 bg-[#FDFBF7]/60 p-1 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:border-stone-600/50 dark:bg-stone-900/45 dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)]"
        >
          <div class="rounded-[2.3rem] border border-stone-200/40 bg-white/80 p-6 shadow-[inset_0_1px_2px_rgb(0,0,0,0.03)] backdrop-blur-md dark:border-stone-600/40 dark:bg-stone-900/70 sm:p-8">
            <label class="sr-only" for="diary-paper">日记正文</label>
            <textarea
              id="diary-paper"
              ref="textareaRef"
              v-model="diaryBody"
              rows="4"
              :placeholder="userStore.userId ? '记录当下的气象与心境……' : '可在此先起草；登录/注册后将身份同步至用户中心，即可封存。'"
              class="min-h-40 w-full max-h-[30rem] resize-none overflow-y-auto border-0 bg-transparent font-serif text-base leading-relaxed text-stone-800 placeholder:text-stone-500 focus:border-0 focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-teal-200/50 dark:text-stone-100 dark:placeholder:text-stone-500/80 dark:focus-visible:ring-teal-700/35"
            />
            <div class="mt-4 flex flex-wrap items-center justify-end gap-3">
              <p v-if="saveError" class="mr-auto text-[11px] font-light text-stone-600 dark:text-stone-400">{{ saveError }}</p>
              <button
                type="button"
                :disabled="!userStore.userId || saveLoading"
                class="rounded-[2rem] border border-stone-200/60 bg-teal-50 px-6 py-2.5 text-[11px] tracking-[0.35em] text-teal-700 shadow-[0_4px_12px_rgb(0,0,0,0.04)] transition enabled:hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-600/55 dark:bg-teal-950/45 dark:text-teal-100 dark:enabled:hover:bg-teal-900/40"
                @click="sealDiary"
              >
                {{ saveLoading ? '封存中…' : '封存记录' }}
              </button>
            </div>
          </div>
        </div>

        <section class="mt-14">
          <div class="flex flex-wrap items-baseline justify-between gap-4 px-1">
            <h2 class="text-sm font-normal tracking-[0.3em] text-stone-800 dark:text-stone-100">往日灵光</h2>
            <div class="flex items-center gap-3">
              <p v-if="listActionError" class="text-[10px] text-amber-800 dark:text-amber-300/95">
                {{ listActionError }}
              </p>
              <span v-if="diaryLoading" class="text-[10px] text-stone-500 dark:text-stone-400">载入中…</span>
            </div>
          </div>

          <p
            v-if="userStore.userId && !diaryLoading && diaries.length === 0"
            class="mt-8 text-center text-sm font-light text-stone-500 dark:text-stone-400"
          >
            尚无封存。写下第一行，让时间有迹可寻。
          </p>

          <ul
            v-if="diaries.length"
            class="mt-6 space-y-4 border-l border-stone-300/65 pl-5 dark:border-zinc-700/55 sm:pl-7"
          >
            <li
              v-for="item in diaries"
              :key="item.id"
              class="relative pl-2"
            >
              <span
                class="absolute -left-[1.35rem] top-[26px] h-2.5 w-2.5 rounded-full border transition-all duration-500 ease-in-out sm:-left-[1.62rem]"
                :class="
                  isDiaryExpanded(item.id) || isEditingDiary(item)
                    ? 'border-teal-500/55 bg-teal-50 shadow-[0_0_12px_rgba(13,148,136,0.22)] ring-2 ring-teal-200/45 dark:border-teal-400/50 dark:bg-zinc-900 dark:shadow-[0_0_14px_rgba(45,212,191,0.45)] dark:ring-teal-400/25'
                    : 'border-stone-300/90 bg-white shadow-sm dark:border-zinc-700/90 dark:bg-zinc-800 dark:shadow-none'
                "
                aria-hidden="true"
              />

              <div
                class="group/card overflow-hidden rounded-2xl border border-stone-200/75 bg-white/90 shadow-[0_4px_20px_rgb(0,0,0,0.04)] backdrop-blur-sm transition-all duration-500 ease-in-out hover:border-teal-200/45 hover:bg-[#FDFBF7]/95 dark:border-zinc-800 dark:bg-zinc-900/40 dark:shadow-none dark:hover:bg-zinc-800/55"
              >
                <!-- 封存态：仅封面 + 时间 + 展开 -->
                <template v-if="!isDiaryExpanded(item.id) && !isEditingDiary(item)">
                  <button
                    type="button"
                    class="flex h-[76px] w-full cursor-pointer items-center gap-2 px-3 text-left sm:gap-3 sm:px-4"
                    @click="expandDiary(item.id)"
                  >
                    <time
                      class="w-[8.75rem] shrink-0 select-none font-mono text-[10px] tabular-nums tracking-wide text-stone-500 sm:w-[9.25rem] dark:text-zinc-400"
                    >
                      {{ formatDiaryTime(item.created_at) }}
                    </time>
                    <p
                      class="min-w-0 flex-1 truncate text-center text-[0.9375rem] font-medium leading-snug tracking-wide text-stone-700 dark:text-zinc-300"
                      style="
                        font-family:
                          ui-rounded, 'Nunito Sans', 'PingFang SC', 'Microsoft YaHei', system-ui,
                          sans-serif;
                      "
                    >
                      {{ diaryCoverLabel(item) }}
                    </p>
                    <span
                      class="flex h-8 w-8 shrink-0 items-center justify-center text-stone-500 transition-transform duration-500 group-hover/card:text-teal-700 dark:text-zinc-500 dark:group-hover/card:text-zinc-400"
                      aria-hidden="true"
                    >
                      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                      </svg>
                    </span>
                  </button>
                </template>

                <!-- 展开 / 阅读 / 编辑 -->
                <div
                  v-else
                  class="space-y-4 px-3 py-4 transition-opacity duration-500 ease-in-out sm:px-4"
                >
                  <div class="flex items-start justify-between gap-2">
                    <time
                      class="shrink-0 select-none font-mono text-[10px] tabular-nums tracking-wide text-stone-500 dark:text-zinc-400"
                    >
                      {{ formatDiaryTime(item.created_at) }}
                    </time>
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 rounded-full border border-stone-200/85 bg-white/90 px-2.5 py-1 text-[10px] tracking-wide text-stone-600 transition hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900 dark:border-zinc-700 dark:bg-zinc-800/45 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/75 dark:hover:text-zinc-100"
                      @click="collapseDiary(item.id)"
                    >
                      <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
                      </svg>
                      收起
                    </button>
                  </div>

                  <p
                    v-if="!isEditingDiary(item)"
                    class="text-center text-[0.8125rem] font-medium text-stone-600 dark:text-zinc-500"
                    style="
                      font-family:
                        ui-rounded, 'Nunito Sans', 'PingFang SC', system-ui, sans-serif;
                    "
                  >
                    {{ diaryCoverLabel(item) }}
                  </p>

                  <template v-if="isEditingDiary(item)">
                    <div class="space-y-3">
                      <textarea
                        v-model="editingBody"
                        rows="5"
                        class="w-full resize-y rounded-xl border border-stone-200/85 bg-white p-4 font-serif text-[15px] leading-relaxed text-stone-800 outline-none focus:border-teal-400/55 focus:ring-2 focus:ring-teal-200/45 dark:border-zinc-700/60 dark:bg-black/35 dark:text-zinc-100 dark:focus:border-teal-500/40 dark:focus:ring-teal-500/25"
                      />
                      <div class="flex flex-wrap gap-2">
                        <button
                          type="button"
                          :disabled="savingEdit"
                          class="rounded-full bg-teal-600/90 px-4 py-2 text-[10px] tracking-[0.2em] text-white transition enabled:hover:bg-teal-600 disabled:opacity-60"
                          @click="saveEdit(item.id)"
                        >
                          {{ savingEdit ? '保存中…' : '保存' }}
                        </button>
                        <button
                          type="button"
                          class="rounded-full border border-stone-200/80 bg-stone-50/90 px-4 py-2 text-[10px] tracking-[0.2em] text-stone-600 transition hover:border-stone-300 hover:bg-stone-100 hover:text-stone-800 dark:border-zinc-600/60 dark:bg-zinc-800/40 dark:text-zinc-300 dark:hover:bg-zinc-800/70"
                          @click="cancelEdit"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  </template>

                  <p
                    v-else
                    class="whitespace-pre-wrap text-[15px] leading-[1.85] text-stone-700 dark:text-zinc-200/95"
                  >
                    {{ item.content }}
                  </p>

                  <div
                    v-if="!isEditingDiary(item)"
                    class="flex flex-wrap justify-end gap-2 border-t border-stone-200/75 pt-3 opacity-100 transition-opacity duration-500 ease-out dark:border-zinc-800/70"
                  >
                    <button
                      type="button"
                      class="rounded-full border border-stone-200/75 bg-stone-50/80 px-3 py-1.5 text-[10px] tracking-[0.15em] text-stone-600 transition hover:border-teal-300/60 hover:bg-teal-50/80 hover:text-teal-800 dark:border-zinc-700/65 dark:bg-zinc-800/35 dark:text-zinc-300 dark:hover:text-teal-200"
                      @click="startEdit(item)"
                    >
                      修改
                    </button>
                    <button
                      type="button"
                      :disabled="deletingId != null && Number(deletingId) === Number(item.id)"
                      class="rounded-full border border-stone-200/75 bg-stone-50/80 px-3 py-1.5 text-[10px] tracking-[0.15em] text-stone-500 transition hover:border-red-300/60 hover:bg-red-50/50 hover:text-red-700 disabled:cursor-wait disabled:opacity-60 dark:border-zinc-700/65 dark:bg-zinc-800/35 dark:text-zinc-400 dark:hover:text-red-300"
                      @click="removeDiary(item.id)"
                    >
                      {{ deletingId != null && Number(deletingId) === Number(item.id) ? '删除中…' : '删除' }}
                    </button>
                  </div>
                </div>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.eco-fade-enter-active,
.eco-fade-leave-active {
  transition:
    opacity 0.5s ease,
    transform 0.5s ease;
}
.eco-fade-enter-from,
.eco-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@keyframes eco-breathe {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.45;
  }
  50% {
    transform: scale(1.06);
    opacity: 0.85;
  }
}

@keyframes eco-breathe-outer {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.35;
  }
  50% {
    transform: scale(1.12);
    opacity: 0.65;
  }
}

.eco-breathe-pulse {
  animation: eco-breathe-outer 2.4s ease-in-out infinite;
}

.eco-breathe-core {
  animation: eco-breathe 2.4s ease-in-out infinite;
}

.eco-breathe-text {
  animation: eco-breathe 3.2s ease-in-out infinite;
  opacity: 0.85;
}
</style>
