import acupointsById from './acupoints.json'

/**
 * 微运动规则：与 MediaPipe Face / Pose 检测配合使用。
 * Pose 33 点索引同 BlazePose；Face 为 478 点 mesh（与 Face Landmarker 一致）。
 */
export const POSE_LANDMARK_INDEX = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
}

/** 眼睑附近关键点：用于上下眼睑在 Y 轴上的相对距离（闭眼时距离变小） */
export const FACE_EYE_LANDMARK_INDEX = {
  LEFT_EYE_TOP: 159,
  LEFT_EYE_BOTTOM: 145,
  RIGHT_EYE_TOP: 386,
  RIGHT_EYE_BOTTOM: 374,
}

/**
 * @typedef {Object} MicroMovementParams
 * @property {number} [holdMs] - 条件持续多少毫秒后视为完成
 * @property {number} [minVisibility] - Pose 点最低 visibility
 * @property {Record<string, number>} [other] - 各动作专用阈值
 */

/**
 * @typedef {Object} MicroMovementRule
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} detection_logic
 * @property {'face'|'pose'} model - 主检测管线
 * @property {MicroMovementParams} params
 * @property {number} defaultSets - 默认组数
 * @property {number} qiPerSet - 每完成一组奖励的气值
 * @property {number} caloriesPerSet - 每组消耗卡路里（估算）
 * @property {string} bodyPart - 主要锻炼部位
 * @property {string} benefits - 疗愈益处简述
 * @property {string} instructionSummary - 一句话要点（含建议时长，供标签/看板）
 * @property {string} instruction - 面向用户的完整动作讲解（如何做、检测说明）
 * @property {string} essentials - 动作要领（细化版）
 * @property {string} physicalBenefits - 身体益处（细化版）
 * @property {string} tcmConnection - 中医脉络（细化版）
 * @property {{ name: string, x: number, y: number, labelX?: number, labelY?: number }[]} [acupoints] - 穴位名与坐标：x/y 为穴位点；labelX/labelY 为文字标签理想位置（均为 0–100 百分比）
 */

/**
 * 动作与穴位关系（只保留穴位 id）
 */
export const movementAcupointIds = {
  eye_rest: [
    'jingming_left',
    'jingming_right',
    'taiyang_left',
    'taiyang_right',
    'sibai_left',
    'sibai_right',
  ],
  left_wink: ['cuanzhu_left', 'jingming_left', 'taiyang_left'],
  right_wink: ['cuanzhu_right', 'jingming_right', 'taiyang_right'],
  eye_focus_open: ['yintang', 'cuanzhu_left', 'cuanzhu_right'],
  eye_soft_close: ['yintang', 'jingming_left', 'jingming_right'],

  hand_stretch: ['laogong_left', 'laogong_right', 'hegu_left', 'hegu_right'],
  left_hand_raise: ['laogong_left', 'hegu_left', 'neiguan_left'],
  right_hand_raise: ['laogong_right', 'hegu_right', 'neiguan_right'],
  prayer_chest: ['shanzhong', 'laogong_left', 'laogong_right'],
  hands_on_hips: ['qihai', 'huantiao_left', 'huantiao_right'],

  shoulder_expansion: [
    'dazhui',
    'fengchi_left',
    'fengchi_right',
    'jianjing_left',
    'jianjing_right',
    'tianzong_left',
    'tianzong_right',
  ],
  arms_cross_chest: ['jianjing_left', 'jianjing_right', 'naoshu_left', 'naoshu_right'],
  hands_behind_head: ['fengchi_left', 'fengchi_right', 'dazhui'],
  neck_turn_left: ['fengchi_left', 'jingjiaji_left', 'dazhui'],
  neck_turn_right: ['fengchi_right', 'jingjiaji_right', 'dazhui'],
}

function resolveAcupoints(ids) {
  return ids
    .map((id) => {
      const point = acupointsById[id]
      if (!point) {
        console.warn(`[movementRules] Missing acupoint id: ${id}`)
        return null
      }
      return point
    })
    .filter(Boolean)
}

