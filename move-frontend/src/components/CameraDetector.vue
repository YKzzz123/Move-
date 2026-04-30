<script setup>
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { FilesetResolver, PoseLandmarker, FaceLandmarker, DrawingUtils } from '@mediapipe/tasks-vision'
import {
  FACE_EYE_LANDMARK_INDEX,
  POSE_LANDMARK_INDEX,
  movementRuleById,
  movementRuleList,
} from '@/config/movementRules'

/** 与 package.json 中 @mediapipe/tasks-vision 版本一致，便于从 CDN 加载同版 wasm */
const MEDIAPIPE_TASKS_VISION_VERSION = '0.10.34'
const POSE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

const props = defineProps({
  /** 为 null 时同时检测全部规则；可指定 rule.id 只跑一项 */
  trackRuleId: { type: String, default: null },
  /** 顺序流中队列下标，与 trackRuleId 同时参与重置（避免同 id 连续出现时状态不刷） */
  sequenceStamp: { type: Number, default: 0 },
})

const emit = defineEmits(['actionComplete'])

const videoRef = ref(null)
const canvasRef = ref(null)
const status = ref('准备中…')
const videoDevices = ref([])
const selectedDeviceId = ref('')
const RULE_IDS = movementRuleList.map((r) => r.id)
/** 各规则当前是否满足姿态 + 累计时长 (ms) */
const holdInfo = ref(
  Object.fromEntries(RULE_IDS.map((id) => [id, { active: false, ms: 0 }])),
)

const detectionHint = computed(() => {
  const parts = []
  for (const [id, h] of Object.entries(holdInfo.value)) {
    if (!isRuleTracked(id)) continue
    const rule = movementRuleById[id]
    if (!rule) continue
    const name = rule.name
    const need = rule.params?.holdMs ?? 3000
    if (h.active && !repArmed[id]) {
      parts.push(`${name} 请稍松再计下一组`)
    } else {
      parts.push(`${name} ${(h.ms / 1000).toFixed(1)}s/${(need / 1000).toFixed(0)}s`)
    }
  }
  return parts.length ? parts.join(' · ') : ''
})

let poseLandmarker = null
let faceLandmarker = null
let drawingUtils = null
let rafId = 0
let lastVideoTs = 0
let lastFrameHoldTs = 0
let stream = null

const mirrorX = true

const holdLatched = Object.fromEntries(RULE_IDS.map((id) => [id, false]))

/** 为 true 时允许新一组计时；本组已达标后需先「松劲」(条件变假) 再为 true，避免连续计次 */
const repArmed = Object.fromEntries(RULE_IDS.map((id) => [id, true]))

function makeInitialHoldInfo() {
  return Object.fromEntries(RULE_IDS.map((id) => [id, { active: false, ms: 0 }]))
}

function resetAllHoldState() {
  for (const id of RULE_IDS) {
    holdLatched[id] = false
    repArmed[id] = true
  }
  holdInfo.value = makeInitialHoldInfo()
  lastFrameHoldTs = 0
}

function isRuleTracked(id) {
  return !props.trackRuleId || props.trackRuleId === id
}

function getEyeOpenMetrics(landmarks) {
  if (!landmarks || landmarks.length < 400) return null
  const I = FACE_EYE_LANDMARK_INDEX
  const p = (i) => landmarks[i]
  const dY = (a, b) => Math.abs(p(b).y - p(a).y)
  const left = dY(I.LEFT_EYE_TOP, I.LEFT_EYE_BOTTOM)
  const right = dY(I.RIGHT_EYE_TOP, I.RIGHT_EYE_BOTTOM)
  return { left, right }
}

function hasMinVisibility(landmarks, indices, minVisibility) {
  for (const i of indices) {
    if (!landmarks[i] || landmarks[i].visibility < minVisibility) return false
  }
  return true
}

