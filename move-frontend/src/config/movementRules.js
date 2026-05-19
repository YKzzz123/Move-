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
 * @property {'face'|'pose'|'hand_face'|'hand'|'pose_hand'|'pose_phased'} model - 主检测管线
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
  eye_rub_cuanzhu: ['cuanzhu_left', 'cuanzhu_right', 'yintang'],
  eye_press_jingming: ['jingming_left', 'jingming_right', 'yintang'],
  eye_rub_sibai: ['sibai_left', 'sibai_right', 'yintang'],
  eye_rub_taiyang: ['taiyang_left', 'taiyang_right', 'cuanzhu_left', 'cuanzhu_right'],

  hand_stretch: ['laogong_left', 'laogong_right', 'hegu_left', 'hegu_right'],
  arms_goalpost_hold: ['jianjing_left', 'jianjing_right', 'laogong_left', 'laogong_right'],
  palm_open_close: ['laogong_left', 'laogong_right', 'hegu_left', 'hegu_right'],
  wrist_rotation_goalpost: ['neiguan_left', 'neiguan_right', 'laogong_left', 'laogong_right'],
  wrist_stretch_forearm: ['hegu_left', 'hegu_right', 'laogong_left', 'laogong_right'],
  hegu_bump: ['hegu_left', 'hegu_right'],
  fingers_spread_hold: ['laogong_left', 'laogong_right'],
  fist_wrap_hold: ['laogong_left', 'laogong_right', 'hegu_left', 'hegu_right'],
  palm_heel_pat: ['laogong_left', 'laogong_right'],
  chest_open_close_front: ['shanzhong', 'laogong_left', 'laogong_right'],
  fingertips_press_hold: ['laogong_left', 'laogong_right'],
  palms_rub_warm: ['laogong_left', 'laogong_right', 'hegu_left', 'hegu_right'],

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
  name: '用力开合双眼',
  description: '用力紧闭再用力睁大，交替训练眼轮匝肌与开睑，与闭目静养不同。',
  detection_logic:
    '使用 Face Landmarks 眼睑开合度。阶段一：双眼闭合超过阈值的时长累计至约 5s；阶段二：双眼睁开且睑裂明显加大的时长累计至约 3s。两阶段交替完成计为一组。',
  model: 'face',
  defaultSets: 5,
  qiPerSet: 10,
  caloriesPerSet: 5,
  bodyPart: '眼部',
  benefits: '主动收缩与拉伸眼周肌肉，促进泪膜涂布与调节肌肉活力。',
  instructionSummary: '用力闭眼约 5s → 用力睁大约 3s，共 5 组',
  instruction:
    '每一节拍都要「用力」：闭眼时收紧眶周，像在对抗阻力；睁眼时有意张大、抬眉辅助，使睑裂开到接近你舒适范围内的最大，再保持。勿屏息，肩颈仍放松。',
  essentials:
    '用力不等于皱眉挤纹或瞪眼干涩，在酸胀可耐受范围内尽最大开合即可。若眼压不适或术后请遵医嘱跳过。',
  physicalBenefits:
    '可作为主动眼保健，与按揉类动作的被动放松互补，改善久视后的眼肌迟钝感。',
  tcmConnection:
    '取「外练筋肉、内养神气」之意，与熨目（纯闭）动静相配。',
  acupoints: resolveAcupoints(movementAcupointIds.eye_rest),
  params: {
    detector: 'face_eye_open_close_cycle',
    closeHoldMs: 5000,
    openHoldMs: 3000,
    closedEyelidSeparationMax: 0.01,
    openEyelidSeparationMin: 0.022,
  },
}