export const eyeRest = {
  id: 'eye_rest',
  name: '熨目凝神',
  description: '闭合双眼，隔绝外物，让眼周气血随呼吸自然流转。',
  detection_logic:
    '使用 MediaPipe Face Landmarks。提取左眼（如 159 上眼睑, 145 下眼睑）和右眼（如 386 上眼睑, 374 下眼睑）的关键点。计算上下眼睑的相对 Y 轴距离，若距离小于设定阈值（即闭眼状态）且持续 5 秒，则触发 onActionComplete。',
  model: 'face',
  defaultSets: 3,
  qiPerSet: 10,
  caloriesPerSet: 5,
  bodyPart: '眼部',
  benefits: '敛神守内，缓释视屏久视之耗，助眼周血行，安神定意。',
  instructionSummary: '闭眼约 5 秒',
  instruction:
    '正对镜头，肩背放松，轻闭双眼，呼吸匀长。需稳定保持闭眼状态约 5 秒；系统通过眼睑开合识别计次，中途睁眼会重置进度。',
  essentials:
    '端坐或站立，脊背轻挺，下颌微收。先以三次深缓呼吸稳定节律，再轻闭双目，眉心放松，不要刻意紧皱眼周。保持面部肌群柔和，仅让呼吸牵引专注。',
  physicalBenefits:
    '可作为屏幕工作间隙的眼周放松动作，帮助缓解睫状肌紧张感，减轻额颞部疲劳，并在稳定呼吸配合下改善长时间专注后的紧绷状态。',
  tcmConnection:
    '此式意在引导目周气血回流，常与睛明、太阳、四白等眼周要穴联动理解。通过“闭目—调息—凝神”的节律，取其养肝明目、敛神安意之法。',
  acupoints: resolveAcupoints(movementAcupointIds.eye_rest),
  params: {
    detector: 'face_both_eyes_closed',
    holdMs: 5000,
    /** 单眼上下眼睑 |Δy| 小于此值（归一化）视为闭合 */
    closedEyelidSeparationMax: 0.012,
  },
}

export const leftWink = {
  id: 'left_wink',
  name: '左目凝息',
  description: '轻闭左眼，右目自然张开，维持片刻专注。',
  detection_logic:
    '使用 Face Landmarks。左眼上下眼睑距离低于阈值（闭合），右眼高于开启阈值（保持睁开），连续保持达标时计一组。',
  model: 'face',
  defaultSets: 3,
  qiPerSet: 8,
  caloriesPerSet: 3,
  bodyPart: '眼部',
  benefits: '分侧调动眼周肌群，缓解单侧紧张，提升左右眼协同控制。',
  instructionSummary: '左眼闭合、右眼睁开约 2 秒',
  instruction: '面部放松，轻闭左眼，右眼自然注视前方。避免耸肩与皱眉，稳定保持约 2 秒。',
  essentials:
    '保持头颈中正，左眼闭合时不要用力挤压眼眶，右眼维持柔和注视。呼吸平稳，避免屏息。',
  physicalBenefits:
    '可用于改善眼轮匝肌紧张与左右眼控制不均，减少长时间盯屏造成的局部疲劳感。',
  tcmConnection:
    '取睛明、攒竹、太阳等目周穴位，偏重疏解眼角与眉弓气滞，辅助调和头目经气。',
  acupoints: resolveAcupoints(movementAcupointIds.left_wink),
  params: {
    detector: 'face_left_wink',
    holdMs: 2000,
    closedEyelidSeparationMax: 0.012,
    openEyelidSeparationMin: 0.016,
  },
}

