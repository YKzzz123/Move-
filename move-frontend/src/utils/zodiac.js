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
