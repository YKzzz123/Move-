<script setup>
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import {
  FilesetResolver,
  PoseLandmarker,
  FaceLandmarker,
  HandLandmarker,
  DrawingUtils,
} from '@mediapipe/tasks-vision'
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
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

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
    const det = rule.params?.detector
    const tag = h.hintTag ? `${h.hintTag} ` : ''
    if (h.active && !repArmed[id]) {
    const skipReleaseHint =
      det === 'hand_hegu_bump_reps' ||
      det === 'hand_palm_heel_pat_reps' ||
      det === 'pose_hand_wrist_circles' ||
      id === 'wrist_rotation_goalpost'
      if (!skipReleaseHint) {
        parts.push(`${name} 请稍松再计下一组`)
        continue
      }
    }
    /** 次数类：以 detector 为准，避免旧 hold 里残留 hintNeed=1000 等仍走秒数分支 */
    if (det === 'hand_hegu_bump_reps' || det === 'hand_palm_heel_pat_reps' || h.progressKind === 'reps') {
      const needN =
        det === 'hand_palm_heel_pat_reps'
          ? rule.params.patRepsNeeded ?? 8
          : det === 'hand_hegu_bump_reps'
            ? rule.params.bumpRepsNeeded ?? 8
            : h.repsNeed ?? 8
      const done = Math.min(needN, Math.max(0, Number(h.repsDone ?? 0)))
      const repTag =
        det === 'hand_palm_heel_pat_reps' ? '互拍' : det === 'hand_hegu_bump_reps' ? '对击' : h.hintTag || '计数'
      parts.push(`${name} ${repTag} ${done}/${needN} 次`)
      continue
    }
    if (
      id === 'wrist_rotation_goalpost' ||
      det === 'pose_hand_wrist_circles' ||
      h.progressKind === 'wrist_spin'
    ) {
      const needRev =
        h.spinTurnsNeed ?? rule.params.cwRevolutions ?? rule.params.ccwRevolutions ?? 10
      const frac = Math.max(0, Number(h.spinTurnsDone ?? 0))
      const dec = Math.round(frac * 10) / 10
      const turnStr = dec % 1 === 0 ? String(dec) : dec.toFixed(1)
      parts.push(`${name} ${tag}${turnStr}/${needRev} 圈`)
      continue
    }
    const need = h.hintNeed ?? rule.params?.holdMs ?? 3000
    parts.push(`${name} ${tag}${(h.ms / 1000).toFixed(1)}s/${(need / 1000).toFixed(0)}s`)
  }
  return parts.length ? parts.join(' · ') : ''
})

let poseLandmarker = null
let faceLandmarker = null
let handLandmarker = null
let drawingUtils = null
let rafId = 0
let lastVideoTs = 0
let lastFrameHoldTs = 0
let stream = null

const mirrorX = true

/** Face Landmarker 网格中与目周穴位大致对应的参考点索引 */
const FACE_ZONE_IDX = {
  LEFT_BROW_INNER: 107,
  RIGHT_BROW_INNER: 336,
  LEFT_EYE_INNER: 133,
  RIGHT_EYE_INNER: 362,
  LEFT_EYE_OUTER: 33,
  RIGHT_EYE_OUTER: 263,
  NOSE_BRIDGE: 168,
  LEFT_LOWER_LID: 145,
  RIGHT_LOWER_LID: 374,
}

/** 拇指尖、食指尖（按揉主力） */
const HAND_RUB_TIPS = [4, 8]

const EYE_HAND_FACE_IDS = ['eye_rub_cuanzhu', 'eye_press_jingming', 'eye_rub_sibai', 'eye_rub_taiyang']
const MOTION_TRAIL_IDS = [...EYE_HAND_FACE_IDS, 'palms_rub_warm']
const eyeRubTrailById = Object.fromEntries(MOTION_TRAIL_IDS.map((id) => [id, []]))
const cooldownUntil = Object.fromEntries(RULE_IDS.map((id) => [id, 0]))

let eyeRestPhaseState = { phase: 'close', ms: 0 }
let palmOpenCloseState = { phase: 'open', ms: 0 }
let wristStretchState = {
  leftDone: false,
  rightDone: false,
  leftHoldMs: 0,
  rightHoldMs: 0,
  gapMs: 0,
}
let wristSpinState = { stage: 'cw', acc: 0, prevAngle: null }
let chestNwState = { phase: 'narrow', ms: 0 }
let heguBumpState = { reps: 0, armed: true, prevDist: null }
let palmPatState = { reps: 0, armed: true, prevDist: null }

function clearMotionTrails() {
  for (const id of MOTION_TRAIL_IDS) eyeRubTrailById[id].length = 0
}

function resetPhasedAndCooldownState() {
  for (const id of RULE_IDS) cooldownUntil[id] = 0
  eyeRestPhaseState = { phase: 'close', ms: 0 }
  palmOpenCloseState = { phase: 'open', ms: 0 }
  wristStretchState = {
    leftDone: false,
    rightDone: false,
    leftHoldMs: 0,
    rightHoldMs: 0,
    gapMs: 0,
  }
  wristSpinState = { stage: 'cw', acc: 0, prevAngle: null }
  chestNwState = { phase: 'narrow', ms: 0 }
  heguBumpState = { reps: 0, armed: true, prevDist: null }
  palmPatState = { reps: 0, armed: true, prevDist: null }
  clearMotionTrails()
  for (const id of RULE_IDS) handFaceGraceRem[id] = 0
  for (const id of MOTION_TRAIL_IDS) {
    rubTrailAux[id] = { lastHitTs: 0 }
  }
}

const holdLatched = Object.fromEntries(RULE_IDS.map((id) => [id, false]))
/** 揉穴/搓手：轨迹容错；hand_face：短时丢识别不立即清空累计秒数 */
const handFaceGraceRem = Object.fromEntries(RULE_IDS.map((id) => [id, 0]))
const rubTrailAux = Object.fromEntries(MOTION_TRAIL_IDS.map((id) => [id, { lastHitTs: 0 }]))

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
  resetPhasedAndCooldownState()
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

function lmXY(faceLm, idx) {
  const p = faceLm[idx]
  if (!p || p.x == null || p.y == null) return null
  return { x: p.x, y: p.y }
}

