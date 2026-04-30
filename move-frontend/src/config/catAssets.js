/**
 * 12 星座小猫素材映射（配置中心）
 * 正式素材到齐后，将同路径 PNG 放入 src/assets/cats/ 并替换 import 或路径字符串即可。
 */
import catPlaceholder from '@/assets/cats/placeholder.svg'

/** 星座英文键 —— 与资源文件名 aries_*.png 等一致 */
export const ZODIAC_KEY = {
  aries: 'aries',
  taurus: 'taurus',
  gemini: 'gemini',
  cancer: 'cancer',
  leo: 'leo',
  virgo: 'virgo',
  libra: 'libra',
  scorpio: 'scorpio',
  sagittarius: 'sagittarius',
  capricorn: 'capricorn',
  aquarius: 'aquarius',
  pisces: 'pisces',
}

/** 中文名 → 英文键，便于用文案或后端字段反查 */
export const ZODIAC_NAME_TO_KEY = {
  白羊座: 'aries',
  金牛座: 'taurus',
  双子座: 'gemini',
  巨蟹座: 'cancer',
  狮子座: 'leo',
  处女座: 'virgo',
  天秤座: 'libra',
  天蝎座: 'scorpio',
  射手座: 'sagittarius',
  摩羯座: 'capricorn',
  水瓶座: 'aquarius',
  双鱼座: 'pisces',
}

/** 与 userStore 的 CAT_STATE 区分：专指素材三态 */
export const CAT_ASSET_STATE = {
  idle: 'idle',
  happy: 'happy',
  tired: 'tired',
}

/**
 * 文件命名约定：src/assets/cats/{zodiacKey}_{state}.png
 * 未就绪前统一用占位；下列字符串路径供静态引用或 <img> 预填
 */
const pathFor = (zodiacKey, state) => `@/assets/cats/${zodiacKey}_${state}.png`

const keys = Object.values(ZODIAC_KEY)

function buildZodiacMap() {
  const out = {}
  for (const k of keys) {
    out[k] = {
      /** 现用同一张 SVG 占位，替换为独立 PNG 时改此三处为各自 import 或 pathFor */
      [CAT_ASSET_STATE.idle]: catPlaceholder,
      [CAT_ASSET_STATE.happy]: catPlaceholder,
      [CAT_ASSET_STATE.tired]: catPlaceholder,
      /** 预留给模板 / 元数据 */
      _paths: {
        [CAT_ASSET_STATE.idle]: pathFor(k, CAT_ASSET_STATE.idle),
        [CAT_ASSET_STATE.happy]: pathFor(k, CAT_ASSET_STATE.happy),
        [CAT_ASSET_STATE.tired]: pathFor(k, CAT_ASSET_STATE.tired),
      },
    }
  }
  return out
}

export const catAssets = buildZodiacMap()

/**
 * @param {keyof ZODIAC_KEY} zodiacKey
 * @param {keyof typeof CAT_ASSET_STATE} state
 * @param {'resolved' | 'pathHint'} [mode] resolved: 可绑 img:src 的已解析；pathHint: 仅文档占位字符串
 */
export function getCatAsset(zodiacKey, state, mode = 'resolved') {
  const row = catAssets[zodiacKey]
  if (!row) return mode === 'pathHint' ? pathFor('aries', CAT_ASSET_STATE.idle) : catPlaceholder
  if (mode === 'pathHint') return row._paths[state] || pathFor(zodiacKey, state)
  return row[state] ?? catPlaceholder
}