export const eyeRubCuanzhu = {
  id: 'eye_rub_cuanzhu',
  name: '按揉攒竹',
  description: '参照眼保健操第一节：双手拇指或靠近眉弓处支撑，轻按攒竹一线。',
  detection_logic:
    '使用 MediaPipe Hand Landmarker + Face Landmarker。由面部网格点确定攒竹等参考邻域；食指/拇指尖落入邻域后，在时间窗内累计轨迹长度达标且重心散布不过大，判定为轻揉（非静止按住或大幅度移臂）。',
  model: 'hand_face',
  defaultSets: 4,
  qiPerSet: 9,
  caloriesPerSet: 4,
  bodyPart: '眼部',
  benefits: '放松眉弓与额肌紧张，以指尖揉动替代仅靠手腕摆姿势，更贴近眼保健操与穴位刺激。',
  instructionSummary: '攒竹区持续轻揉约 8s（组间停 1s）×4 组',
  instruction:
    '双手拇指或食指腹轻抵左右眉弓内侧（攒竹），在原地做小圆周或来回轻揉，幅度小、力度轻；保持手指与脸部都在画面内。',
  essentials:
    '力度轻柔，以酸胀可耐受为度，勿压眼球。肘可微屈以便指尖稳定落在目标区。',
  physicalBenefits:
    '有助于缓解抬眉、皱眉带来的额颞部疲劳，与闭目养神（本库另项）形成一动一静的搭配。',
  tcmConnection:
    '攒竹属足太阳膀胱经，常与前额目系、太阳等穴同治头目气血郁滞。',
  acupoints: resolveAcupoints(movementAcupointIds.eye_rub_cuanzhu),
  params: {
    detector: 'hand_face_rub_cuanzhu',
    holdMs: 8000,
    restAfterSetMs: 1000,
    zoneRadius: 0.1,
    rubWindowMs: 560,
    minRubPath: 0.019,
    maxRubSpread: 0.075,
    minRubSamples: 6,
    rubTrailMaxPoints: 48,
    holdGapGraceMs: 750,
    rubTrailGapClearMs: 600,
  },
}

export const eyePressJingming = {
  id: 'eye_press_jingming',
  name: '按压睛明',
  description: '参照眼保健操：双掌靠近鼻根两侧，模拟睛明穴按压。',
  detection_logic:
    'Hand + Face：鼻尖—内眦—鼻根参考区；双指轻按鼻根旁后做小范围揉动，满足邻域内轨迹与散布阈值。',
  model: 'hand_face',
  defaultSets: 4,
  qiPerSet: 9,
  caloriesPerSet: 4,
  bodyPart: '眼部',
  benefits: '引导鼻根—目内眦区域放松，按揉与按压更符合实作而非静态举手。',
  instructionSummary: '睛明区持续轻揉约 8s（组间停 1s）×4 组',
  instruction:
    '双手在鼻梁两侧、靠近内眼角凹陷处（睛明附近），指腹轻按并做小圈揉动，勿用力顶压软骨。',
  essentials:
    '勿用力顶压鼻梁软骨；若戴眼镜可先摘下。保持呼吸顺畅，头不后仰。',
  physicalBenefits:
    '有利于缓解内侧眶周酸胀，适合长时间盯屏后配合闭目动作使用。',
  tcmConnection:
    '睛明为手足太阳、阳明、阴阳跷脉交会，按揉与按压在传统眼操中常为核心节次。',
  acupoints: resolveAcupoints(movementAcupointIds.eye_press_jingming),
  params: {
    detector: 'hand_face_press_jingming',
    holdMs: 8000,
    restAfterSetMs: 1000,
    zoneRadius: 0.095,
    rubWindowMs: 560,
    minRubPath: 0.017,
    maxRubSpread: 0.068,
    minRubSamples: 6,
    rubTrailMaxPoints: 48,
    holdGapGraceMs: 750,
    rubTrailGapClearMs: 600,
  },
}

export const eyeRubSibai = {
  id: 'eye_rub_sibai',
  name: '按揉四白',
  description: '参照眼保健操：双手下移，指腹对准眶下、四白一带。',
  detection_logic:
    'Hand + Face：以下睑参考点为眶下邻域；食指/拇指在眶下做轻揉，轨迹与散布阈与攒竹、太阳等区分。',
  model: 'hand_face',
  defaultSets: 4,
  qiPerSet: 9,
  caloriesPerSet: 4,
  bodyPart: '眼部',
  benefits: '活动眶下面部区域，与眉弓、太阳穴姿势形成上下错位，避免动作同质化。',
  instructionSummary: '四白区持续轻揉约 8s（组间停 1s）×4 组',
  instruction:
    '将双手移至颧骨上方、眼眶下缘（四白一带），指腹轻贴做小圈或往返轻揉，双肩放松。',
  essentials:
    '力量轻柔，圆圈式按压比死按更符合眼操；面部正对镜头便于识别指尖。',
  physicalBenefits:
    '有助于减轻眶下面部僵硬感，改善久坐后面部上半与屏幕「定视」的疲劳。',
  tcmConnection:
    '四白属足阳明胃经，传统用于目赤痒痛、面肌拘急等，与眶下面部取穴相应。',
  acupoints: resolveAcupoints(movementAcupointIds.eye_rub_sibai),
  params: {
    detector: 'hand_face_rub_sibai',
    holdMs: 8000,
    restAfterSetMs: 1000,
    zoneRadius: 0.098,
    rubWindowMs: 560,
    minRubPath: 0.019,
    maxRubSpread: 0.075,
    minRubSamples: 6,
    rubTrailMaxPoints: 48,
    holdGapGraceMs: 750,
    rubTrailGapClearMs: 600,
  },
}