function poseBothWristsAboveNose(landmarks, params) {
  if (!landmarks || landmarks.length < 17) return false
  const P = POSE_LANDMARK_INDEX
  const { minVisibility = 0.5, minWristAboveNoseY: dyMin = 0.03 } = params
  if (!hasMinVisibility(landmarks, [P.NOSE, P.LEFT_WRIST, P.RIGHT_WRIST], minVisibility)) return false
  const ny = landmarks[P.NOSE].y
  const ly = landmarks[P.LEFT_WRIST].y
  const ry = landmarks[P.RIGHT_WRIST].y
  return ny - ly > dyMin && ny - ry > dyMin
}

function poseSingleWristAboveNose(landmarks, params) {
  if (!landmarks || landmarks.length < 17) return false
  const P = POSE_LANDMARK_INDEX
  const { side = 'left', minVisibility = 0.5, minWristAboveNoseY: dyMin = 0.03 } = params
  const wristIdx = side === 'right' ? P.RIGHT_WRIST : P.LEFT_WRIST
  if (!hasMinVisibility(landmarks, [P.NOSE, wristIdx], minVisibility)) return false
  return landmarks[P.NOSE].y - landmarks[wristIdx].y > dyMin
}

function posePrayerChest(landmarks, params) {
  if (!landmarks || landmarks.length < 25) return false
  const P = POSE_LANDMARK_INDEX
  const {
    minVisibility = 0.5,
    maxWristGap = 0.08,
    midlineXTolerance = 0.08,
    chestYOffsetMin = -0.02,
    chestYOffsetMax = 0.16,
  } = params
  if (
    !hasMinVisibility(
      landmarks,
      [P.NOSE, P.LEFT_SHOULDER, P.RIGHT_SHOULDER, P.LEFT_WRIST, P.RIGHT_WRIST],
      minVisibility,
    )
  ) {
    return false
  }
  const lw = landmarks[P.LEFT_WRIST]
  const rw = landmarks[P.RIGHT_WRIST]
  const ls = landmarks[P.LEFT_SHOULDER]
  const rs = landmarks[P.RIGHT_SHOULDER]
  const wristGap = Math.hypot(lw.x - rw.x, lw.y - rw.y)
  if (wristGap > maxWristGap) return false
  const wristMidX = (lw.x + rw.x) / 2
  const wristMidY = (lw.y + rw.y) / 2
  const shoulderMidX = (ls.x + rs.x) / 2
  const shoulderMidY = (ls.y + rs.y) / 2
  if (Math.abs(wristMidX - shoulderMidX) > midlineXTolerance) return false
  const yDelta = wristMidY - shoulderMidY
  return yDelta >= chestYOffsetMin && yDelta <= chestYOffsetMax
}

function poseHandsOnHips(landmarks, params) {
  if (!landmarks || landmarks.length < 25) return false
  const P = POSE_LANDMARK_INDEX
  const { minVisibility = 0.5, maxWristHipDistance = 0.14 } = params
  if (!hasMinVisibility(landmarks, [P.LEFT_WRIST, P.RIGHT_WRIST, P.LEFT_HIP, P.RIGHT_HIP], minVisibility)) {
    return false
  }
  const l = Math.hypot(
    landmarks[P.LEFT_WRIST].x - landmarks[P.LEFT_HIP].x,
    landmarks[P.LEFT_WRIST].y - landmarks[P.LEFT_HIP].y,
  )
  const r = Math.hypot(
    landmarks[P.RIGHT_WRIST].x - landmarks[P.RIGHT_HIP].x,
    landmarks[P.RIGHT_WRIST].y - landmarks[P.RIGHT_HIP].y,
  )
  return l < maxWristHipDistance && r < maxWristHipDistance
}

