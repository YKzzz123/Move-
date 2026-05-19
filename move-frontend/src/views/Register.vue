<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/store/userStore'
import { resolveRegisterZodiacHappyPortraitUrl } from '@/config/catAssets'
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

/** 注册页专用：assets/cats/{中文或英文星座名}-h.png */
const registerCatPortraitUrl = computed(() =>
  resolveRegisterZodiacHappyPortraitUrl(
    zodiacPreview.value?.zh ?? '',
    zodiacPreview.value?.en ?? '',
    { guest: !userStore.userId },
  ),
)

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
    <header class="mx-auto mb-10 w-full max-w-md text-center">
      <p class="text-[11px] tracking-[0.45em] text-stone-500 dark:text-stone-400">新缘</p>
      <h1 class="mt-2 text-xl font-extralight tracking-[0.28em] text-stone-800 dark:text-stone-100">
        立号 · 入静
      </h1>
      <p class="mt-3 text-[13px] leading-relaxed text-stone-600 dark:text-stone-400">
        一用户名，一密语，一生日。<br class="sm:hidden" />
        星座猫咪将随你同行。
      </p>
    </header>

    <div class="relative mx-auto w-full max-w-md">
      <aside
        class="mx-auto mb-8 w-full max-w-[14rem] lg:absolute lg:right-full lg:top-0 lg:mx-0 lg:mb-0 lg:mr-3"
        aria-label="星座预览"
      >
        <div
          class="flex aspect-square w-full flex-col items-center justify-center rounded-[2.5rem] border border-stone-200/60 bg-gradient-to-b from-teal-50/50 via-[#FDFBF7] to-[#F0EBE3]/60 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:border-stone-600/55 dark:from-teal-950/40 dark:via-stone-900/85 dark:to-stone-950/90 dark:shadow-[0_8px_30px_rgb(0,0,0,0.45)]"
        >
          <p class="text-[10px] tracking-[0.4em] text-stone-500 dark:text-stone-400">星座小像</p>
          <p v-if="zodiacPreview" class="mt-4 font-serif text-3xl text-teal-800 dark:text-teal-300">
            {{ zodiacPreview.zh }}座
          </p>
          <p v-else class="mt-4 text-sm font-light text-stone-500 dark:text-stone-400">择日以观象</p>
          <p v-if="zodiacPreview" class="mt-1 text-[10px] tracking-[0.2em] text-stone-500 dark:text-stone-400">
            {{ zodiacPreview.en }}
          </p>
          <div
            class="mt-8 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-stone-200/60 bg-white/80 shadow-[0_4px_16px_rgb(0,0,0,0.04)] dark:border-stone-600/55 dark:bg-stone-900/65"
            aria-hidden="true"
          >
            <img
              :src="registerCatPortraitUrl"
              alt=""
              width="80"
              height="80"
              class="h-full w-full object-contain object-center"
            />
          </div>
        </div>
      </aside>

      <form
        class="w-full rounded-[2.5rem] border border-stone-200/60 bg-white/80 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-md dark:border-stone-600/55 dark:bg-stone-900/75 dark:shadow-[0_8px_30px_rgb(0,0,0,0.45)] sm:p-10"
        @submit.prevent="onSubmit"
      >
          <div class="space-y-10">
            <div>
              <label class="mb-2 block text-[10px] tracking-[0.35em] text-stone-500 dark:text-stone-400" for="reg-user">用户名</label>
              <input
                id="reg-user"
                v-model="username"
                type="text"
                autocomplete="username"
                class="w-full border-0 border-b border-stone-200/80 bg-transparent py-2 text-stone-800 outline-none transition placeholder:text-stone-500/80 focus:border-teal-400/80 focus:ring-0 dark:border-stone-600/70 dark:text-stone-100 dark:placeholder:text-stone-500/70 dark:focus:border-teal-400/65"
                placeholder="字间留白"
              />
            </div>
            <div>
              <label class="mb-2 block text-[10px] tracking-[0.35em] text-stone-500 dark:text-stone-400" for="reg-pass">密码</label>
              <input
                id="reg-pass"
                v-model="password"
                type="password"
                autocomplete="new-password"
                class="w-full border-0 border-b border-stone-200/80 bg-transparent py-2 text-stone-800 outline-none transition placeholder:text-stone-500/80 focus:border-teal-400/80 focus:ring-0 dark:border-stone-600/70 dark:text-stone-100 dark:placeholder:text-stone-500/70 dark:focus:border-teal-400/65"
                placeholder="八位以上，勿与人说"
              />
            </div>
            <div>
              <label class="mb-2 block text-[10px] tracking-[0.35em] text-stone-500 dark:text-stone-400" for="reg-bday">
                公历生日
              </label>
              <div class="relative w-full">
                <input
                  id="reg-bday"
                  v-model="birthday"
                  type="date"
                  class="reg-bday-input relative z-0 w-full max-w-full cursor-pointer rounded-2xl border border-stone-200/60 bg-[#FDFBF7]/80 px-4 py-3 shadow-[inset_0_1px_2px_rgb(0,0,0,0.04)] outline-none transition [color-scheme:light] focus:border-teal-300/70 focus:ring-2 focus:ring-teal-100/50 dark:border-stone-600/50 dark:bg-stone-800/80 dark:focus:border-teal-500/35 dark:focus:ring-teal-900/30 dark:[color-scheme:dark]"
                  :class="
                    birthday
                      ? 'text-stone-800 dark:text-stone-100'
                      : 'text-transparent caret-teal-600 dark:caret-teal-400'
                  "
                />
                <span
                  v-if="!birthday"
                  class="pointer-events-none absolute inset-y-0 left-4 right-12 z-10 flex items-center truncate text-[15px] tabular-nums tracking-normal text-stone-500 dark:text-stone-400"
                  aria-hidden="true"
                >
                  yyyy-mm-dd
                </span>
              </div>
            </div>
          </div>

          <p v-if="formError" class="mt-8 text-center text-[12px] text-stone-600 dark:text-stone-400">{{ formError }}</p>

          <button
            type="submit"
            :disabled="submitting"
            class="mt-10 w-full rounded-[2rem] bg-emerald-600 py-3.5 text-xs tracking-[0.45em] text-white shadow-[0_8px_24px_rgb(5,150,105,0.2)] transition enabled:hover:bg-emerald-600/95 disabled:cursor-wait disabled:opacity-80"
          >
            {{ submitting ? '正在写入…' : '完成注册' }}
          </button>

          <p class="mt-6 text-center text-[11px] text-stone-500 dark:text-stone-400">
            已有缘号？
            <RouterLink
              to="/login"
              class="text-teal-700 underline-offset-4 transition hover:underline dark:text-teal-300"
            >去登录</RouterLink>
          </p>
      </form>
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
        class="fixed inset-0 z-50 flex items-center justify-center bg-stone-800/15 p-4 backdrop-blur-sm dark:bg-black/60"
        role="status"
      >
        <div
          class="max-w-sm rounded-[2.5rem] border border-stone-200/60 bg-white/90 px-10 py-12 text-center shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:border-stone-600/55 dark:bg-stone-900/92 dark:shadow-[0_8px_30px_rgb(0,0,0,0.5)]"
        >
          <p class="text-[11px] tracking-[0.5em] text-stone-500 dark:text-stone-400">已成</p>
          <p class="mt-4 text-sm font-light leading-relaxed text-stone-800 dark:text-stone-100">
            号立于此，心可归矣。<br />
            将回到首页，与猫相逢。
          </p>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* 空值时避免 WebKit 再叠一层本地化占位（与 yyyy-mm-dd 浮层不一致） */
.reg-bday-input:invalid::-webkit-datetime-edit,
.reg-bday-input:invalid::-webkit-datetime-edit-fields-wrapper {
  color: transparent;
}
</style>
