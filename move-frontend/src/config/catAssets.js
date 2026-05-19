/**
 * 12 星座小猫素材映射（配置中心）
 *
 * 首页三态 PNG：小写英文键或两字中文键（与 utils/zodiac 一致），例如：
 *   - {zodiacKey}_{idle|happy|tired}.png  例：libra_idle.png、sagittarius-idle.png
 *   - {中文}_{idle|tired}.png 例：水瓶_idle.png
 * 注册页「星座小像」：{中文或英文星座名}-h.png
 * 未登录访客：首页用 idle.png；注册/用户中心等 -h 位用 idle-h.png（无则退回 idle.png）。
 * 其余未匹配仍用 placeholder.svg。
 */
import catPlaceholder from '@/assets/cats/placeholder.svg'
import guestIdlePng from '@/assets/cats/idle.png'
import { ZODIAC_ZH_SHORT_TO_EN_KEY } from '@/utils/zodiac'

export { guestIdlePng }

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

/**
 * 后端 `auth/zodiac.py` 返回的英文星座名（首字母大写）→ 资源文件名用小写键
 * 与 utils/zodiac.js 的 `westernZodiacFromIsoDate().en` 一致
 */
export const ZODIAC_EN_TO_KEY = {
  Capricorn: 'capricorn',
  Aquarius: 'aquarius',
  Pisces: 'pisces',
  Aries: 'aries',
  Taurus: 'taurus',
  Gemini: 'gemini',
  Cancer: 'cancer',
  Leo: 'leo',
  Virgo: 'virgo',
  Libra: 'libra',
  Scorpio: 'scorpio',
  Sagittarius: 'sagittarius',
}

/**
 * @param {string} raw userStore.zodiacCatType、注册预览等任意展示文案
 * @returns {keyof typeof ZODIAC_KEY | null}
 */
export function zodiacAssetKeyFromLabel(raw) {
  if (!raw || typeof raw !== 'string') return null
  const t = raw.trim()
  if (!t) return null
  if (ZODIAC_NAME_TO_KEY[t]) return ZODIAC_NAME_TO_KEY[t]
  const withZuo = `${t}座`
  if (ZODIAC_NAME_TO_KEY[withZuo]) return ZODIAC_NAME_TO_KEY[withZuo]
  if (ZODIAC_EN_TO_KEY[t]) return ZODIAC_EN_TO_KEY[t]
  const cap = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
  if (ZODIAC_EN_TO_KEY[cap]) return ZODIAC_EN_TO_KEY[cap]
  return null
}

/** 与 userStore 的 CAT_STATE 区分：专指素材三态 */
export const CAT_ASSET_STATE = {
  idle: 'idle',
  happy: 'happy',
  tired: 'tired',
}

/**
 * 文件命名约定：src/assets/cats/{zodiacKey}_{state}.png
 * 下列字符串路径供文档 / 静态引用提示
 */
const pathFor = (zodiacKey, state) => `@/assets/cats/${zodiacKey}_${state}.png`

const keys = Object.values(ZODIAC_KEY)

const catPngModules = import.meta.glob('../assets/cats/*.png', {
  eager: true,
  import: 'default',
})

/** 注册页：*-h.png，文件名主体可与 utils/zodiac 的两字中文或英文星座名一致 */
const registerHappyPngModules = import.meta.glob('../assets/cats/*-h.png', {
  eager: true,
  import: 'default',
})

/** @returns {Record<string, string>} 主体名（含中文）→ 已解析 URL */
function buildRegisterHappyStemMap() {
  const map = {}
  for (const filePath of Object.keys(registerHappyPngModules)) {
    const file = filePath.split('/').pop() || ''
    const m = file.match(/^(.+)-h\.png$/i)
    if (!m) continue
    const stem = m[1]
    const url = registerHappyPngModules[filePath]
    map[stem] = url
    if (/^[a-zA-Z]+$/.test(stem)) {
      map[stem.toLowerCase()] = url
    }
  }
  return map
}

const registerHappyStemToUrl = buildRegisterHappyStemMap()

/** 未登录时 -h 位：`idle-h.png`（若存在）；否则与首页一致用 idle.png */
const guestIdleHPortraitUrl = registerHappyStemToUrl.idle ?? guestIdlePng

/**
 * 注册页星座小像：`{中文或英文星座名}-h.png`
 * @param {string} zh westernZodiacFromIsoDate().zh（如 射手）
 * @param {string} en 同上 .en（如 Sagittarius）
 * @param {{ guest?: boolean }} [options] `guest:true` 未登录：无星座匹配时用 idle-h / idle
 */