function poseShoulderExpansion(landmarks, params) {
  if (!landmarks || landmarks.length < 17) return false
  const P = POSE_LANDMARK_INDEX
  const {
    minVisibility = 0.5,
    shoulderWristYTolerance: yTol = 0.1,
    wristSpanOverShoulderMinRatio: ratio = 1.8,
  } = params
  const idx = [P.LEFT_WRIST, P.RIGHT_WRIST, P.LEFT_SHOULDER, P.RIGHT_SHOULDER]
  if (!hasMinVisibility(landmarks, idx, minVisibility)) return false
  const lw = landmarks[P.LEFT_WRIST]
  const rw = landmarks[P.RIGHT_WRIST]
  const ls = landmarks[P.LEFT_SHOULDER]
  const rs = landmarks[P.RIGHT_SHOULDER]
  if (Math.abs(lw.y - ls.y) > yTol) return false
  if (Math.abs(rw.y - rs.y) > yTol) return false
  const wristXSpan = Math.abs(lw.x - rw.x)
  const shoulderXSpan = Math.abs(ls.x - rs.x)
  if (shoulderXSpan < 1e-4) return false
  return wristXSpan > ratio * shoulderXSpan
}

function poseArmsCrossChest(landmarks, params) {
  if (!landmarks || landmarks.length < 17) return false
  const P = POSE_LANDMARK_INDEX
  const { minVisibility = 0.5, maxWristToOppShoulderDistance = 0.16 } = params
  if (!hasMinVisibility(landmarks, [P.LEFT_WRIST, P.RIGHT_WRIST, P.LEFT_SHOULDER, P.RIGHT_SHOULDER], minVisibility))
    return false
  const leftToOpp = Math.hypot(
    landmarks[P.LEFT_WRIST].x - landmarks[P.RIGHT_SHOULDER].x,
    landmarks[P.LEFT_WRIST].y - landmarks[P.RIGHT_SHOULDER].y,
  )
  const rightToOpp = Math.hypot(
    landmarks[P.RIGHT_WRIST].x - landmarks[P.LEFT_SHOULDER].x,
    landmarks[P.RIGHT_WRIST].y - landmarks[P.LEFT_SHOULDER].y,
  )
  return leftToOpp < maxWristToOppShoulderDistance && rightToOpp < maxWristToOppShoulderDistance
}

function poseHandsBehindHead(landmarks, params) {
  if (!landmarks || landmarks.length < 17) return false
  const P = POSE_LANDMARK_INDEX
  const { minVisibility = 0.5, maxWristToEarDistance = 0.12, minWristAboveEyeY = 0.02 } = params
  if (!hasMinVisibility(landmarks, [P.LEFT_WRIST, P.RIGHT_WRIST, P.LEFT_EAR, P.RIGHT_EAR], minVisibility))
    return false
  const lDist = Math.hypot(
    landmarks[P.LEFT_WRIST].x - landmarks[P.LEFT_EAR].x,
    landmarks[P.LEFT_WRIST].y - landmarks[P.LEFT_EAR].y,
  )
  const rDist = Math.hypot(
    landmarks[P.RIGHT_WRIST].x - landmarks[P.RIGHT_EAR].x,
    landmarks[P.RIGHT_WRIST].y - landmarks[P.RIGHT_EAR].y,
  )
  const lAbove = landmarks[P.LEFT_EAR].y - landmarks[P.LEFT_WRIST].y > minWristAboveEyeY
  const rAbove = landmarks[P.RIGHT_EAR].y - landmarks[P.RIGHT_WRIST].y > minWristAboveEyeY
  return lDist < maxWristToEarDistance && rDist < maxWristToEarDistance && lAbove && rAbove
}

function poseNeckTurn(landmarks, params) {
  if (!landmarks || landmarks.length < 13) return false
  const P = POSE_LANDMARK_INDEX
  const { minVisibility = 0.5, direction = 'left', noseShiftOverShoulderRatio = 0.32 } = params
  if (!hasMinVisibility(landmarks, [P.NOSE, P.LEFT_SHOULDER, P.RIGHT_SHOULDER], minVisibility)) return false
  const ls = landmarks[P.LEFT_SHOULDER]
  const rs = landmarks[P.RIGHT_SHOULDER]
  const shoulderSpan = Math.abs(ls.x - rs.x)
  if (shoulderSpan < 1e-4) return false
  const shoulderMid = (ls.x + rs.x) / 2
  const shift = landmarks[P.NOSE].x - shoulderMid
  if (direction === 'left') return shift < -noseShiftOverShoulderRatio * shoulderSpan
  return shift > noseShiftOverShoulderRatio * shoulderSpan
}

