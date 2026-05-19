<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/store/userStore'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const username = ref('')
const password = ref('')

const submitting = ref(false)
const formError = ref('')

function safeRedirectPath(redirect) {
  if (typeof redirect !== 'string' || !redirect.startsWith('/') || redirect.startsWith('//')) {
    return '/'
  }
  return redirect
}

async function onSubmit() {
  formError.value = ''
  if (!username.value.trim() || !password.value) {
    formError.value = '请填写用户名与密码。'
    return
  }
  submitting.value = true
  try {
    await userStore.login({
      username: username.value.trim(),
      password: password.value,
    })
    await router.push(safeRedirectPath(route.query.redirect))
  } catch (err) {
    const d = err?.response?.data?.detail
    formError.value =
      typeof d === 'string'
        ? d
        : Array.isArray(d)
          ? d.map((x) => x.msg).join('；')
          : '登录未成功，请稍后再试。'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="flex flex-1 flex-col items-center px-6 pb-24 pt-10 sm:px-8">
    <div class="w-full max-w-md">
      <p class="text-center text-[11px] tracking-[0.45em] text-stone-500 dark:text-stone-400">归位</p>
      <h1 class="mt-2 text-center text-xl font-extralight tracking-[0.28em] text-stone-800 dark:text-stone-100">登号 · 入静</h1>
      <p class="mt-3 text-center text-[13px] leading-relaxed text-stone-600 dark:text-stone-400">
        以名与密语，续前缘。
      </p>

      <form
        class="mt-12 rounded-[2.5rem] border border-stone-200/60 bg-white/80 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-md dark:border-stone-600/55 dark:bg-stone-900/75 dark:shadow-[0_8px_30px_rgb(0,0,0,0.45)] sm:p-10"
        @submit.prevent="onSubmit"
      >
        <div class="space-y-10">
          <div>
            <label class="mb-2 block text-[10px] tracking-[0.35em] text-stone-500 dark:text-stone-400" for="login-user">用户名</label>
            <input
              id="login-user"
              v-model="username"
              type="text"
              autocomplete="username"
              class="w-full border-0 border-b border-stone-200/80 bg-transparent py-2 text-stone-800 outline-none transition placeholder:text-stone-500/80 focus:border-teal-400/80 focus:ring-0 dark:border-stone-600/70 dark:text-stone-100 dark:placeholder:text-stone-500/70 dark:focus:border-teal-400/65"
              placeholder="已立之名"
            />
          </div>
          <div>
            <label class="mb-2 block text-[10px] tracking-[0.35em] text-stone-500 dark:text-stone-400" for="login-pass">密码</label>
            <input
              id="login-pass"
              v-model="password"
              type="password"
              autocomplete="current-password"
              class="w-full border-0 border-b border-stone-200/80 bg-transparent py-2 text-stone-800 outline-none transition placeholder:text-stone-500/80 focus:border-teal-400/80 focus:ring-0 dark:border-stone-600/70 dark:text-stone-100 dark:placeholder:text-stone-500/70 dark:focus:border-teal-400/65"
              placeholder="心内之语"
            />
          </div>
        </div>

        <p v-if="formError" class="mt-8 text-center text-[12px] text-stone-600 dark:text-stone-400">{{ formError }}</p>

        <button
          type="submit"
          :disabled="submitting"
          class="mt-10 w-full rounded-[2rem] bg-teal-600 py-3.5 text-xs tracking-[0.45em] text-white shadow-[0_8px_24px_rgb(13,148,136,0.2)] transition enabled:hover:bg-teal-600/95 disabled:cursor-wait disabled:opacity-80"
        >
          {{ submitting ? '入静中…' : '进入' }}
        </button>

        <p class="mt-6 text-center text-[11px] text-stone-500 dark:text-stone-400">
          尚未立号？<RouterLink
            to="/register"
            class="text-teal-700 underline-offset-4 transition hover:underline dark:text-teal-300"
          >去注册</RouterLink>
        </p>
      </form>
    </div>
  </div>
</template>