export const rightWink = {
  id: 'right_wink',
  name: '右目凝息',
  description: '轻闭右眼，左目自然张开，维持片刻专注。',
  detection_logic:
    '使用 Face Landmarks。右眼上下眼睑距离低于阈值（闭合），左眼高于开启阈值（保持睁开），连续保持达标时计一组。',
  model: 'face',
  defaultSets: 3,
  qiPerSet: 8,
  caloriesPerSet: 3,
  bodyPart: '眼部',
  benefits: '分侧训练眼周肌群，帮助缓解偏侧用眼疲劳。',
  instructionSummary: '右眼闭合、左眼睁开约 2 秒',
  instruction: '面部放松，轻闭右眼，左眼自然注视前方。避免颈部代偿，保持约 2 秒。',
  essentials:
    '头颈保持中立位，右眼闭合动作宜轻柔，左眼保持稳定聚焦。配合自然呼吸，不要憋气。',
  physicalBenefits:
    '有助于眼周微肌群控制训练，降低偏侧紧张，改善用眼后的局部酸胀。',
  tcmConnection:
    '同样围绕睛明、攒竹、太阳等目周要点，取其疏风明目、调和头目经络之义。',
  acupoints: resolveAcupoints(movementAcupointIds.right_wink),
  params: {
    detector: 'face_right_wink',
    holdMs: 2000,
    closedEyelidSeparationMax: 0.012,
    openEyelidSeparationMin: 0.016,
  },
}

export const eyeFocusOpen = {
  id: 'eye_focus_open',
  name: '开目定神',
  description: '双目轻开，凝视前方一点，保持稳定不眨。',
  detection_logic:
    '使用 Face Landmarks。双眼上下眼睑距离均高于开启阈值，连续保持达标时计一组。',
  model: 'face',
  defaultSets: 3,
  qiPerSet: 8,
  caloriesPerSet: 3,
  bodyPart: '眼部',
  benefits: '提升凝视稳定度，减轻频繁对焦切换造成的视觉疲劳。',
  instructionSummary: '双眼睁开定视约 3 秒',
  instruction: '双目平视前方，眼神柔和稳定，不刻意睁大。保持约 3 秒，期间尽量减少眨眼。',
  essentials:
    '颈项放松，目光平稳，避免瞪眼。以自然呼吸维持专注，保持面部肌群柔和。',
  physicalBenefits:
    '可训练视觉专注耐力，减轻频繁切屏后的眼部不适，并改善短时注意涣散。',
  tcmConnection:
    '重在“神聚于目”，常与印堂、攒竹等前额目周区域合参，取宁神定志之意。',
  acupoints: resolveAcupoints(movementAcupointIds.eye_focus_open),
  params: {
    detector: 'face_both_eyes_open',
    holdMs: 3000,
    openEyelidSeparationMin: 0.016,
  },
}

export const eyeSoftClose = {
  id: 'eye_soft_close',
  name: '合目养津',
  description: '双目轻合，放松眼周，短时静养目神。',
  detection_logic:
    '使用 Face Landmarks。双眼上下眼睑距离均低于闭合阈值，连续保持达标时计一组。',
  model: 'face',
  defaultSets: 3,
  qiPerSet: 8,
  caloriesPerSet: 3,
  bodyPart: '眼部',
  benefits: '快速舒缓眼周压力，帮助视觉系统从高负荷状态过渡到休息状态。',
  instructionSummary: '双眼轻闭约 2 秒',
  instruction: '保持头面放松，双目轻闭，不要用力压紧眼睑。稳定约 2 秒后自然睁开。',
  essentials:
    '闭目动作要轻柔，避免眉间用力。可配合鼻息绵长，感受眼周逐步放松。',
  physicalBenefits:
    '适合作为高频工作间隙的微恢复动作，减轻干涩与酸胀，提升后续用眼舒适度。',
  tcmConnection:
    '取“闭目内观、敛神养目”之法，常与印堂、睛明区域联想，助于平复目系亢张。',
  acupoints: resolveAcupoints(movementAcupointIds.eye_soft_close),
  params: {
    detector: 'face_both_eyes_closed',
    holdMs: 2000,
    closedEyelidSeparationMax: 0.012,
  },
}

