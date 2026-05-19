import { defineStore } from 'pinia'

/**
 * 微运动全流程（选单 / 摄像头行功 / 结算）期间隐藏打卡旗帜等干扰元素。
 */
export const useWorkoutFocusStore = defineStore('workoutFocus', {
  state: () => ({
    immersiveWorkout: false,
  }),
  actions: {
    setImmersive(value) {
      this.immersiveWorkout = !!value
    },
  },
})