function evaluateRule(rule, poseLm, faceLm) {
  const detector = rule?.params?.detector
  if (!detector) return false
  switch (detector) {
    case 'face_both_eyes_closed': {
      const m = getEyeOpenMetrics(faceLm)
      if (!m) return false
      const max = rule.params.closedEyelidSeparationMax ?? 0.012
      return m.left < max && m.right < max
    }
    case 'face_both_eyes_open': {
      const m = getEyeOpenMetrics(faceLm)
      if (!m) return false
      const min = rule.params.openEyelidSeparationMin ?? 0.016
      return m.left > min && m.right > min
    }
    case 'face_left_wink': {
      const m = getEyeOpenMetrics(faceLm)
      if (!m) return false
      const closedMax = rule.params.closedEyelidSeparationMax ?? 0.012
      const openMin = rule.params.openEyelidSeparationMin ?? 0.016
      return m.left < closedMax && m.right > openMin
    }
    case 'face_right_wink': {
      const m = getEyeOpenMetrics(faceLm)
      if (!m) return false
      const closedMax = rule.params.closedEyelidSeparationMax ?? 0.012
      const openMin = rule.params.openEyelidSeparationMin ?? 0.016
      return m.right < closedMax && m.left > openMin
    }
    case 'pose_both_wrists_above_nose':
      return poseBothWristsAboveNose(poseLm, rule.params)
    case 'pose_single_wrist_above_nose':
      return poseSingleWristAboveNose(poseLm, rule.params)
    case 'pose_prayer_chest':
      return posePrayerChest(poseLm, rule.params)
    case 'pose_hands_on_hips':
      return poseHandsOnHips(poseLm, rule.params)
    case 'pose_shoulder_expansion':
      return poseShoulderExpansion(poseLm, rule.params)
    case 'pose_arms_cross_chest':
      return poseArmsCrossChest(poseLm, rule.params)
    case 'pose_hands_behind_head':
      return poseHandsBehindHead(poseLm, rule.params)
    case 'pose_neck_turn':
      return poseNeckTurn(poseLm, rule.params)
    default:
      return false
  }
}

function updateRuleHold(id, conditionMet, deltaMs) {
  if (!isRuleTracked(id)) return
  const rule = movementRuleById[id]
  if (!rule) return
  const need = rule.params.holdMs
  const prev = holdInfo.value[id] || { active: false, ms: 0 }
  const entry = { ...prev }
  if (conditionMet) {
    if (!repArmed[id]) {
      entry.active = true
      entry.ms = 0
    } else if (holdLatched[id]) {
      entry.active = true
      entry.ms = need
    } else {
      const nextMs = (Number(prev.ms) || 0) + deltaMs
      entry.active = true
      entry.ms = nextMs
      if (nextMs >= need) {
        holdLatched[id] = true
        repArmed[id] = false
        emit('actionComplete', { id: rule.id, name: rule.name })
        holdLatched[id] = false
        entry.ms = 0
      }
    }
  } else {
    repArmed[id] = true
    entry.active = false
    entry.ms = 0
    holdLatched[id] = false
  }
  holdInfo.value = { ...holdInfo.value, [id]: entry }
}

function processDetections(poseRes, faceRes, videoTs, hasFaceModel) {
  const faceLm = faceRes?.faceLandmarks?.[0]
  const poseLm = poseRes?.landmarks?.[0]
  if (lastFrameHoldTs === 0) {
    lastFrameHoldTs = videoTs
  }
  const dt = Math.min(80, Math.max(0, videoTs - lastFrameHoldTs))
  lastFrameHoldTs = videoTs

  for (const rule of movementRuleList) {
    if (!isRuleTracked(rule.id)) continue
    if (rule.model === 'face' && !hasFaceModel) continue
    const ok = evaluateRule(rule, poseLm, faceLm)
    updateRuleHold(rule.id, !!ok, dt)
  }
}

function isObsOrVirtualLabel(label) {
  if (!label) return false
  return /obs|virtual|虚拟/i.test(label)
}