export const handStretch = {
  id: 'hand_stretch',
  name: '托天理气',
  description: '双手交叉上托，拔伸脊柱，疏通三焦经络，引气血上行。',
  detection_logic:
    '使用 MediaPipe Pose。提取 LEFT_WRIST (15), RIGHT_WRIST (16) 和 NOSE (0) 的坐标。判断规则：LEFT_WRIST 和 RIGHT_WRIST 的 Y 坐标均显著小于 NOSE 的 Y 坐标（在图像坐标系中，Y值越小位置越高，即双手举过头顶），且保持该状态 3 秒，即可判定达标。',
  model: 'pose',
  defaultSets: 3,
  qiPerSet: 10,
  caloriesPerSet: 5,
  bodyPart: '手部',
  benefits: '上举拔伸，疏理三焦气机，通肩臂、助胸廓开阖。',
  instructionSummary: '双手举过头顶约 3 秒',
  instruction:
    '双手可交叉或分开上托，双臂充分上举，使双手手腕明显高于鼻尖（像托天）。保持该姿势约 3 秒直至提示完成；若手臂下落或高度不足，进度会暂停。',
  essentials:
    '双足与肩同宽，骨盆中立，脊柱向上延展。吸气时双臂上举，掌根向上“托”而肩胛向下沉，避免耸肩代偿；呼气时维持躯干稳定，感受掌心与前臂持续伸展。',
  physicalBenefits:
    '有助于改善久坐后胸廓受限与上肢僵硬，激活肩臂与躯干协同发力，提升肩关节活动舒适度，并对上背部紧绷与呼吸浅快有一定调节作用。',
  tcmConnection:
    '动作取“上托以宣上焦”之意，常与劳宫、合谷、内关等手部与前臂要穴联想。通过拔伸上肢经脉，寓意疏通三焦、和畅气机，使清阳得升。',
  acupoints: resolveAcupoints(movementAcupointIds.hand_stretch),
  params: {
    detector: 'pose_both_wrists_above_nose',
    holdMs: 3000,
    minVisibility: 0.5,
    /** 手腕 y 需比鼻 y 至少小该值，表示「显著高于」鼻尖（归一化） */
    minWristAboveNoseY: 0.035,
  },
}

export const leftHandRaise = {
  id: 'left_hand_raise',
  name: '左臂引气',
  description: '左臂上举过头，单侧拔伸肩臂经络。',
  detection_logic:
    '使用 Pose。左腕 y 坐标显著高于鼻尖（左腕更靠画面上方），并稳定保持约 2 秒判定完成。',
  model: 'pose',
  defaultSets: 3,
  qiPerSet: 9,
  caloriesPerSet: 4,
  bodyPart: '手部',
  benefits: '改善单侧肩臂僵硬，提升左右协调，缓解久坐后上肢紧张。',
  instructionSummary: '左手举过头顶约 2 秒',
  instruction: '左臂向上伸展，右臂自然下垂。躯干保持正直不侧倾，稳定约 2 秒。',
  essentials:
    '上举时避免耸肩，掌心可向前或向内，保持躯干中立与呼吸顺畅。',
  physicalBenefits:
    '可增强单侧上肢控制能力，缓解颈肩—上臂链路紧绷，改善姿态不平衡。',
  tcmConnection:
    '偏重手太阴与手阳明经路的上行拔伸，以单侧引导气机，通利肩臂。',
  acupoints: resolveAcupoints(movementAcupointIds.left_hand_raise),
  params: {
    detector: 'pose_single_wrist_above_nose',
    side: 'left',
    holdMs: 2000,
    minVisibility: 0.5,
    minWristAboveNoseY: 0.03,
  },
}

export const rightHandRaise = {
  id: 'right_hand_raise',
  name: '右臂引气',
  description: '右臂上举过头，单侧拔伸肩臂经络。',
  detection_logic:
    '使用 Pose。右腕 y 坐标显著高于鼻尖（右腕更靠画面上方），并稳定保持约 2 秒判定完成。',
  model: 'pose',
  defaultSets: 3,
  qiPerSet: 9,
  caloriesPerSet: 4,
  bodyPart: '手部',
  benefits: '缓解右侧肩臂疲劳，增强单侧稳定控制。',
  instructionSummary: '右手举过头顶约 2 秒',
  instruction: '右臂向上伸展，左臂自然下垂。身体保持稳定不歪斜，保持约 2 秒。',
  essentials:
    '避免抬肩代偿，保持脊柱延展与呼吸均匀，动作以稳定为先。',
  physicalBenefits:
    '可提升单侧肩臂活动控制，缓解偏侧疲劳，改善长时单手操作后的僵紧。',
  tcmConnection:
    '取单侧上举通络之意，促进手经气血上达，助于肩臂经路舒展。',
  acupoints: resolveAcupoints(movementAcupointIds.right_hand_raise),
  params: {
    detector: 'pose_single_wrist_above_nose',
    side: 'right',
    holdMs: 2000,
    minVisibility: 0.5,
    minWristAboveNoseY: 0.03,
  },
}