export function resolveRegisterZodiacHappyPortraitUrl(zh, en, { guest = false } = {}) {
  const candidates = []
  const z = typeof zh === 'string' ? zh.trim() : ''
  const e = typeof en === 'string' ? en.trim() : ''
  if (z) {
    candidates.push(z, `${z}座`)
  }
  if (e) {
    candidates.push(e, e.charAt(0).toUpperCase() + e.slice(1).toLowerCase(), e.toLowerCase())
  }
  const assetKey = zodiacAssetKeyFromLabel(e || z || '')
  if (assetKey) {
    candidates.push(assetKey)
    candidates.push(assetKey.charAt(0).toUpperCase() + assetKey.slice(1))
  }
  for (const c of candidates) {
    if (!c) continue
    if (registerHappyStemToUrl[c]) return registerHappyStemToUrl[c]
    if (/[a-zA-Z]/.test(c) && registerHappyStemToUrl[c.toLowerCase()]) {
      return registerHappyStemToUrl[c.toLowerCase()]
    }
  }
  if (guest) return guestIdleHPortraitUrl
  return catPlaceholder
}

/** @returns {Record<string, Record<string, string>>} */
function collectPngUrlsByZodiac() {
  const byZ = {}
  function add(zKey, st, url) {
    if (!keys.includes(zKey)) return
    if (!byZ[zKey]) byZ[zKey] = {}
    byZ[zKey][st] = url
  }
  for (const filePath of Object.keys(catPngModules)) {
    const base = filePath.split('/').pop() || ''
    let m = base.match(/^([a-z]+)_(idle|happy|tired)\.png$/i)
    if (!m) m = base.match(/^([a-z]+)-(idle|happy|tired)\.png$/i)
    if (m) {
      add(m[1].toLowerCase(), m[2].toLowerCase(), catPngModules[filePath])
      continue
    }
    m = base.match(/^(.+?)_(idle|happy|tired)\.png$/i)
    if (!m) m = base.match(/^(.+?)-(idle|happy|tired)\.png$/i)
    if (!m) continue
    const stem = m[1]
    const st = m[2].toLowerCase()
    const zKey = ZODIAC_ZH_SHORT_TO_EN_KEY[stem]
    if (zKey) add(zKey, st, catPngModules[filePath])
  }
  return byZ
}

const pngByZodiac = collectPngUrlsByZodiac()

function buildZodiacMap() {
  const out = {}
  for (const k of keys) {
    const pngs = pngByZodiac[k] || {}
    out[k] = {
      [CAT_ASSET_STATE.idle]: pngs.idle ?? guestIdlePng,
      [CAT_ASSET_STATE.happy]: pngs.happy ?? guestIdlePng,
      [CAT_ASSET_STATE.tired]: pngs.tired ?? guestIdlePng,
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
  if (!row) return mode === 'pathHint' ? pathFor('aries', CAT_ASSET_STATE.idle) : guestIdlePng
  if (mode === 'pathHint') return row._paths[state] || pathFor(zodiacKey, state)
  return row[state] ?? guestIdlePng
}

/**
 * 微运动结束后：至少完成一组用 idle 态；否则 tired。缺素材时由 getCatAsset → idle.png。
 * @param {string} zodiacLabel
 * @param {boolean} completedAnyMovement
 */
export function resolveWorkoutOutcomePortraitUrl(zodiacLabel, completedAnyMovement) {
  const key = zodiacAssetKeyFromLabel(zodiacLabel ?? '')
  if (!key) return guestIdlePng
  const st = completedAnyMovement ? CAT_ASSET_STATE.idle : CAT_ASSET_STATE.tired
  return getCatAsset(key, st)
}

/**
 * 首页等场景：按用户星座字段 + 小猫状态解析最终图片 URL。
 * 支持后端返回的英文（如 Libra）、中文全称（天秤座）、或两字 +「座」。
 * 未识别或空字符串时用占位图；`guest:true` 未登录时用 idle.png。
 *
 * @param {string} zodiacLabel userStore.zodiacCatType 等
 * @param {string} catState userStore.currentCatState（idle | happy | tired）
 * @param {{ guest?: boolean }} [options]
 */
export function resolveCatPortraitUrl(zodiacLabel, catState, { guest = false } = {}) {
  if (guest) return guestIdlePng
  const key = zodiacAssetKeyFromLabel(zodiacLabel ?? '')
  if (!key) return catPlaceholder
  const ok = catState === 'idle' || catState === 'happy' || catState === 'tired'
  const st = ok ? catState : CAT_ASSET_STATE.idle
  return getCatAsset(key, st)
}