async function refreshVideoDeviceList() {
  const all = await navigator.mediaDevices.enumerateDevices()
  videoDevices.value = all.filter((d) => d.kind === 'videoinput')
}

function pickPreferredDeviceId() {
  const list = videoDevices.value
  const nonVirtual = list.find((d) => !isObsOrVirtualLabel(d.label))
  return nonVirtual?.deviceId || list[0]?.deviceId || ''
}

function stopStreamOnly() {
  if (stream) {
    for (const t of stream.getTracks()) t.stop()
    stream = null
  }
  if (videoRef.value) {
    videoRef.value.srcObject = null
  }
}

function resizeCanvasToVideo() {
  const video = videoRef.value
  const canvas = canvasRef.value
  if (!video || !canvas) return
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) return
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
}

function drawFrame() {
  const video = videoRef.value
  const canvas = canvasRef.value
  if (!video || !canvas || !poseLandmarker || !drawingUtils) {
    rafId = requestAnimationFrame(drawFrame)
    return
  }
  if (video.readyState < 2) {
    rafId = requestAnimationFrame(drawFrame)
    return
  }

  resizeCanvasToVideo()
  if (!canvas.width || !canvas.height) {
    rafId = requestAnimationFrame(drawFrame)
    return
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    rafId = requestAnimationFrame(drawFrame)
    return
  }

  const ts = performance.now()
  if (ts <= lastVideoTs) lastVideoTs = ts - 1
  lastVideoTs = ts

  const poseResult = poseLandmarker.detectForVideo(video, ts)
  let faceResult = null
  if (faceLandmarker) {
    try {
      faceResult = faceLandmarker.detectForVideo(video, ts)
    } catch {
      /* ignore */
    }
  }
  processDetections(
    poseResult,
    faceResult,
    ts,
    Boolean(faceLandmarker),
  )

  const { width, height } = canvas
  ctx.clearRect(0, 0, width, height)
  ctx.save()
  if (mirrorX) {
    ctx.translate(width, 0)
    ctx.scale(-1, 1)
  }

  for (const lm of poseResult.landmarks) {
    drawingUtils.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, {
      color: '#0d9488',
      lineWidth: 3,
    })
    drawingUtils.drawLandmarks(lm, {
      color: '#f97316',
      lineWidth: 1,
      radius: 3,
    })
  }

  ctx.restore()
  rafId = requestAnimationFrame(drawFrame)
}

async function openCameraStream(deviceId) {
  const constraints = {
    audio: false,
    video: deviceId
      ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
      : { width: { ideal: 1280 }, height: { ideal: 720 } },
  }
  return navigator.mediaDevices.getUserMedia(constraints)
}

async function acquireCameraStream() {
  stopStreamOnly()
  status.value = '请求摄像头…'

  let s = await openCameraStream()
  stream = s
  await refreshVideoDeviceList()

  const track = s.getVideoTracks()[0]
  const curId = track?.getSettings?.()?.deviceId
  const curLabel = track?.label || ''
  const preferred = pickPreferredDeviceId()

  if (preferred && curId && preferred !== curId && isObsOrVirtualLabel(curLabel)) {
    stopStreamOnly()
    s = await openCameraStream(preferred)
    stream = s
  }

  if (stream) {
    const id = stream.getVideoTracks()[0]?.getSettings?.()?.deviceId
    if (id) selectedDeviceId.value = id
  }

  return stream
}

async function onDeviceChange() {
  const id = selectedDeviceId.value
  if (!id) return
  stopStreamOnly()
  try {
    stream = await openCameraStream(id)
    const v = videoRef.value
    if (v) {
      v.srcObject = stream
      v.playsInline = true
      await v.play()
    }
  } catch (e) {
    status.value = '切换摄像头失败。'
    console.error(e)
  }
}