/**
 * @returns {{ x: number, y: number, r: number }[] | null}
 */
function eyeAcupointZones(detector, faceLm, zoneRadius) {
  const r = zoneRadius
  const F = FACE_ZONE_IDX
  switch (detector) {
    case 'hand_face_rub_cuanzhu': {
      const a = lmXY(faceLm, F.LEFT_BROW_INNER)
      const b = lmXY(faceLm, F.RIGHT_BROW_INNER)
      if (!a || !b) return null
      return [
        { x: a.x, y: a.y, r },
        { x: b.x, y: b.y, r },
      ]
    }
    case 'hand_face_press_jingming': {
      const pts = [lmXY(faceLm, F.LEFT_EYE_INNER), lmXY(faceLm, F.RIGHT_EYE_INNER), lmXY(faceLm, F.NOSE_BRIDGE)]
      const ok = pts.filter(Boolean)
      if (ok.length < 2) return null
      const mx = ok.reduce((s, q) => s + q.x, 0) / ok.length
      const my = ok.reduce((s, q) => s + q.y, 0) / ok.length
      return [{ x: mx, y: my - 0.012, r: r * 1.08 }]
    }
    case 'hand_face_rub_sibai': {
      const l = lmXY(faceLm, F.LEFT_LOWER_LID)
      const rt = lmXY(faceLm, F.RIGHT_LOWER_LID)
      if (!l || !rt) return null
      const dy = 0.021
      return [
        { x: l.x, y: l.y + dy, r },
        { x: rt.x, y: rt.y + dy, r },
      ]
    }
    case 'hand_face_rub_taiyang': {
      const lo = lmXY(faceLm, F.LEFT_EYE_OUTER)
      const ro = lmXY(faceLm, F.RIGHT_EYE_OUTER)
      if (!lo || !ro) return null
      return [
        { x: lo.x - 0.052, y: lo.y - 0.014, r },
        { x: ro.x + 0.052, y: ro.y - 0.014, r },
      ]
    }
    default:
      return null
  }
}

function collectFingertipsInZones(handLandmarksList, zones, tipIndices = HAND_RUB_TIPS) {
  if (!handLandmarksList?.length || !zones?.length) return []
  const hits = []
  for (const handLm of handLandmarksList) {
    if (!handLm || handLm.length < 21) continue
    for (const ti of tipIndices) {
      const t = handLm[ti]
      if (!t || t.x == null || t.y == null) continue
      for (const z of zones) {
        if (Math.hypot(t.x - z.x, t.y - z.y) <= z.r) {
          hits.push({ x: t.x, y: t.y })
          break
        }
      }
    }
  }
  return hits
}

/** 揉动轨迹：短时无触点不立刻清空，超时 rubTrailGapClearMs 再清，减轻抖动导致的进度归零 */
function appendRubTrail(ruleId, ts, hits, windowMs, maxPoints, gapClearMs = 520) {
  const trail = eyeRubTrailById[ruleId]
  const aux = rubTrailAux[ruleId] || { lastHitTs: 0 }
  rubTrailAux[ruleId] = aux
  if (hits.length) {
    aux.lastHitTs = ts
    const cx = hits.reduce((s, h) => s + h.x, 0) / hits.length
    const cy = hits.reduce((s, h) => s + h.y, 0) / hits.length
    trail.push({ t: ts, x: cx, y: cy })
  } else if (aux.lastHitTs > 0 && ts - aux.lastHitTs > gapClearMs) {
    trail.length = 0
    aux.lastHitTs = 0
  }
  while (trail.length && ts - trail[0].t > windowMs) trail.shift()
  while (trail.length > maxPoints) trail.shift()
}

function rubMotionOk(ruleId, ts, params) {
  const windowMs = params.rubWindowMs ?? 560
  const minPath = params.minRubPath ?? 0.02
  const maxSpread = params.maxRubSpread ?? 0.072
  const minSamples = params.minRubSamples ?? 6
  const trail = eyeRubTrailById[ruleId]
  while (trail.length && ts - trail[0].t > windowMs) trail.shift()
  if (trail.length < minSamples) return false
  let path = 0
  for (let i = 1; i < trail.length; i++) path += Math.hypot(trail[i].x - trail[i - 1].x, trail[i].y - trail[i - 1].y)
  if (path < minPath) return false
  const mx = trail.reduce((s, p) => s + p.x, 0) / trail.length
  const my = trail.reduce((s, p) => s + p.y, 0) / trail.length
  const spread = Math.max(...trail.map((p) => Math.hypot(p.x - mx, p.y - my)))
  if (spread > maxSpread) return false
  return true
}

/** Hand + Face：指尖落在穴位邻域，且短时窗内位移累计与散布符合「轻揉」而非静止或大挥臂 */
function evaluateEyeHandFaceRub(rule, faceLm, handRes, ts) {
  const detector = rule.params?.detector
  if (!detector || !faceLm?.length) return false
  const hands = handRes?.landmarks
  if (!hands?.length) return false
  const zoneRadius = rule.params.zoneRadius ?? 0.1
  const zones = eyeAcupointZones(detector, faceLm, zoneRadius)
  if (!zones) return false
  const tips = rule.params.rubTipIndices || HAND_RUB_TIPS
  const hits = collectFingertipsInZones(hands, zones, tips)
  const windowMs = rule.params.rubWindowMs ?? 560
  const maxPoints = rule.params.rubTrailMaxPoints ?? 45
  const gapClear = rule.params.rubTrailGapClearMs ?? 550
  appendRubTrail(rule.id, ts, hits, windowMs, maxPoints, gapClear)
  return rubMotionOk(rule.id, ts, rule.params)
}

function handFingerSpreadAvg(handLm) {
  if (!handLm || handLm.length < 21) return 0
  const w = handLm[0]
  const tips = [8, 12, 16, 20]
  let s = 0
  for (const t of tips) s += Math.hypot(handLm[t].x - w.x, handLm[t].y - w.y)
  return s / 4
}

function bothHandsSpreadAbove(hands, minS) {
  return hands?.length >= 2 && handFingerSpreadAvg(hands[0]) >= minS && handFingerSpreadAvg(hands[1]) >= minS
}

