export const PUBLISH_LANGS = ['zh', 'en', 'ja', 'es', 'ar']

export function requireAllLanguages(value) {
  if (value === undefined || value === null) return true
  if (typeof value === 'boolean') return value
  if (value === 'on' || value === 'true' || value === '1' || value === 1) return true
  if (value === 'off' || value === 'false' || value === '0' || value === 0 || value === '') return false
  return true
}

export function allLanguagesOption(value, fallback) {
  if (value === undefined || value === null) return requireAllLanguages(fallback)
  return requireAllLanguages(value)
}

function rowState(row) {
  if (!row) return { state: 'missing' }
  const title = typeof row.title === 'string' ? row.title.trim() : ''
  const body = typeof row.body === 'string' ? row.body.trim() : ''
  const error = typeof row.error === 'string' ? row.error.trim() : ''
  if (!title || !body) return { state: 'missing' }
  if (error) return { state: 'error', error }
  if (row.engine === 'fallback' || row.ready !== true) return { state: 'not-ready' }
  return { state: 'ready' }
}

export function publishBlockers(rows) {
  const list = Array.isArray(rows) ? rows : []
  const blockers = []
  for (const lang of PUBLISH_LANGS) {
    const row = list.find((item) => item && item.lang === lang)
    const state = rowState(row)
    if (state.state === 'ready') continue
    blockers.push({ lang, state: state.state, ...(state.error ? { error: state.error } : {}) })
  }
  return blockers
}

export function publishRefusal(blockers) {
  const list = (blockers || [])
    .map((item) => `${item.lang} (${item.state}${item.error ? `: ${item.error}` : ''})`)
    .join(', ')
  return {
    zh: `拒绝发布。五种语言都必须就绪。缺失或未就绪：${list}。`,
    en: `Publish refused. All 5 languages must be ready. Missing or not ready: ${list}.`,
  }
}

export function refusalText(blockers) {
  const message = publishRefusal(blockers)
  return `${message.zh} ${message.en}`
}
