/** 近 N 天已做过时权重（与需求一致：1） */
export const WEIGHT_RECENT_DONE = 1
/** 未做或超窗时权重（3） */
export const WEIGHT_FRESH = 3
/** 降权时间窗（天） */
export const DEFAULT_RECENT_DAYS = 2

/**
 * 根据「近期是否做过」取权重
 * @param {string} movementId
 * @param {Set<string>} recentIds
 */
export function weightForMovement(movementId, recentIds) {
  return recentIds.has(movementId) ? WEIGHT_RECENT_DONE : WEIGHT_FRESH
}

/**
 * 随机 1~3 的抽取个数
 * @param {number} [max=3]
 */
export function pickRandomRunCount(max = 3) {
  return 1 + Math.floor(Math.random() * max)
}

/**
 * 不放回加权随机抽样：同权可退化为均匀分布。
 * @param {string[]} pool - 候选 id
 * @param {Set<string>} recentIds
 * @param {number} count
 * @returns {string[]}
 */
export function weightedSampleWithoutReplacement(pool, recentIds, count) {
  const remaining = [...pool]
  const k = Math.min(count, remaining.length)
  const out = []
  for (let n = 0; n < k; n++) {
    const weights = remaining.map((id) => weightForMovement(id, recentIds))
    const total = weights.reduce((a, b) => a + b, 0)
    let r = Math.random() * (total > 0 ? total : 1)
    let idx = 0
    for (; idx < remaining.length; idx++) {
      r -= weights[idx]
      if (r <= 0) break
    }
    if (idx >= remaining.length) idx = remaining.length - 1
    out.push(remaining.splice(idx, 1)[0])
  }
  return out
}

/**
 * 对配置表执行加权随机，返回 1~3 个动作 id
 * @param {{ id: string }[]} allRules
 * @param {Set<string>} recentIds
 */
export function pickWeightedRandomMovementIds(allRules, recentIds) {
  const pool = allRules.map((r) => r.id)
  if (pool.length === 0) return []
  const runCount = pickRandomRunCount(Math.min(3, pool.length))
  return weightedSampleWithoutReplacement(pool, recentIds, runCount)
}