function bothHandsFistBelow(hands, maxS) {
  return hands?.length >= 2 && handFingerSpreadAvg(hands[0]) <= maxS && handFingerSpreadAvg(hands[1]) <= maxS
}

function thumbTipDistance(hands) {
  if (!hands || hands.length < 2) return 1
  const a = hands[0][4]
  const b = hands[1][4]
  if (!a || !b) return 1
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function indexTipDistance(hands) {
  if (!hands || hands.length < 2) return 1
  const a = hands[0][8]
  const b = hands[1][8]
  if (!a || !b) return 1
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function wristDistance(hands) {
  if (!hands || hands.length < 2) return 1
  const a = hands[0][0]
  const b = hands[1][0]
  if (!a || !b) return 1
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function elbowAngleDegAt(shoulder, elbow, wrist) {
  const v1x = shoulder.x - elbow.x
  const v1y = shoulder.y - elbow.y
  const v2x = wrist.x - elbow.x
  const v2y = wrist.y - elbow.y
  const den = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y)
  if (den < 1e-8) return 0
  const c = (v1x * v2x + v1y * v2y) / den
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI
}

function wristPlaneAngle(handLm) {
  const w = handLm[0]
  const m = handLm[9]
  return Math.atan2(m.y - w.y, m.x - w.x)
}

function evaluatePalmsRubWarm(rule, handRes, ts) {
  const id = rule.id
  const aux = rubTrailAux[id] || { lastHitTs: 0 }
  rubTrailAux[id] = aux
  const trail = eyeRubTrailById[id]
  const gapClear = rule.params.rubGapClearMs ?? 520
  const maxGap = rule.params.maxWristGap ?? 0.14
  const hands = handRes?.landmarks
  if (!hands || hands.length < 2) {
    if (aux.lastHitTs > 0 && ts - aux.lastHitTs > gapClear) {
      trail.length = 0
      aux.lastHitTs = 0
    }
    return false
  }
  const w0 = hands[0][0]
  const w1 = hands[1][0]
  if (!w0 || !w1) return false
  const gap = Math.hypot(w0.x - w1.x, w0.y - w1.y)
  if (gap > maxGap) {
    if (aux.lastHitTs > 0 && ts - aux.lastHitTs > gapClear) {
      trail.length = 0
      aux.lastHitTs = 0
    }
    return false
  }
  aux.lastHitTs = ts
  trail.push({ t: ts, x: (w0.x + w1.x) / 2, y: (w0.y + w1.y) / 2 })
  const windowMs = rule.params.rubWindowMs ?? 520
  while (trail.length && ts - trail[0].t > windowMs) trail.shift()
  while (trail.length > 48) trail.shift()
  return rubMotionOk(rule.id, ts, rule.params)
}

function poseChestWideFront(landmarks, params) {
  if (!landmarks || landmarks.length < 17) return false
  const P = POSE_LANDMARK_INDEX
  const {
    minVisibility = 0.5,
    wideMinWristGap = 0.16,
    wideMaxWristGap = 0.7,
    wideMidlineXTolerance = 0.14,
    wideShoulderMidYDeltaMin = -0.05,
    wideShoulderMidYDeltaMax = 0.22,
  } = params
  if (!hasMinVisibility(landmarks, [P.NOSE, P.LEFT_SHOULDER, P.RIGHT_SHOULDER, P.LEFT_WRIST, P.RIGHT_WRIST], minVisibility))
    return false
  const lw = landmarks[P.LEFT_WRIST]
  const rw = landmarks[P.RIGHT_WRIST]
  const ls = landmarks[P.LEFT_SHOULDER]
  const rs = landmarks[P.RIGHT_SHOULDER]
  const gap = Math.hypot(lw.x - rw.x, lw.y - rw.y)
  if (gap < wideMinWristGap || gap > wideMaxWristGap) return false
  const wristMidX = (lw.x + rw.x) / 2
  const shoulderMidX = (ls.x + rs.x) / 2
  if (Math.abs(wristMidX - shoulderMidX) > wideMidlineXTolerance) return false
  const wristMidY = (lw.y + rw.y) / 2
  const shoulderMidY = (ls.y + rs.y) / 2
  const yDelta = wristMidY - shoulderMidY
  return yDelta >= wideShoulderMidYDeltaMin && yDelta <= wideShoulderMidYDeltaMax
}

/**
 * 屈肘旋腕专用：两臂大臂近似侧平举（近摄容差大）、屈肘约 90°±、双腕适度分开；
 * 不依赖耳点，适配半身近镜头。
 */
function poseWristRotationArmsHold(landmarks, params) {
  if (!landmarks || landmarks.length < 25) return false
  const P = POSE_LANDMARK_INDEX
  const {
    minVisibility = 0.38,
    armLevelYTol = 0.24,
    wristElbowMinSepY = 0.012,
    minElbowAngleDeg = 55,
    maxElbowAngleDeg = 135,
    minWristSpanOverShoulder = 0.18,
    maxWristMidlineDrift = 0.26,
  } = params
  const idx = [
    P.LEFT_SHOULDER,
    P.RIGHT_SHOULDER,
    P.LEFT_ELBOW,
    P.RIGHT_ELBOW,
    P.LEFT_WRIST,
    P.RIGHT_WRIST,
  ]
  if (!hasMinVisibility(landmarks, idx, minVisibility)) return false
  const ls = landmarks[P.LEFT_SHOULDER]
  const rs = landmarks[P.RIGHT_SHOULDER]
  const le = landmarks[P.LEFT_ELBOW]
  const re = landmarks[P.RIGHT_ELBOW]
  const lw = landmarks[P.LEFT_WRIST]
  const rw = landmarks[P.RIGHT_WRIST]
  if (Math.abs(le.y - ls.y) > armLevelYTol) return false
  if (Math.abs(re.y - rs.y) > armLevelYTol) return false
  const aL = elbowAngleDegAt(ls, le, lw)
  const aR = elbowAngleDegAt(rs, re, rw)
  if (aL < minElbowAngleDeg || aL > maxElbowAngleDeg) return false
  if (aR < minElbowAngleDeg || aR > maxElbowAngleDeg) return false
  if (le.y - lw.y < wristElbowMinSepY) return false
  if (re.y - rw.y < wristElbowMinSepY) return false
  const shoulderSpan = Math.max(0.07, Math.abs(ls.x - rs.x))
  const wristSpan = Math.abs(lw.x - rw.x)
  if (wristSpan / shoulderSpan < minWristSpanOverShoulder) return false
  const wristMidX = (lw.x + rw.x) / 2
  const shoulderMidX = (ls.x + rs.x) / 2
  if (Math.abs(wristMidX - shoulderMidX) > maxWristMidlineDrift) return false
  return true
}

const STRETCH_POSE_IDX = [
  POSE_LANDMARK_INDEX.LEFT_SHOULDER,
  POSE_LANDMARK_INDEX.LEFT_ELBOW,
  POSE_LANDMARK_INDEX.LEFT_WRIST,
  POSE_LANDMARK_INDEX.RIGHT_SHOULDER,
  POSE_LANDMARK_INDEX.RIGHT_ELBOW,
  POSE_LANDMARK_INDEX.RIGHT_WRIST,
  POSE_LANDMARK_INDEX.LEFT_INDEX,
  POSE_LANDMARK_INDEX.RIGHT_INDEX,
]

/** 手腕拉伸：仅 Pose；左臂有效 = 左伸直+水平 + 右手（腕/食指）靠近左腕；反之亦然 */
function updateWristStretch(rule, poseLm, dt) {
  const id = rule.id
  if (!isRuleTracked(id)) return
  const P = POSE_LANDMARK_INDEX
  const need = rule.params.stretchHoldMs ?? 25000
  const extMinDeg = rule.params.stretchElbowMinDeg ?? 140
  /** 近摄/半身：肩宽作尺度，混合绝对上限，避免 0.5m 时归一化偏差 */
  const yAbsMax = rule.params.stretchShoulderWristYAbsMax ?? 0.34
  const yScale = rule.params.stretchShoulderWristYScale ?? 1.25
  const yFloor = rule.params.stretchShoulderWristYFloor ?? 0.16
  const assistScale = rule.params.stretchAssistScale ?? 0.58
  const gapReset = rule.params.stretchGapResetMs ?? 1000
  const minVis = rule.params.minVisibility ?? 0.4
  const maxWristDropY = rule.params.stretchMaxWristBelowShoulderY ?? 0.16

  const prev = holdInfo.value[id] || { active: false, ms: 0 }
  const entry = { ...prev }
  const st = wristStretchState

  const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

  if (!poseLm || poseLm.length < 25 || !hasMinVisibility(poseLm, STRETCH_POSE_IDX, minVis)) {
    st.gapMs += dt
    if (st.gapMs > gapReset) {
      st.leftHoldMs = 0
      st.rightHoldMs = 0
      st.gapMs = 0
    }
    const progMs = !st.leftDone ? st.leftHoldMs : st.rightHoldMs
    entry.active = progMs > 0
    entry.ms = progMs
    entry.hintTag = !st.leftDone ? '左臂牵伸' : '右臂牵伸'
    entry.hintNeed = need
    holdInfo.value = { ...holdInfo.value, [id]: entry }
    return
  }

  const ls = poseLm[P.LEFT_SHOULDER]
  const le = poseLm[P.LEFT_ELBOW]
  const lw = poseLm[P.LEFT_WRIST]
  const rs = poseLm[P.RIGHT_SHOULDER]
  const re = poseLm[P.RIGHT_ELBOW]
  const rw = poseLm[P.RIGHT_WRIST]
  const lix = poseLm[P.LEFT_INDEX]
  const rix = poseLm[P.RIGHT_INDEX]

  const assistToLeftWrist = Math.min(dist2(lw, rw), dist2(lw, rix))
  const assistToRightWrist = Math.min(dist2(rw, lw), dist2(rw, lix))

  const shoulderSpan = Math.max(0.06, Math.abs(ls.x - rs.x))
  const horizTol = Math.min(yAbsMax, yScale * shoulderSpan + yFloor)
  const assistMax = assistScale * shoulderSpan

  const wristNotFarBelowL = lw.y <= ls.y + maxWristDropY
  const wristNotFarBelowR = rw.y <= rs.y + maxWristDropY

  const validLeft =
    elbowAngleDegAt(ls, le, lw) >= extMinDeg &&
    Math.abs(lw.y - ls.y) < horizTol &&
    wristNotFarBelowL &&
    assistToLeftWrist < assistMax

  const validRight =
    elbowAngleDegAt(rs, re, rw) >= extMinDeg &&
    Math.abs(rw.y - rs.y) < horizTol &&
    wristNotFarBelowR &&
    assistToRightWrist < assistMax

  let focus = null
  if (!st.leftDone && validLeft) focus = 'left'
  else if (!st.rightDone && validRight) focus = 'right'

  if (focus) {
    st.gapMs = 0
    if (focus === 'left') st.leftHoldMs += dt
    else st.rightHoldMs += dt
    if (st.leftHoldMs >= need) {
      st.leftDone = true
      st.leftHoldMs = 0
    }
    if (st.rightHoldMs >= need) {
      st.rightDone = true
      st.rightHoldMs = 0
    }
  } else {
    st.gapMs += dt
    if (st.gapMs > gapReset) {
      st.leftHoldMs = 0
      st.rightHoldMs = 0
      st.gapMs = 0
    }
  }

  if (st.leftDone && st.rightDone) {
    emitRepComplete(rule)
    wristStretchState = {
      leftDone: false,
      rightDone: false,
      leftHoldMs: 0,
      rightHoldMs: 0,
      gapMs: 0,
    }
    entry.active = false
    entry.ms = 0
    entry.hintTag = '左臂牵伸'
    entry.hintNeed = need
    holdInfo.value = { ...holdInfo.value, [id]: entry }
    return
  }

  const progMs = !st.leftDone ? st.leftHoldMs : st.rightHoldMs
  entry.active = focus != null || progMs > 0
  entry.ms = progMs
  entry.hintTag = !st.leftDone ? '左臂牵伸' : '右臂牵伸'
  entry.hintNeed = need
  holdInfo.value = { ...holdInfo.value, [id]: entry }
}

/** 屈肘侧举：肘与肩高接近、腕高于肘且远离耳，与托天 / 抱头区分；goalpostRelax 用于旋腕时略放宽 */
function poseArmsGoalpostHold(landmarks, params) {
  if (!landmarks || landmarks.length < 17) return false
  const P = POSE_LANDMARK_INDEX
  const relaxed = params.goalpostRelax === true
  const minVisibility = relaxed ? Math.min(params.minVisibility ?? 0.5, 0.44) : params.minVisibility ?? 0.5
  const elbowShoulderYTolerance = relaxed
    ? params.elbowShoulderYTolerance ?? 0.15
    : params.elbowShoulderYTolerance ?? 0.11
  const wristAboveElbowYMin = relaxed
    ? params.wristAboveElbowYMin ?? 0.026
    : params.wristAboveElbowYMin ?? 0.035
  const minWristAboveShoulderY = relaxed
    ? params.minWristAboveShoulderY ?? 0.008
    : params.minWristAboveShoulderY ?? 0.018
  const minWristEarDistance = params.minWristEarDistance ?? (relaxed ? 0.09 : 0.14)
  const maxBothWristAboveNoseY = relaxed
    ? params.maxBothWristAboveNoseY ?? 0.038
    : params.maxBothWristAboveNoseY ?? 0.028
  const idx = relaxed
    ? [P.NOSE, P.LEFT_WRIST, P.RIGHT_WRIST, P.LEFT_SHOULDER, P.RIGHT_SHOULDER, P.LEFT_ELBOW, P.RIGHT_ELBOW]
    : [
        P.NOSE,
        P.LEFT_WRIST,
        P.RIGHT_WRIST,
        P.LEFT_SHOULDER,
        P.RIGHT_SHOULDER,
        P.LEFT_ELBOW,
        P.RIGHT_ELBOW,
        P.LEFT_EAR,
        P.RIGHT_EAR,
      ]
  if (!hasMinVisibility(landmarks, idx, minVisibility)) return false
  const ls = landmarks[P.LEFT_SHOULDER]
  const rs = landmarks[P.RIGHT_SHOULDER]
  const le = landmarks[P.LEFT_ELBOW]
  const re = landmarks[P.RIGHT_ELBOW]
  const lw = landmarks[P.LEFT_WRIST]
  const rw = landmarks[P.RIGHT_WRIST]
  const ny = landmarks[P.NOSE].y
  if (Math.abs(le.y - ls.y) > elbowShoulderYTolerance) return false
  if (Math.abs(re.y - rs.y) > elbowShoulderYTolerance) return false
  if (le.y - lw.y < wristAboveElbowYMin) return false
  if (re.y - rw.y < wristAboveElbowYMin) return false
  if (ls.y - lw.y < minWristAboveShoulderY) return false
  if (rs.y - rw.y < minWristAboveShoulderY) return false
  if (!relaxed) {
    const dl = Math.hypot(lw.x - landmarks[P.LEFT_EAR].x, lw.y - landmarks[P.LEFT_EAR].y)
    const dr = Math.hypot(rw.x - landmarks[P.RIGHT_EAR].x, rw.y - landmarks[P.RIGHT_EAR].y)
    if (dl < minWristEarDistance || dr < minWristEarDistance) return false
  }
  const aboveL = ny - lw.y
  const aboveR = ny - rw.y
  if (aboveL > maxBothWristAboveNoseY && aboveR > maxBothWristAboveNoseY) return false
  return true
}

function evaluateRule(rule, poseLm, faceLm) {
  const detector = rule?.params?.detector
  if (!detector) return false
  switch (detector) {
    case 'pose_both_wrists_above_nose':
      return poseBothWristsAboveNose(poseLm, rule.params)
    case 'pose_arms_goalpost_hold':
      return poseArmsGoalpostHold(poseLm, rule.params)
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

function emitRepComplete(rule) {
  holdLatched[rule.id] = true
  repArmed[rule.id] = false
  emit('actionComplete', { id: rule.id, name: rule.name })
  holdLatched[rule.id] = false
  const det = rule.params?.detector
  /** 次数类：不应沿用「保持类」的请稍松逻辑，完成后立即允许下一组计数 */
  if (
    det === 'hand_hegu_bump_reps' ||
    det === 'hand_palm_heel_pat_reps' ||
    det === 'pose_hand_wrist_circles'
  ) {
    repArmed[rule.id] = true
  }
}

function bothEyesClosedMetrics(faceLm, maxSep) {
  const m = getEyeOpenMetrics(faceLm)
  if (!m) return false
  return m.left < maxSep && m.right < maxSep
}

function bothEyesOpenMetrics(faceLm, minSep) {
  const m = getEyeOpenMetrics(faceLm)
  if (!m) return false
  return m.left > minSep && m.right > minSep
}

function updateEyeRestOpenClose(rule, faceLm, dt, videoTs) {
  const id = rule.id
  if (!isRuleTracked(id)) return
  const cMax = rule.params.closedEyelidSeparationMax ?? 0.012
  const oMin = rule.params.openEyelidSeparationMin ?? 0.02
  const closeNeed = rule.params.closeHoldMs ?? 5000
  const openNeed = rule.params.openHoldMs ?? 3000
  const prev = holdInfo.value[id] || { active: false, ms: 0 }
  const entry = { ...prev }
  const st = eyeRestPhaseState
  if (st.phase === 'close') {
    const met = bothEyesClosedMetrics(faceLm, cMax)
    entry.hintTag = '用力闭眼'
    entry.hintNeed = closeNeed
    if (met) {
      if (!repArmed[id]) {
        entry.active = true
        entry.ms = 0
      } else {
        const nextMs = (Number(prev.ms) || 0) + dt
        entry.active = true
        entry.ms = nextMs
        if (nextMs >= closeNeed) {
          st.phase = 'open'
          entry.ms = 0
          repArmed[id] = true
        }
      }
    } else {
      repArmed[id] = true
      entry.active = false
      entry.ms = 0
    }
  } else {
    const met = bothEyesOpenMetrics(faceLm, oMin)
    entry.hintTag = '用力睁大'
    entry.hintNeed = openNeed
    if (met) {
      if (!repArmed[id]) {
        entry.active = true
        entry.ms = 0
      } else {
        const nextMs = (Number(prev.ms) || 0) + dt
        entry.active = true
        entry.ms = nextMs
        if (nextMs >= openNeed) {
          emitRepComplete(rule)
          st.phase = 'close'
          entry.ms = 0
          entry.active = false
        }
      }
    } else {
      repArmed[id] = true
      entry.active = false
      entry.ms = 0
    }
  }
  holdInfo.value = { ...holdInfo.value, [id]: entry }
}

function updatePalmOpenCloseCycle(rule, handRes, dt, videoTs) {
  const id = rule.id
  if (!isRuleTracked(id)) return
  const hands = handRes?.landmarks
  const openMin = rule.params.spreadOpenMin ?? 0.175
  const fistMax = rule.params.spreadFistMax ?? 0.13
  const openNeed = rule.params.openHoldMs ?? 5000
  const fistNeed = rule.params.fistHoldMs ?? 3000
  const openOk = bothHandsSpreadAbove(hands, openMin)
  const fistOk = bothHandsFistBelow(hands, fistMax)
  const prev = holdInfo.value[id] || { active: false, ms: 0 }
  const entry = { ...prev }
  const st = palmOpenCloseState
  if (st.phase === 'open') {
    entry.hintTag = '用力张开'
    entry.hintNeed = openNeed
    if (openOk) {
      if (!repArmed[id]) {
        entry.active = true
        entry.ms = 0
      } else {
        const nextMs = (Number(prev.ms) || 0) + dt
        entry.active = true
        entry.ms = nextMs
        if (nextMs >= openNeed) {
          st.phase = 'fist'
          entry.ms = 0
          repArmed[id] = true
        }
      }
    } else {
      repArmed[id] = true
      entry.active = false
      entry.ms = 0
    }
  } else {
    entry.hintTag = '用力握紧'
    entry.hintNeed = fistNeed
    if (fistOk) {
      if (!repArmed[id]) {
        entry.active = true
        entry.ms = 0
      } else {
        const nextMs = (Number(prev.ms) || 0) + dt
        entry.active = true
        entry.ms = nextMs
        if (nextMs >= fistNeed) {
          emitRepComplete(rule)
          st.phase = 'open'
          entry.ms = 0
          entry.active = false
        }
      }
    } else {
      repArmed[id] = true
      entry.active = false
      entry.ms = 0
    }
  }
  holdInfo.value = { ...holdInfo.value, [id]: entry }
}

function updateChestOpenClose(rule, poseLm, dt) {
  const id = rule.id
  if (!isRuleTracked(id)) return
  const p = rule.params
  const narrowOk = posePrayerChest(poseLm, {
    ...p,
    maxWristGap: p.narrowMaxWristGap ?? p.maxWristGap ?? 0.105,
    midlineXTolerance: p.narrowMidlineXTolerance ?? p.midlineXTolerance ?? 0.11,
    chestYOffsetMin: p.narrowChestYOffsetMin ?? p.chestYOffsetMin ?? -0.03,
    chestYOffsetMax: p.narrowChestYOffsetMax ?? p.chestYOffsetMax ?? 0.18,
  })
  const wideOk = poseChestWideFront(poseLm, p)
  const narrowNeed = rule.params.narrowHoldMs ?? 3000
  const wideNeed = rule.params.wideHoldMs ?? 3000
  const prev = holdInfo.value[id] || { active: false, ms: 0 }
  const entry = { ...prev }
  const st = chestNwState
  if (st.phase === 'narrow') {
    entry.hintTag = '胸前合'
    entry.hintNeed = narrowNeed
    if (narrowOk) {
      if (!repArmed[id]) {
        entry.active = true
        entry.ms = 0
      } else {
        const nextMs = (Number(prev.ms) || 0) + dt
        entry.active = true
        entry.ms = nextMs
        if (nextMs >= narrowNeed) {
          st.phase = 'wide'
          entry.ms = 0
          repArmed[id] = true
        }
      }
    } else {
      repArmed[id] = true
      entry.active = false
      entry.ms = 0
    }
  } else {
    entry.hintTag = '胸前开'
    entry.hintNeed = wideNeed
    if (wideOk) {
      if (!repArmed[id]) {
        entry.active = true
        entry.ms = 0
      } else {
        const nextMs = (Number(prev.ms) || 0) + dt
        entry.active = true
        entry.ms = nextMs
        if (nextMs >= wideNeed) {
          emitRepComplete(rule)
          st.phase = 'narrow'
          entry.ms = 0
          entry.active = false
        }
      }
    } else {
      repArmed[id] = true
      entry.active = false
      entry.ms = 0
    }
  }
  holdInfo.value = { ...holdInfo.value, [id]: entry }
}

function wristSpinProgressFields(p, stage, accRad) {
  const revCw = p.cwRevolutions ?? 10
  const revCcw = p.ccwRevolutions ?? 10
  const needRev = stage === 'cw' ? revCw : revCcw
  return {
    progressKind: 'wrist_spin',
    spinTurnsDone: accRad / (Math.PI * 2),
    spinTurnsNeed: needRev,
  }
}

function updateWristRotation(rule, poseLm, handRes, dt) {
  const id = rule.id
  if (!isRuleTracked(id)) return
  const p = rule.params
  const needCw = (p.cwRevolutions ?? 10) * Math.PI * 2
  const needCcw = (p.ccwRevolutions ?? 10) * Math.PI * 2
  const maxFrameRad = ((p.spinMaxDegPerFrame ?? 60) * Math.PI) / 180
  const hands = handRes?.landmarks
  const prev = holdInfo.value[id] || { active: false, ms: 0 }
  const entry = { ...prev }

  const spinPose = {
    minVisibility: p.wristSpinMinVisibility ?? p.minVisibility ?? 0.38,
    armLevelYTol: p.spinPoseArmLevelYTol ?? 0.24,
    wristElbowMinSepY: p.spinPoseWristElbowMinSepY ?? 0.012,
    minElbowAngleDeg: p.spinPoseMinElbowDeg ?? 55,
    maxElbowAngleDeg: p.spinPoseMaxElbowDeg ?? 135,
    minWristSpanOverShoulder: p.spinPoseMinWristSpanRatio ?? 0.18,
    maxWristMidlineDrift: p.spinPoseMaxMidlineDrift ?? 0.26,
  }
  if (!poseWristRotationArmsHold(poseLm, spinPose) || !hands?.length) {
    wristSpinState = { stage: 'cw', acc: 0, prevAngle: null }
    repArmed[id] = true
    entry.active = false
    entry.ms = 0
    entry.hintTag = '顺时转腕'
    entry.hintNeed = undefined
    Object.assign(entry, wristSpinProgressFields(p, 'cw', 0))
    holdInfo.value = { ...holdInfo.value, [id]: entry }
    return
  }

  let angSum = 0
  let angN = 0
  for (const hh of hands.slice(0, 2)) {
    if (hh?.length >= 21) {
      angSum += wristPlaneAngle(hh)
      angN++
    }
  }
  if (!angN) {
    wristSpinState = { stage: 'cw', acc: 0, prevAngle: null }
    repArmed[id] = true
    entry.active = false
    entry.ms = 0
    entry.hintTag = '顺时转腕'
    entry.hintNeed = undefined
    Object.assign(entry, wristSpinProgressFields(p, 'cw', 0))
    holdInfo.value = { ...holdInfo.value, [id]: entry }
    return
  }
  const ang = angSum / angN
  let { stage, acc, prevAngle } = wristSpinState
  if (prevAngle == null) {
    wristSpinState = { stage, acc: 0, prevAngle: ang }
    entry.hintTag = stage === 'cw' ? '顺时转腕' : '逆时转腕'
    entry.ms = 0
    entry.active = true
    entry.hintNeed = undefined
    Object.assign(entry, wristSpinProgressFields(p, stage, 0))
    holdInfo.value = { ...holdInfo.value, [id]: entry }
    return
  }
  let d = ang - prevAngle
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  if (d > maxFrameRad) d = maxFrameRad
  if (d < -maxFrameRad) d = -maxFrameRad

  if (stage === 'cw') {
    if (d > 0) acc += d
    if (acc >= needCw) {
      stage = 'ccw'
      acc = 0
      prevAngle = ang
    }
  } else {
    if (d < 0) acc -= d
    if (acc >= needCcw) {
      emitRepComplete(rule)
      stage = 'cw'
      acc = 0
      prevAngle = null
      wristSpinState = { stage, acc: 0, prevAngle: null }
      entry.active = false
      entry.ms = 0
      entry.hintTag = '顺时转腕'
      entry.hintNeed = undefined
      Object.assign(entry, wristSpinProgressFields(p, 'cw', 0))
      holdInfo.value = { ...holdInfo.value, [id]: entry }
      return
    }
  }

  wristSpinState = { stage, acc, prevAngle: ang }
  entry.hintTag = stage === 'cw' ? '顺时转腕' : '逆时转腕'
  entry.ms = 0
  entry.active = true
  entry.hintNeed = undefined
  Object.assign(entry, wristSpinProgressFields(p, stage, acc))
  holdInfo.value = { ...holdInfo.value, [id]: entry }
}

function tickKnockReps(rule, hands, state, kind) {
  const id = rule.id
  const need = kind === 'hegu' ? rule.params.bumpRepsNeeded ?? 8 : rule.params.patRepsNeeded ?? 8
  const hintTag = kind === 'hegu' ? '对击' : '互拍'
  const repFields = {
    progressKind: 'reps',
    repsDone: state.reps,
    repsNeed: need,
    hintTag,
    hintNeed: undefined,
  }
  if (!hands || hands.length < 2) {
    state.prevDist = null
    holdInfo.value = {
      ...holdInfo.value,
      [id]: {
        active: false,
        ms: 0,
        ...repFields,
        repsDone: state.reps,
      },
    }
    return
  }
  const closeMax =
    kind === 'hegu'
      ? (rule.params.closeMax ?? 0.095) * 1.06
      : (rule.params.closeMax ?? 0.1) * 1.05
  const farMin =
    kind === 'hegu' ? (rule.params.farMin ?? 0.105) * 0.94 : (rule.params.farMin ?? 0.11) * 0.94
  const d =
    kind === 'hegu'
      ? Math.min(thumbTipDistance(hands), indexTipDistance(hands))
      : wristDistance(hands)
  if (state.prevDist != null && state.prevDist > farMin && d < closeMax && state.armed) {
    state.reps++
    state.armed = false
  }
  if (d > farMin) state.armed = true
  state.prevDist = d
  if (state.reps >= need) {
    emitRepComplete(rule)
    state.reps = 0
    state.armed = true
    state.prevDist = null
  }
  holdInfo.value = {
    ...holdInfo.value,
    [id]: {
      active: true,
      ms: 0,
      ...repFields,
      repsDone: state.reps,
    },
  }
}

function updateRuleHold(id, conditionMet, deltaMs, videoTs = performance.now()) {
  if (!isRuleTracked(id)) return
  const rule = movementRuleById[id]
  if (!rule) return
  if (cooldownUntil[id] > videoTs) conditionMet = false
  const need = rule.params.holdMs ?? 3000
  const gapGrace = rule.params.holdGapGraceMs ?? 0
  let allowFreeze = false
  if (gapGrace > 0) {
    if (conditionMet) {
      handFaceGraceRem[id] = gapGrace
    } else {
      const rem = handFaceGraceRem[id] ?? 0
      if (rem > 0) {
        handFaceGraceRem[id] = Math.max(0, rem - deltaMs)
        allowFreeze = handFaceGraceRem[id] > 0
      } else {
        handFaceGraceRem[id] = 0
      }
    }
  }
  const holdOk = conditionMet || allowFreeze
  const prev = holdInfo.value[id] || { active: false, ms: 0 }
  const entry = {
    ...prev,
    hintTag: undefined,
    hintNeed: undefined,
    progressKind: undefined,
    repsDone: undefined,
    repsNeed: undefined,
    spinTurnsDone: undefined,
    spinTurnsNeed: undefined,
  }
  if (holdOk) {
    if (!repArmed[id]) {
      entry.active = true
      entry.ms = 0
    } else if (holdLatched[id]) {
      entry.active = true
      entry.ms = need
    } else {
      const add = conditionMet ? deltaMs : 0
      const nextMs = (Number(prev.ms) || 0) + add
      entry.active = true
      entry.ms = nextMs
      if (nextMs >= need) {
        holdLatched[id] = true
        repArmed[id] = false
        emit('actionComplete', { id: rule.id, name: rule.name })
        holdLatched[id] = false
        entry.ms = 0
        handFaceGraceRem[id] = 0
        const rest = rule.params.restAfterSetMs
        if (rest > 0) cooldownUntil[id] = videoTs + rest
      }
    }
  } else {
    repArmed[id] = true
    entry.active = false
    entry.ms = 0
    holdLatched[id] = false
    handFaceGraceRem[id] = 0
  }
  holdInfo.value = { ...holdInfo.value, [id]: entry }
}

function processDetections(poseRes, faceRes, handRes, videoTs, hasFaceModel, hasHandModel) {
  const faceLm = faceRes?.faceLandmarks?.[0]
  const poseLm = poseRes?.landmarks?.[0]
  if (lastFrameHoldTs === 0) {
    lastFrameHoldTs = videoTs
  }
  const dt = Math.min(80, Math.max(0, videoTs - lastFrameHoldTs))
  lastFrameHoldTs = videoTs

  for (const rule of movementRuleList) {
    if (!isRuleTracked(rule.id)) continue

    if (rule.id === 'eye_rest') {
      if (!hasFaceModel) continue
      updateEyeRestOpenClose(rule, faceLm, dt, videoTs)
      continue
    }

    if (rule.model === 'hand_face') {
      if (!hasFaceModel || !hasHandModel) continue
      if (cooldownUntil[rule.id] > videoTs) {
        eyeRubTrailById[rule.id].length = 0
        if (rubTrailAux[rule.id]) rubTrailAux[rule.id].lastHitTs = 0
        updateRuleHold(rule.id, false, dt, videoTs)
        continue
      }
      const ok = evaluateEyeHandFaceRub(rule, faceLm, handRes, videoTs)
      updateRuleHold(rule.id, !!ok, dt, videoTs)
      continue
    }

    if (rule.model === 'hand') {
      const hands = handRes?.landmarks
      const d = rule.params.detector
      const knock =
        d === 'hand_hegu_bump_reps' || d === 'hand_palm_heel_pat_reps'
      if (!hasHandModel && !knock) continue
      const handsForKnock = hasHandModel ? hands : null
      if (d === 'hand_palm_open_close_cycle') {
        updatePalmOpenCloseCycle(rule, handRes, dt, videoTs)
      } else if (d === 'hand_hegu_bump_reps') {
        tickKnockReps(rule, handsForKnock, heguBumpState, 'hegu')
      } else if (d === 'hand_palm_heel_pat_reps') {
        tickKnockReps(rule, handsForKnock, palmPatState, 'pat')
      } else if (!hasHandModel) {
        continue
      } else if (d === 'hand_five_spread_hold') {
        const ok = bothHandsSpreadAbove(hands, rule.params.spreadOpenMin ?? 0.175)
        updateRuleHold(rule.id, ok, dt, videoTs)
      } else if (d === 'hand_fist_wrap_hold') {
        const ok = bothHandsFistBelow(hands, rule.params.spreadFistMax ?? 0.12)
        updateRuleHold(rule.id, ok, dt, videoTs)
      } else if (d === 'hand_fingertips_press_hold') {
        const ok = hands?.length >= 2 && indexTipDistance(hands) < (rule.params.indexTipMaxGap ?? 0.045)
        updateRuleHold(rule.id, ok, dt, videoTs)
      } else if (d === 'hand_palms_rub_warm') {
        const ok = evaluatePalmsRubWarm(rule, handRes, videoTs)
        updateRuleHold(rule.id, ok, dt, videoTs)
      }
      continue
    }

    if (rule.model === 'pose_hand') {
      if (rule.params.detector === 'pose_hand_wrist_stretch') {
        updateWristStretch(rule, poseLm, dt)
      } else {
        if (!hasHandModel) continue
        if (rule.params.detector === 'pose_hand_wrist_circles') {
          updateWristRotation(rule, poseLm, handRes, dt)
        }
      }
      continue
    }

    if (rule.model === 'pose_phased') {
      if (rule.params.detector === 'pose_chest_open_close') {
        updateChestOpenClose(rule, poseLm, dt)
      }
      continue
    }

    if (rule.model === 'face' && !hasFaceModel) continue
    if (rule.model === 'pose') {
      const ok = evaluateRule(rule, poseLm, faceLm)
      updateRuleHold(rule.id, !!ok, dt, videoTs)
    }
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
  let handResult = null
  if (handLandmarker) {
    try {
      handResult = handLandmarker.detectForVideo(video, ts)
    } catch {
      handResult = null
    }
  }
  processDetections(
    poseResult,
    faceResult,
    handResult,
    ts,
    Boolean(faceLandmarker),
    Boolean(handLandmarker),
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

  {
    const createHand = (delegate) =>
      HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
      })
    try {
      handLandmarker = await createHand('GPU')
    } catch (e) {
      console.warn('HandLandmarker GPU 初始化失败，回退 CPU', e)
      try {
        handLandmarker = await createHand('CPU')
      } catch (e2) {
        console.error('HandLandmarker 无法加载，眼部按揉识别将不可用', e2)
        handLandmarker = null
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
  if (handLandmarker) {
    try {
      handLandmarker.close()
    } catch {
      /* ignore */
    }
    handLandmarker = null
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
    class="relative inline-block max-w-full overflow-hidden rounded-2xl border border-stone-200/60 bg-stone-900/5 dark:border-stone-600/50 dark:bg-stone-950"
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
        class="w-full cursor-pointer rounded-lg border border-stone-200/60 bg-white/90 px-2 py-1.5 text-left text-[11px] text-stone-800 shadow-sm backdrop-blur-sm dark:border-stone-600/55 dark:bg-stone-900/90 dark:text-stone-100"
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