export const eyeRubTaiyang = {
  id: 'eye_rub_taiyang',
  name: '按揉太阳',
  description: '参照眼保健操：双手打开扶于头两侧太阳穴处。',
  detection_logic:
    'Hand + Face：以外眼角参考点向颞侧偏移定义太阳邻域；指尖揉动满足轻揉统计条件。',
  model: 'hand_face',
  defaultSets: 4,
  qiPerSet: 9,
  caloriesPerSet: 4,
  bodyPart: '眼部',
  benefits: '侧向舒缓颞部，与中线挤压、眶下按压在空间上错位。',
  instructionSummary: '太阳区持续轻揉约 8s（组间停 1s）×4 组',
  instruction:
    '双臂抬起，食指或拇指腹置于双侧太阳穴附近（颧弓后上方），原位小圈轻揉，勿拉扯头皮。',
  essentials:
    '以指腹轻揉为宜，避免掌根猛压；下颌微收，肩不过度耸起。',
  physicalBenefits:
    '利于缓解颞部胀闷与眼眶外上侧紧张，常盯屏幕者可作为短时恢复。',
  tcmConnection:
    '太阳为奇穴，疏风通络、清利头目，与眼保健操「揉太阳穴」节次相应。',
  acupoints: resolveAcupoints(movementAcupointIds.eye_rub_taiyang),
  params: {
    detector: 'hand_face_rub_taiyang',
    holdMs: 8000,
    restAfterSetMs: 1000,
    zoneRadius: 0.118,
    rubWindowMs: 650,
    minRubPath: 0.015,
    maxRubSpread: 0.095,
    minRubSamples: 5,
    rubTrailMaxPoints: 52,
    rubTipIndices: [4, 8, 12],
    holdGapGraceMs: 950,
    rubTrailGapClearMs: 680,
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

export const palmOpenClose = {
  id: 'palm_open_close',
  name: '手掌张握',
  description: '五指用力张开至最大幅度，再全力握紧成拳，交替训练手部肌耐力。',
  detection_logic:
    'Hand：双手均可见。阶段一：四指指端距手腕的平均归一化距离大于张手阈；阶段二：小于握拳阈。交替累计计时。',
  model: 'hand',
  defaultSets: 15,
  qiPerSet: 6,
  caloriesPerSet: 2,
  bodyPart: '手部',
  benefits: '提高前臂与内在肌协调，促进血流回流。',
  instructionSummary: '用力张掌约 5s → 用力握拳约 3s ×15 组',
  instruction:
    '双手举到胸前来让镜头看清：先像开花一样把五指张到最开，再像拧毛巾一样握到最紧，每一拍都用到接近最大范围。',
  essentials:
    '腕保持中立，握拳勿挤压掌横纹过久；有关节肿痛时减量。',
  physicalBenefits:
    '适合键盘手、握鼠过久者的肌耐力与柔韧交替刺激。',
  tcmConnection:
    '取手三阴三阳在掌指交汇处气行开合之义。',
  acupoints: resolveAcupoints(movementAcupointIds.palm_open_close),
  params: {
    detector: 'hand_palm_open_close_cycle',
    openHoldMs: 5000,
    fistHoldMs: 3000,
    spreadOpenMin: 0.175,
    spreadFistMax: 0.128,
  },
}

export const wristRotationGoalpost = {
  id: 'wrist_rotation_goalpost',
  name: '屈肘旋腕',
  description: '前臂侧平举、屈肘握拳，以腕画圈：先顺时针十圈，再逆时针十圈。',
  detection_logic:
    'Pose：双臂大臂近似侧平举、屈肘约 90°（近摄容差）；Hand：双手平面角速度累加，单帧封顶约 60°（约 45°±15°），顺/逆各满 10 周后为一组。',
  model: 'pose_hand',
  defaultSets: 2,
  qiPerSet: 12,
  caloriesPerSet: 4,
  bodyPart: '手部',
  benefits: '改善腕与前臂旋转黏滞，松解旋前方肌。',
  instructionSummary: '顺转 10 圈 + 逆转 10 圈为一组 ×2',
  instruction:
    '侧平举大臂、屈肘约 90°，空拳。腕部画圈：先顺时钟约十周再逆时钟约十周；镜头很近时可略后撤，便于识别肩—肘—腕。',
  essentials:
    '画圈由腕发起，肘与肩相对固定；疼痛即停。',
  physicalBenefits:
    '适合鼠标腕、旋前紧张。',
  tcmConnection:
    '取腕部筋会舒缓，通利手三阳之枢。',
  acupoints: resolveAcupoints(movementAcupointIds.wrist_rotation_goalpost),
  params: {
    detector: 'pose_hand_wrist_circles',
    cwRevolutions: 10,
    ccwRevolutions: 10,
    spinMaxDegPerFrame: 60,
    wristSpinMinVisibility: 0.38,
    spinPoseArmLevelYTol: 0.24,
    spinPoseWristElbowMinSepY: 0.012,
    spinPoseMinElbowDeg: 55,
    spinPoseMaxElbowDeg: 135,
    spinPoseMinWristSpanRatio: 0.18,
    spinPoseMaxMidlineDrift: 0.26,
  },
}

export const wristStretchForearm = {
  id: 'wrist_stretch_forearm',
  name: '手腕拉伸',
  description: '一侧前臂伸直掌心向下，对侧手拉手指背伸，静态牵伸屈腕肌群。',
  detection_logic:
    'Pose 33 点，按肩宽尺度归一：工作臂肘角≥约 140°、腕与肩竖直差取 min(绝对上限, 肩宽×比例+下限)、辅助手到工作腕距离＜肩宽×系数；腕尖不过分低于肩；左/右各满 25s，中断>1s 双侧进度清零；双侧均满触发 1 次完成。',
  model: 'pose_hand',
  defaultSets: 2,
  qiPerSet: 10,
  caloriesPerSet: 3,
  bodyPart: '手部',
  benefits: '减轻屈腕肌群缩短与腕掌酸紧。',
  instructionSummary: '左 25s → 右 25s 为 1 组（可设多组）',
  instruction:
    '一臂前伸、肘伸直，对侧手（腕或食指）靠近工作手腕牵拉。镜头很近时肩宽在画里较小，算法会按肩宽放大「抬高」与「够到」的容差。',
  essentials:
    '肘尽量伸直；拉伸强度以可忍受酸胀为限。',
  physicalBenefits:
    '适合伏案屈腕后的短伸。',
  tcmConnection:
    '疏理手厥阴阳经之拘急。',
  acupoints: resolveAcupoints(movementAcupointIds.wrist_stretch_forearm),
  params: {
    detector: 'pose_hand_wrist_stretch',
    stretchHoldMs: 25000,
    stretchElbowMinDeg: 140,
    stretchShoulderWristYAbsMax: 0.34,
    stretchShoulderWristYScale: 1.25,
    stretchShoulderWristYFloor: 0.16,
    stretchAssistScale: 0.58,
    stretchMaxWristBelowShoulderY: 0.16,
    stretchGapResetMs: 1000,
    minVisibility: 0.4,
  },
}

export const heguBump = {
  id: 'hegu_bump',
  name: '虎口对击',
  description: '手部八段锦式：以双手虎口区（合谷一带）互击作响。',
  detection_logic:
    '双拇指/食指节周期性靠近再分开，在一次时间窗内完成数次对击节奏。',
  model: 'hand',
  defaultSets: 4,
  qiPerSet: 5,
  caloriesPerSet: 2,
  bodyPart: '手部',
  benefits: '宣通手阳明大肠经气，振奋上肢。',
  instructionSummary: '虎口对击完成约 8 次记 1 组 ×4',
  instruction: '双手虎口相对，像鼓掌但只用掌骨—拇指侧互碰，轻快节奏即可。',
  essentials: '勿用僵腕猛砸。',
  physicalBenefits: '改善握后酸胀。',
  tcmConnection: '合谷为大肠经原穴。',
  acupoints: resolveAcupoints(movementAcupointIds.hegu_bump),
  params: {
    detector: 'hand_hegu_bump_reps',
    bumpRepsNeeded: 8,
    closeMax: 0.088,
    farMin: 0.118,
  },
}

export const fingersSpreadHold = {
  id: 'fingers_spread_hold',
  name: '五指撑开',
  description: '手部八段锦：五指用力分开、维持伸展。',
  detection_logic: '双手张手指数均超过张手阈并保持。',
  model: 'hand',
  defaultSets: 4,
  qiPerSet: 5,
  caloriesPerSet: 2,
  bodyPart: '手部',
  benefits: '牵伸指间筋膜，防屈指僵硬。',
  instructionSummary: '十指撑开保持约 4s ×4 组',
  instruction: '各指向外「射」开，第二指节伸直，停留 4 秒。',
  essentials: '勿过度反张关节。',
  physicalBenefits: '适合打字后。',
  tcmConnection: '疏筋展络。',
  acupoints: resolveAcupoints(movementAcupointIds.fingers_spread_hold),
  params: {
    detector: 'hand_five_spread_hold',
    holdMs: 4000,
    spreadOpenMin: 0.178,
  },
}

export const fistWrapHold = {
  id: 'fist_wrap_hold',
  name: '握拳按指',
  description: '手部八段锦：拇指压四指第三关节外裹成实拳，静态加压。',
  detection_logic: '双手握拳度低于握拳阈并保持。',
  model: 'hand',
  defaultSets: 4,
  qiPerSet: 5,
  caloriesPerSet: 2,
  bodyPart: '手部',
  benefits: '强化屈指与蚓状肌协同。',
  instructionSummary: '实拳按压约 4s ×4 组',
  instruction: '拇指在外包压四指，拳心留空，逐渐加力。',
  essentials: '指甲勿陷掌心。',
  physicalBenefits: '改善握力耐力。',
  tcmConnection: '敛气于掌，助阳固表。',
  acupoints: resolveAcupoints(movementAcupointIds.fist_wrap_hold),
  params: {
    detector: 'hand_fist_wrap_hold',
    holdMs: 4000,
    spreadFistMax: 0.12,
  },
}

export const palmHeelPat = {
  id: 'palm_heel_pat',
  name: '掌根互拍',
  description: '手部八段锦：双掌根相对轻快互拍。',
  detection_logic: '双腕近距离互碰后拉开，重复计数。',
  model: 'hand',
  defaultSets: 4,
  qiPerSet: 5,
  caloriesPerSet: 2,
  bodyPart: '手部',
  benefits: '震通劳宫区，活跃掌部血行。',
  instructionSummary: '掌根互拍约 8 次记 1 组 ×4',
  instruction: '掌心朝前或相对，用小臂带动掌根互碰。',
  essentials: '以酸胀温热为度。',
  physicalBenefits: '放松大鱼际。',
  tcmConnection: '劳宫为心包荥穴。',
  acupoints: resolveAcupoints(movementAcupointIds.palm_heel_pat),
  params: {
    detector: 'hand_palm_heel_pat_reps',
    patRepsNeeded: 8,
    closeMax: 0.102,
    farMin: 0.122,
  },
}

export const chestOpenCloseFront = {
  id: 'chest_open_close_front',
  name: '胸前开合',
  description: '手部八段锦：胸前由合十到双掌分开再合拢。',
  detection_logic: 'Pose：胸前任一窄距合十位与宽距分掌位交替各保持。',
  model: 'pose_phased',
  defaultSets: 4,
  qiPerSet: 6,
  caloriesPerSet: 2,
  bodyPart: '手部',
  benefits: '带动胸小肌与前锯肌温和伸缩。',
  instructionSummary: '胸前窄 3s → 宽 3s ×4 组',
  instruction: '先合掌于胸前，再水平分掌比肩略宽，肘沉，反复。',
  essentials: '脊柱不后仰。',
  physicalBenefits: '改善含胸。',
  tcmConnection: '开合膻中气象。',
  acupoints: resolveAcupoints(movementAcupointIds.chest_open_close_front),
  params: {
    detector: 'pose_chest_open_close',
    narrowHoldMs: 3000,
    wideHoldMs: 3000,
    minVisibility: 0.48,
    narrowMaxWristGap: 0.11,
    narrowMidlineXTolerance: 0.12,
    narrowChestYOffsetMin: -0.035,
    narrowChestYOffsetMax: 0.19,
    wideMinWristGap: 0.15,
    wideMaxWristGap: 0.72,
    wideMidlineXTolerance: 0.15,
    wideShoulderMidYDeltaMin: -0.055,
    wideShoulderMidYDeltaMax: 0.24,
  },
}

export const fingertipsPressHold = {
  id: 'fingertips_press_hold',
  name: '指尖对压',
  description: '手部八段锦：十指指腹相对用力对压，如莲花指节相顶。',
  detection_logic: '双手食指指尖距离极近且其余指亦近中线。',
  model: 'hand',
  defaultSets: 4,
  qiPerSet: 5,
  caloriesPerSet: 2,
  bodyPart: '手部',
  benefits: '刺激井穴区域，提神。',
  instructionSummary: '指尖对顶约 3s ×4 组',
  instruction: '腕上举，食尖相对微微发力，可顺带入中指。',
  essentials: '勿戳眼球高度，偏前下方。',
  physicalBenefits: '改善指尖循环。',
  tcmConnection: '阴阳经井穴交通。',
  acupoints: resolveAcupoints(movementAcupointIds.fingertips_press_hold),
  params: {
    detector: 'hand_fingertips_press_hold',
    holdMs: 3000,
    indexTipMaxGap: 0.045,
  },
}

export const palmsRubWarm = {
  id: 'palms_rub_warm',
  name: '搓手温阳',
  description: '手部八段锦：快速搓热双掌。',
  detection_logic: '双掌接近且掌心间质心在短时窗内搓动路径累计。',
  model: 'hand',
  defaultSets: 4,
  qiPerSet: 6,
  caloriesPerSet: 2,
  bodyPart: '手部',
  benefits: '生热行气，安神御寒。',
  instructionSummary: '快速搓掌约 4s ×4 组',
  instruction: '对搓或画圆直至掌心发热。',
  essentials: '肩沉肘松。',
  physicalBenefits: '促手部微循环。',
  tcmConnection: '搓劳宫温通心包。',
  acupoints: resolveAcupoints(movementAcupointIds.palms_rub_warm),
  params: {
    detector: 'hand_palms_rub_warm',
    holdMs: 4000,
    rubWindowMs: 560,
    minRubPath: 0.032,
    maxRubSpread: 0.095,
    minRubSamples: 6,
    maxWristGap: 0.19,
    rubGapClearMs: 550,
  },
}

export const armsGoalpostHold = {
  id: 'arms_goalpost_hold',
  name: '屈肘侧举',
  description: '大臂抬平、屈肘举掌，类似「仙人掌式」，与直臂过头托天区分。',
  detection_logic:
    '使用 Pose。肘与肩高接近，腕高于肘且远离耳侧（与抱头、托天不同），并避免双腕同时明显高于鼻尖。',
  model: 'pose',
  defaultSets: 3,
  qiPerSet: 9,
  caloriesPerSet: 4,
  bodyPart: '手部',
  benefits: '强化肩外展与肘屈协同，图案明显区别于胸前合十与前平托天。',
  instructionSummary: '屈肘侧举约 2.5 秒',
  instruction:
    '侧平举大臂至肩高，屈肘约 90°，小臂向上，双掌朝前如相框。勿贴耳后，亦勿双臂笔直托天，保持约 2.5 秒。',
  essentials:
    '肩胛轻收紧、肋骨不外翻；若肩峰不适可降低大臂高度。',
  physicalBenefits:
    '有助于改善肩外展控制与三角肌耐力，与直线前举、上托形成三类上肢几何。',
  tcmConnection:
    '肩臂外侧为手三阳所过，此式取其「外展举势」以利肩臂经气运行。',
  acupoints: resolveAcupoints(movementAcupointIds.arms_goalpost_hold),
  params: {
    detector: 'pose_arms_goalpost_hold',
    holdMs: 2500,
    minVisibility: 0.46,
    elbowShoulderYTolerance: 0.14,
    wristAboveElbowYMin: 0.028,
    minWristAboveShoulderY: 0.012,
    minWristEarDistance: 0.11,
    maxBothWristAboveNoseY: 0.032,
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
  eyeRubCuanzhu,
  eyePressJingming,
  eyeRubSibai,
  eyeRubTaiyang,

  handStretch,
  armsGoalpostHold,
  palmOpenClose,
  wristRotationGoalpost,
  wristStretchForearm,
  heguBump,
  fingersSpreadHold,
  fistWrapHold,
  palmHeelPat,
  chestOpenCloseFront,
  fingertipsPressHold,
  palmsRubWarm,

  shoulderExpansion,
  armsCrossChest,
  handsBehindHead,
  neckTurnLeft,
  neckTurnRight,
]

export const movementRuleById = {
  ...Object.fromEntries(movementRuleList.map((rule) => [rule.id, rule])),
}
