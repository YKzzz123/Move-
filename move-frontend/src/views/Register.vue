<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/store/userStore'
import { westernZodiacFromIsoDate } from '@/utils/zodiac'

const router = useRouter()
const userStore = useUserStore()

const username = ref('')
const password = ref('')
const birthday = ref('')

const submitting = ref(false)
const formError = ref('')
const showSuccess = ref(false)

const zodiacPreview = computed(() => westernZodiacFromIsoDate(birthday.value))

async function onSubmit() {
  formError.value = ''
  if (!username.value.trim() || !password.value || !birthday.value) {
    formError.value = '请填写用户名、密码与生日。'
    return
  }
  submitting.value = true
  try {
    await userStore.register({
      username: username.value.trim(),
      password: password.value,
      birthday: birthday.value,
    })
    showSuccess.value = true
    window.setTimeout(() => {
      router.push('/')
    }, 1600)
  } catch (err) {
    if (!err?.response) {
      formError.value = `无法连接后端（${err?.message || '网络错误'}）。请确认已在 move-backend 启动 uvicorn（127.0.0.1:8001），并重启一次 npm run dev 以加载代理配置。`
    } else {
      const data = err.response?.data
      let detail
      if (typeof data === 'string') {
        try {
          detail = JSON.parse(data).detail
        } catch {
          detail = data
        }
      } else {
        detail = data?.detail
      }
      formError.value =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail.map((x) => (typeof x === 'string' ? x : x.msg || JSON.stringify(x))).join('；')
            : '注册未成功，请稍后再试。'
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="flex flex-1 flex-col px-6 pb-24 pt-10 sm:px-8">
    <div class="mx-auto grid w-full max-w-5xl flex-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] lg:items-start lg:gap-16">
      <div class="mx-auto w-full max-w-md">
        <p class="text-center text-[11px] tracking-[0.45em] text-stone-500 lg:text-left">新缘</p>
        <h1 class="mt-2 text-center text-xl font-extralight tracking-[0.28em] text-stone-800 lg:text-left">
          立号 · 入静
        </h1>
        <p class="mt-3 text-center text-[13px] leading-relaxed text-stone-600 lg:text-left">
          一用户名，一密语，一生日。<br class="sm:hidden" />
          星座猫咪将随你同行。
        </p>

        <form
          class="mt-12 rounded-[2.5rem] border border-stone-200/60 bg-white/80 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-md sm:p-10"
          @submit.prevent="onSubmit"
        >
          <div class="space-y-10">
            <div>
              <label class="mb-2 block text-[10px] tracking-[0.35em] text-stone-500" for="reg-user">用户名</label>
              <input
                id="reg-user"
                v-model="username"
                type="text"
                autocomplete="username"
                class="w-full border-0 border-b border-stone-200/80 bg-transparent py-2 text-stone-800 outline-none transition placeholder:text-stone-500/80 focus:border-teal-400/80 focus:ring-0"
                placeholder="字间留白"
              />
            </div>
            <div>
              <label class="mb-2 block text-[10px] tracking-[0.35em] text-stone-500" for="reg-pass">密码</label>
              <input
                id="reg-pass"
                v-model="password"
                type="password"
                autocomplete="new-password"
                class="w-full border-0 border-b border-stone-200/80 bg-transparent py-2 text-stone-800 outline-none transition placeholder:text-stone-500/80 focus:border-teal-400/80 focus:ring-0"
                placeholder="八位以上，勿与人说"
              />
            </div>
            <div>
              <label class="mb-2 block text-[10px] tracking-[0.35em] text-stone-500" for="reg-bday">公历生日</label>
              <input
                id="reg-bday"
                v-model="birthday"
                type="date"
                class="w-full max-w-full cursor-pointer rounded-2xl border border-stone-200/60 bg-[#FDFBF7]/80 px-4 py-3 text-stone-800 shadow-[inset_0_1px_2px_rgb(0,0,0,0.04)] outline-none transition [color-scheme:light] focus:border-teal-300/70 focus:ring-2 focus:ring-teal-100/50"
              />
            </div>
          </div>

          <p v-if="formError" class="mt-8 text-center text-[12px] text-stone-600">{{ formError }}</p>

          <button
            type="submit"
            :disabled="submitting"
            class="mt-10 w-full rounded-[2rem] bg-emerald-600 py-3.5 text-xs tracking-[0.45em] text-white shadow-[0_8px_24px_rgb(5,150,105,0.2)] transition enabled:hover:bg-emerald-600/95 disabled:cursor-wait disabled:opacity-80"
          >
            {{ submitting ? '正在写入…' : '完成注册' }}
          </button>

          <p class="mt-6 text-center text-[11px] text-stone-500">
            已有缘号？
            <RouterLink
              to="/login"
              class="text-teal-700 underline-offset-4 transition hover:underline"
            >去登录</RouterLink>
            <span class="mx-1 text-stone-300">·</span>
            <RouterLink to="/" class="text-stone-500 underline-offset-4 transition hover:text-teal-700">回首页</RouterLink>
          </p>
        </form>
      </div>

      <aside
        class="mx-auto flex w-full max-w-xs flex-col items-center justify-center lg:sticky lg:top-28"
        aria-label="星座预览"
      >
        <div
          class="flex aspect-square w-full max-w-[14rem] flex-col items-center justify-center rounded-[2.5rem] border border-stone-200/60 bg-gradient-to-b from-teal-50/50 via-[#FDFBF7] to-[#F0EBE3]/60 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
        >
          <p class="text-[10px] tracking-[0.4em] text-stone-500">星座小像</p>
          <p v-if="zodiacPreview" class="mt-4 font-serif text-3xl text-teal-800">
            {{ zodiacPreview.zh }}座
          </p>
          <p v-else class="mt-4 text-sm font-light text-stone-500">择日以观象</p>
          <p v-if="zodiacPreview" class="mt-1 text-[10px] tracking-[0.2em] text-stone-500">
            {{ zodiacPreview.en }}
          </p>
          <div
            class="mt-8 flex h-20 w-20 items-center justify-center rounded-full border border-stone-200/60 bg-white/80 shadow-[0_4px_16px_rgb(0,0,0,0.04)]"
            aria-hidden="true"
          >
            <span
              v-if="zodiacPreview"
              class="font-serif text-3xl text-teal-600/40"
            >猫</span>
            <span v-else class="text-2xl text-stone-300">·</span>
          </div>
        </div>
      </aside>
    </div>

    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showSuccess"
        class="fixed inset-0 z-50 flex items-center justify-center bg-stone-800/15 p-4 backdrop-blur-sm"
        role="status"
      >
        <div
          class="max-w-sm rounded-[2.5rem] border border-stone-200/60 bg-white/90 px-10 py-12 text-center shadow-[0_8px_30px_rgb(0,0,0,0.06)]"
        >
          <p class="text-[11px] tracking-[0.5em] text-stone-500">已成</p>
          <p class="mt-4 text-sm font-light leading-relaxed text-stone-800">
            号立于此，心可归矣。<br />
            将回到首页，与猫相逢。
          </p>
        </div>
      </div>
    </Transition>
  </div>
</template>