export const prayerChest = {
  id: 'prayer_chest',
  name: '合掌聚息',
  description: '双掌于胸前合十，稳定中线与呼吸。',
  detection_logic:
    '使用 Pose。左右手腕间距足够近，且双腕中点位于胸前中线附近，持续保持约 2.5 秒判定完成。',
  model: 'pose',
  defaultSets: 3,
  qiPerSet: 9,
  caloriesPerSet: 4,
  bodyPart: '手部',
  benefits: '提升上肢与躯干中线控制，减轻肩前侧紧张。',
  instructionSummary: '胸前合掌约 2.5 秒',
  instruction: '双掌在胸前相合，肘部自然外展。维持肩部放松，保持约 2.5 秒。',
  essentials:
    '掌根轻贴，手腕不过度上提，胸廓自然展开，呼吸平稳。',
  physicalBenefits:
    '可改善肩胸前侧紧绷，增强中线稳定，适合作为上肢动作间的过渡恢复。',
  tcmConnection:
    '合掌于胸，寓意敛气归中，常与膻中区域气机调和相联系。',
  acupoints: resolveAcupoints(movementAcupointIds.prayer_chest),
  params: {
    detector: 'pose_prayer_chest',
    holdMs: 2500,
    minVisibility: 0.5,
    maxWristGap: 0.08,
    midlineXTolerance: 0.08,
    chestYOffsetMin: -0.02,
    chestYOffsetMax: 0.16,
  },
}

export const handsOnHips = {
  id: 'hands_on_hips',
  name: '叉腰稳桩',
  description: '双手轻扶髋部，沉肩立稳，收束上肢浮动。',
  detection_logic:
    '使用 Pose。左右手腕分别接近同侧髋部，且保持可见度达标，持续约 2.5 秒判定完成。',
  model: 'pose',
  defaultSets: 3,
  qiPerSet: 9,
  caloriesPerSet: 4,
  bodyPart: '手部',
  benefits: '帮助建立站姿稳定，缓解上肢悬空造成的肩颈代偿。',
  instructionSummary: '双手扶髋约 2.5 秒',
  instruction: '双手自然叉腰，肩放松，躯干中正。稳定保持约 2.5 秒。',
  essentials:
    '手掌轻贴髋侧，不要压肩耸肩。保持头顶上提、骨盆中立、呼吸顺畅。',
  physicalBenefits:
    '可提升站姿控制与核心参与感，减轻肩颈无效紧张。',
  tcmConnection:
    '扶髋稳桩，重在固摄中下焦，配合气海、环跳区域意守，有助气机下沉稳定。',
  acupoints: resolveAcupoints(movementAcupointIds.hands_on_hips),
  params: {
    detector: 'pose_hands_on_hips',
    holdMs: 2500,
    minVisibility: 0.5,
    maxWristHipDistance: 0.14,
  },
}

