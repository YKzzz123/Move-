/** Western zodiac from ISO date string (YYYY-MM-DD), aligned with backend `auth/zodiac.py`. */

const ZH = {
  Capricorn: '摩羯',
  Aquarius: '水瓶',
  Pisces: '双鱼',
  Aries: '白羊',
  Taurus: '金牛',
  Gemini: '双子',
  Cancer: '巨蟹',
  Leo: '狮子',
  Virgo: '处女',
  Libra: '天秤',
  Scorpio: '天蝎',
  Sagittarius: '射手',
}

/** 两字中文（`水瓶_idle.png` 等文件名）→ 英文资源键 */
export const ZODIAC_ZH_SHORT_TO_EN_KEY = Object.fromEntries(
  Object.entries(ZH).map(([en, zhShort]) => [zhShort, en.toLowerCase()]),
)

/**
 * 与注册页「星座小像」相同的入参：从 userStore.zodiacCatType 拆出 zh / en。
 * @param {string} raw 后端多为英文（如 Capricorn），或中文「天秤座」等
 * @returns {{ zhStem: string, en: string }} zhStem 为两字（天秤），en 为首字母大写英文
 */
export function zodiacPortraitFieldsFromStoredType(raw) {
  const t = typeof raw === 'string' ? raw.trim() : ''
  if (!t) return { zhStem: '', en: '' }
  if (/[\u4e00-\u9fff]/.test(t)) {
    return { zhStem: t.replace(/座$/, ''), en: '' }
  }
  const cap = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
  const zhStem = ZH[cap] || ''
  return { zhStem, en: cap }
}

function signEnFromParts(month, day) {
  const dayIndex = month * 100 + day
  if (dayIndex >= 1222 || dayIndex <= 119) return 'Capricorn'
  if (dayIndex <= 218) return 'Aquarius'
  if (dayIndex <= 320) return 'Pisces'
  if (dayIndex <= 419) return 'Aries'
  if (dayIndex <= 520) return 'Taurus'
  if (dayIndex <= 620) return 'Gemini'
  if (dayIndex <= 722) return 'Cancer'
  if (dayIndex <= 822) return 'Leo'
  if (dayIndex <= 922) return 'Virgo'
  if (dayIndex <= 1022) return 'Libra'
  if (dayIndex <= 1121) return 'Scorpio'
  if (dayIndex <= 1221) return 'Sagittarius'
  return 'Capricorn'
}

/**
 * @param {string} isoDate - "YYYY-MM-DD"
 * @returns {{ en: string, zh: string } | null}
 */
export function westernZodiacFromIsoDate(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return null
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const month = Number(m[2])
  const day = Number(m[3])
  if (!month || !day) return null
  const en = signEnFromParts(month, day)
  return { en, zh: ZH[en] || en }
}
