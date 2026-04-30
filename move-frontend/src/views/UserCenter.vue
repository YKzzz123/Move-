<script setup>
import { RouterLink, useRouter } from 'vue-router'
import { useUserStore } from '@/store/userStore'

const router = useRouter()
const userStore = useUserStore()

function onLogout() {
  userStore.logout()
  router.push('/')
}
</script>

<template>
  <div class="flex flex-1 flex-col pb-16">
    <nav
      class="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-6 pt-4 sm:px-8"
    >
      <RouterLink
        to="/"
        class="inline-flex items-center gap-2 rounded-[2rem] border border-stone-200/60 bg-teal-50/90 px-4 py-2.5 text-[11px] tracking-[0.28em] text-teal-800 shadow-[0_4px_16px_rgb(0,0,0,0.04)] backdrop-blur-md transition hover:bg-teal-100"
      >
        <span aria-hidden="true" class="text-teal-600">←</span>
        返回首页
      </RouterLink>
      <button
        v-if="userStore.userId"
        type="button"
        @click="onLogout"
        class="rounded-[2rem] border border-stone-200/60 bg-white/80 px-4 py-2.5 text-[11px] tracking-[0.28em] text-stone-600 shadow-[0_4px_16px_rgb(0,0,0,0.04)] transition hover:border-stone-300/60 hover:bg-stone-50 hover:text-stone-800"
      >
        退出登录
      </button>
    </nav>

    <div class="mx-auto mt-8 w-full max-w-5xl flex-1 px-6 sm:px-8">
      <section
        class="relative overflow-hidden rounded-[2.5rem] border border-stone-200/60 bg-gradient-to-b from-[#FDFBF7] via-white/95 to-[#F0EBE3]/50 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-12"
      >
        <div
          aria-hidden="true"
          class="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-teal-100/30 blur-3xl"
        ></div>
        <div
          aria-hidden="true"
          class="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-emerald-100/25 blur-3xl"
        ></div>

        <div class="relative flex flex-col items-center text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
          <div class="flex flex-col items-center gap-6 sm:flex-row sm:items-end sm:gap-10">
            <div
              class="flex h-36 w-36 shrink-0 items-center justify-center rounded-[2.5rem] border border-stone-200/60 bg-gradient-to-br from-teal-50/90 via-[#FDFBF7] to-emerald-50/60 shadow-[inset_0_1px_2px_rgb(0,0,0,0.04)] ring-1 ring-white/70 sm:h-40 sm:w-40"
            >
              <span class="font-serif text-5xl text-teal-700/40" aria-hidden="true">猫</span>
            </div>
            <div>
              <p
                v-if="userStore.username"
                class="text-[10px] tracking-[0.35em] text-stone-500"
              >
                {{ userStore.username }}
              </p>
              <p class="mt-2 text-[11px] tracking-[0.45em] text-stone-500">星座小猫</p>
              <p class="mt-3 text-lg font-light tracking-[0.15em] text-stone-800">
                {{ userStore.zodiacCatType || '未绑定' }}
              </p>
              <p class="mt-2 text-[11px] text-stone-500">以生日为引，伴你修行</p>
            </div>
          </div>

          <div
            class="mt-10 flex flex-col items-center rounded-[2rem] border border-stone-200/60 bg-white/80 px-8 py-6 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-sm sm:mt-0 sm:min-w-[11rem]"
          >
            <span class="text-[10px] tracking-[0.5em] text-stone-500">累计真气</span>
            <span class="mt-2 font-light text-4xl tabular-nums text-teal-700 sm:text-5xl">
              {{ userStore.qiScore }}
            </span>
          </div>
        </div>
      </section>

      <section class="mt-10">
        <div class="flex items-baseline justify-between gap-4 px-1">
          <h2 class="text-sm font-normal tracking-[0.35em] text-stone-800">历史专注与微运动</h2>
          <span class="text-[10px] text-stone-500">静候流水</span>
        </div>

        <ul class="mt-6 space-y-4">
          <li
            class="flex items-center justify-between rounded-[2rem] border border-dashed border-stone-200/80 bg-white/50 px-6 py-10 text-center shadow-[0_4px_16px_rgb(0,0,0,0.03)]"
          >
            <p class="w-full text-sm font-light text-stone-500">
              暂无记录。完成专注与微运动后，将在此留白成诗。
            </p>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