async function start() {
  const v = videoRef.value
  const canvas = canvasRef.value
  if (!v || !canvas) return

  try {
    await acquireCameraStream()
    v.srcObject = stream
    v.playsInline = true
    await v.play()
  } catch (e) {
    status.value = '无法打开摄像头，请检查权限。'
    console.error(e)
    return
  }

  if (stream) {
    const id = stream.getVideoTracks()[0]?.getSettings?.()?.deviceId
    if (id) selectedDeviceId.value = id
  }

  status.value = '加载视觉模型…'
  const wasmPath = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_TASKS_VISION_VERSION}/wasm`
  const vision = await FilesetResolver.forVisionTasks(wasmPath)

  const createPose = (delegate) =>
    PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: POSE_MODEL, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
    })

  try {
    poseLandmarker = await createPose('GPU')
  } catch (e) {
    console.warn('PoseLandmarker GPU 初始化失败，回退 CPU', e)
    poseLandmarker = await createPose('CPU')
  }

  // 与顺序流中「下一动作」可能从 Pose 切到面部一致，始终尝试加载 Face
  {
    const createFace = (delegate) =>
      FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      })
    try {
      faceLandmarker = await createFace('GPU')
    } catch (e) {
      console.warn('FaceLandmarker GPU 初始化失败，回退 CPU', e)
      try {
        faceLandmarker = await createFace('CPU')
      } catch (e2) {
        console.error('FaceLandmarker 无法加载，闭眼检测将不可用', e2)
        faceLandmarker = null
      }
    }
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    status.value = '无法创建画布上下文。'
    return
  }
  drawingUtils = new DrawingUtils(ctx)
  lastFrameHoldTs = 0
  lastVideoTs = 0
  status.value = '运行中'
  rafId = requestAnimationFrame(drawFrame)
}

function stop() {
  cancelAnimationFrame(rafId)
  rafId = 0
  if (poseLandmarker) {
    try {
      poseLandmarker.close()
    } catch {
      /* ignore */
    }
    poseLandmarker = null
  }
  if (faceLandmarker) {
    try {
      faceLandmarker.close()
    } catch {
      /* ignore */
    }
    faceLandmarker = null
  }
  drawingUtils = null
  stopStreamOnly()
  lastVideoTs = 0
  lastFrameHoldTs = 0
  videoDevices.value = []
  selectedDeviceId.value = ''
  resetAllHoldState()
}

watch(
  () => [props.trackRuleId, props.sequenceStamp],
  () => {
    resetAllHoldState()
  },
)

onMounted(() => {
  start()
})

onUnmounted(() => {
  stop()
})

defineExpose({
  start,
  stop,
})
</script>

<template>
  <div
    class="relative inline-block max-w-full overflow-hidden rounded-2xl border border-stone-200/60 bg-stone-900/5"
    :aria-label="status"
  >
    <div
      v-if="videoDevices.length > 0"
      class="absolute right-2 top-2 z-20 max-w-[min(100%,12rem)]"
    >
      <label class="sr-only" for="cam-select">选择摄像头</label>
      <select
        id="cam-select"
        v-model="selectedDeviceId"
        class="w-full cursor-pointer rounded-lg border border-stone-200/60 bg-white/90 px-2 py-1.5 text-left text-[11px] text-stone-800 shadow-sm backdrop-blur-sm"
        @change="onDeviceChange"
      >
        <option
          v-for="d in videoDevices"
          :key="d.deviceId"
          :value="d.deviceId"
        >
          {{ d.label || '摄像头' }}
        </option>
      </select>
    </div>
    <video
      ref="videoRef"
      class="block max-h-[min(70vh,720px)] w-auto max-w-full opacity-50"
      playsinline
      muted
    />
    <canvas
      ref="canvasRef"
      class="pointer-events-none absolute left-0 top-0 h-full w-full max-h-[min(70vh,720px)]"
    />
    <p
      v-if="status && status !== '运行中'"
      class="absolute left-2 top-2 rounded bg-black/50 px-2 py-1 text-xs text-white"
    >
      {{ status }}
    </p>
    <p
      v-else-if="detectionHint"
      class="absolute bottom-2 left-2 right-2 rounded bg-black/45 px-2 py-1.5 text-center text-[10px] leading-relaxed text-white/90"
    >
      {{ detectionHint }}
    </p>
  </div>
</template>