export const shoulderExpansion = {
  id: 'shoulder_expansion',
  name: '展臂舒胸',
  description: '双臂平举外展，扩张胸腔，化解肩颈淤堵，纳天地清气。',
  detection_logic:
    '使用 MediaPipe Pose。提取 LEFT_WRIST (15), RIGHT_WRIST (16), LEFT_SHOULDER (11) 和 RIGHT_SHOULDER (12)。判断规则：1. 左右手腕的 Y 坐标与对应肩部 Y 坐标的差值在容差范围内（确保手臂是平举的）；2. LEFT_WRIST 和 RIGHT_WRIST 的 X 坐标欧几里得距离，大于左右肩膀宽度距离的 1.8 倍（确保手臂充分向外扩展）。满足条件并保持 3 秒即判定达标。',
  model: 'pose',
  defaultSets: 3,
  qiPerSet: 10,
  caloriesPerSet: 5,
  bodyPart: '肩颈',
  benefits: '展臂开胸，化解肩背淤堵，改善圆肩含胸，令气机畅达。',
  instructionSummary: '展臂平举约 3 秒',
  instruction:
    '双臂向两侧抬至与肩大致同高，掌心可向下或朝前，两腕略向外展开，像打开胸腔。保持平举外展约 3 秒；身体尽量正对镜头，确保肩、腕关系被完整识别。',
  essentials:
    '站姿稳定，尾闾微收，头顶有上提感。双臂平举时先放松颈项，再向两侧舒展，不强行后仰。保持胸廓自然展开与肩胛后下沉，避免颈部代偿性紧张。',
  physicalBenefits:
    '可用于改善肩颈前倾、圆肩含胸等姿态倾向，增强肩背后侧肌群参与，缓解久坐伏案造成的颈肩压力，并提升上背与胸廓的活动协调性。',
  tcmConnection:
    '此式侧重督脉与足太阳膀胱经相关区域的舒展感，常结合大椎、风池、肩井、天宗等背项穴位理解。以展臂开胸之势，寓意通阳散滞、宣畅颈肩气血。',
  acupoints: resolveAcupoints(movementAcupointIds.shoulder_expansion),
  params: {
    detector: 'pose_shoulder_expansion',
    holdMs: 3000,
    minVisibility: 0.5,
    /** 平举：|wristY - shoulderY| 不超过此容差（归一化） */
    shoulderWristYTolerance: 0.1,
    /** 双腕在 X 轴上的间距 |x_LW - x_RW| 须 > 双肩 X 轴间距 |x_LS - x_RS| × 该倍率（与 detection_logic 中「X 坐标距离」一致） */
    wristSpanOverShoulderMinRatio: 1.8,
  },
}

export const armsCrossChest = {
  id: 'arms_cross_chest',
  name: '抱臂松肩',
  description: '双臂交叉环胸，释放肩后侧紧张。',
  detection_logic:
    '使用 Pose。左腕接近右肩、右腕接近左肩，且关键点可见度达标，持续保持约 2.5 秒判定完成。',
  model: 'pose',
  defaultSets: 3,
  qiPerSet: 9,
  caloriesPerSet: 4,
  bodyPart: '肩颈',
  benefits: '缓解肩背僵硬，改善胸背张力失衡。',
  instructionSummary: '双臂交叉抱胸约 2.5 秒',
  instruction: '双臂轻抱胸前，掌可搭肩。保持肩颈放松，不含胸塌腰，维持约 2.5 秒。',
  essentials:
    '交叉时不过度低头，保持脊柱中立。肩部放松、呼吸平稳，动作应柔和。',
  physicalBenefits:
    '有助于肩后侧肌群放松与肩胛稳定，改善久坐后肩背紧绷感。',
  tcmConnection:
    '抱臂敛势，侧重肩井、臑俞等肩背经线舒缓，寓意散滞调络。',
  acupoints: resolveAcupoints(movementAcupointIds.arms_cross_chest),
  params: {
    detector: 'pose_arms_cross_chest',
    holdMs: 2500,
    minVisibility: 0.5,
    maxWristToOppShoulderDistance: 0.16,
  },
}

