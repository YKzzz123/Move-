import { createRouter, createWebHistory } from 'vue-router'

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

export default router
