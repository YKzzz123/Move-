import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/store/userStore'

import Home from '@/views/Home.vue'
import Library from '@/views/Library.vue'
import UserCenter from '@/views/UserCenter.vue'
import EnergyStation from '@/views/EnergyStation.vue'
import Register from '@/views/Register.vue'
import Login from '@/views/Login.vue'

const routes = [
  { path: '/', name: 'Home', component: Home },
  { path: '/library', name: 'Library', component: Library },
  { path: '/register', name: 'Register', component: Register },
  { path: '/login', name: 'Login', component: Login },
  { path: '/user', name: 'UserCenter', component: UserCenter },
  { path: '/energy', name: 'EnergyStation', component: EnergyStation },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach((to) => {
  if (to.name !== 'UserCenter') return true
  const userStore = useUserStore()
  if (!userStore.userId) {
    return { name: 'Login', query: { redirect: to.fullPath } }
  }
  return true
})

export default router