export const handsBehindHead = {
  id: 'hands_behind_head',
  name: '枕后开胸',
  description: '双手扶后脑，舒展胸廓并放松颈肩。',
  detection_logic:
    '使用 Pose。双腕靠近双耳并位于眼部上方，关键点可见度达标，持续约 2.5 秒判定完成。',
  model: 'pose',
  defaultSets: 3,
  qiPerSet: 9,
  caloriesPerSet: 4,
  bodyPart: '肩颈',
  benefits: '提升胸廓打开感，缓解前侧紧张与颈肩压迫。',
  instructionSummary: '双手扶后脑约 2.5 秒',
  instruction: '双手轻扶后脑，肘向两侧自然打开，避免耸肩，保持约 2.5 秒。',
  essentials:
    '手部轻托即可，不压颈。肘部不必过度后拉，保持呼吸顺畅与胸廓自然展开。',
  physicalBenefits:
    '可改善含胸前倾姿势，降低颈肩前侧负荷，提升上背参与。',
  tcmConnection:
    '围绕风池、大椎等后颈区域，取其疏散颈项郁滞、通达阳气。',
  acupoints: resolveAcupoints(movementAcupointIds.hands_behind_head),
  params: {
    detector: 'pose_hands_behind_head',
    holdMs: 2500,
    minVisibility: 0.5,
    maxWristToEarDistance: 0.12,
    minWristAboveEyeY: 0.02,
  },
}

export const neckTurnLeft = {
  id: 'neck_turn_left',
  name: '颈转左顾',
  description: '头颈向左缓转，疏解项侧紧张。',
  detection_logic:
    '使用 Pose。鼻尖相对双肩中点向左偏移超过阈值，并稳定保持约 2 秒判定完成。',
  model: 'pose',
  defaultSets: 3,
  qiPerSet: 8,
  caloriesPerSet: 3,
  bodyPart: '肩颈',
  benefits: '改善颈部旋转灵活性，缓解单侧僵硬。',
  instructionSummary: '颈部左转定住约 2 秒',
  instruction: '头部缓慢转向左侧，肩部保持平稳不跟转。保持约 2 秒后回正。',
  essentials:
    '动作幅度以舒适为主，避免猛转。肩膀下沉，呼吸自然，目光随头转动。',
  physicalBenefits:
    '有助于提升颈椎旋转活动度，减轻长期单向用眼导致的颈项不适。',
  tcmConnection:
    '取颈侧循行之意，常与风池、颈夹脊等区域相关，偏重疏通少阳与太阳经路。',
  acupoints: resolveAcupoints(movementAcupointIds.neck_turn_left),
  params: {
    detector: 'pose_neck_turn',
    direction: 'left',
    holdMs: 2000,
    minVisibility: 0.5,
    noseShiftOverShoulderRatio: 0.32,
  },
}

export const neckTurnRight = {
  id: 'neck_turn_right',
  name: '颈转右顾',
  description: '头颈向右缓转，疏解项侧紧张。',
  detection_logic:
    '使用 Pose。鼻尖相对双肩中点向右偏移超过阈值，并稳定保持约 2 秒判定完成。',
  model: 'pose',
  defaultSets: 3,
  qiPerSet: 8,
  caloriesPerSet: 3,
  bodyPart: '肩颈',
  benefits: '改善颈部旋转灵活性，平衡左右活动能力。',
  instructionSummary: '颈部右转定住约 2 秒',
  instruction: '头部缓慢转向右侧，保持肩部稳定不耸起。停留约 2 秒后回正。',
  essentials:
    '动作放慢，避免借躯干带动。保持肩颈放松，呼吸连续。',
  physicalBenefits:
    '可改善右侧颈项紧绷与旋转受限，降低久坐后颈部僵硬感。',
  tcmConnection:
    '同样围绕风池、颈夹脊等后颈区域，助于宣通颈项经络、舒展气血。',
  acupoints: resolveAcupoints(movementAcupointIds.neck_turn_right),
  params: {
    detector: 'pose_neck_turn',
    direction: 'right',
    holdMs: 2000,
    minVisibility: 0.5,
    noseShiftOverShoulderRatio: 0.32,
  },
}

export const movementRuleList = [
  eyeRest,
  leftWink,
  rightWink,
  eyeFocusOpen,
  eyeSoftClose,

  handStretch,
  leftHandRaise,
  rightHandRaise,
  prayerChest,
  handsOnHips,

  shoulderExpansion,
  armsCrossChest,
  handsBehindHead,
  neckTurnLeft,
  neckTurnRight,
]

export const movementRuleById = {
  ...Object.fromEntries(movementRuleList.map((rule) => [rule.id, rule])),
}
