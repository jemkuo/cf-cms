// Per-language public site copy: homepage headline and eyebrow, the description line,
// the footer line, and the About page. Stored in settings under `site_copy`.
// Every field is optional. An empty or missing field falls back to the built-in copy in src/i18n.ts.

export const SITE_COPY_LANGS = ['zh', 'en', 'ja', 'es', 'ar']
export const SITE_COPY_TEXT_FIELDS = ['tagline', 'kicker', 'description', 'footer', 'aboutTitle']
export const SITE_COPY_FIELDS = [...SITE_COPY_TEXT_FIELDS, 'aboutBody']
export const SITE_COPY_LIMITS = {
  tagline: 160,
  kicker: 80,
  description: 400,
  footer: 200,
  aboutTitle: 120,
  aboutParagraph: 2000,
  aboutParagraphs: 12,
}

export function emptySiteCopy() {
  return {}
}

function oneLine(value) {
  return String(value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
}

// Paragraphs: an array of strings, or one string split on blank lines.
export function splitParagraphs(value) {
  if (Array.isArray(value)) return value.map((item) => (typeof item === 'string' ? item : '')).map((item) => item.replace(/\r\n?/g, '\n').trim()).filter(Boolean)
  if (typeof value !== 'string') return []
  return value
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((item) => item.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
}

function parseLang(lang, input) {
  if (input === undefined || input === null) return { ok: true, value: {} }
  if (typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: `site_copy.${lang} must be an object` }
  const out = {}
  for (const key of Object.keys(input)) {
    if (!SITE_COPY_FIELDS.includes(key)) return { ok: false, error: `Unknown site_copy field: ${lang}.${key}. Use ${SITE_COPY_FIELDS.join(', ')}` }
  }
  for (const field of SITE_COPY_TEXT_FIELDS) {
    const raw = input[field]
    if (raw === undefined || raw === null) continue
    if (typeof raw !== 'string') return { ok: false, error: `site_copy.${lang}.${field} must be a string` }
    const text = oneLine(raw)
    if (text.length > SITE_COPY_LIMITS[field]) {
      return { ok: false, error: `site_copy.${lang}.${field} is longer than ${SITE_COPY_LIMITS[field]} characters` }
    }
    if (text) out[field] = text
  }
  if (input.aboutBody !== undefined && input.aboutBody !== null) {
    if (typeof input.aboutBody !== 'string' && !Array.isArray(input.aboutBody)) {
      return { ok: false, error: `site_copy.${lang}.aboutBody must be a string or an array of strings` }
    }
    const paragraphs = splitParagraphs(input.aboutBody)
    if (paragraphs.length > SITE_COPY_LIMITS.aboutParagraphs) {
      return { ok: false, error: `site_copy.${lang}.aboutBody has more than ${SITE_COPY_LIMITS.aboutParagraphs} paragraphs` }
    }
    if (paragraphs.some((item) => item.length > SITE_COPY_LIMITS.aboutParagraph)) {
      return { ok: false, error: `site_copy.${lang}.aboutBody has a paragraph longer than ${SITE_COPY_LIMITS.aboutParagraph} characters` }
    }
    if (paragraphs.length) out.aboutBody = paragraphs
  }
  return { ok: true, value: out }
}

// Strict parse for writes. Unknown languages or fields are errors. Empty fields are dropped.
export function parseSiteCopy(input) {
  if (input === undefined || input === null) return { ok: true, value: {} }
  if (typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'site_copy must be an object keyed by language' }
  const value = {}
  for (const lang of Object.keys(input)) {
    if (!SITE_COPY_LANGS.includes(lang)) return { ok: false, error: `Unknown site_copy language: ${lang}. Use ${SITE_COPY_LANGS.join(', ')}` }
    const parsed = parseLang(lang, input[lang])
    if (!parsed.ok) return parsed
    if (Object.keys(parsed.value).length) value[lang] = parsed.value
  }
  return { ok: true, value }
}

// Lenient read of a stored row. Anything invalid means "no overrides".
export function readSiteCopy(input) {
  const parsed = parseSiteCopy(input)
  return parsed.ok ? parsed.value : {}
}

// Field-level patch. A field set to "" or null clears it, so it falls back to the default.
// Fields that are not mentioned stay as they are. replace=true starts from an empty map.
export function mergeSiteCopy(current, patch, replace = false) {
  if (patch === undefined || patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ok: false, error: 'copy must be an object keyed by language' }
  }
  const base = replace ? {} : readSiteCopy(current)
  const next = {}
  for (const lang of SITE_COPY_LANGS) if (base[lang]) next[lang] = { ...base[lang] }
  for (const lang of Object.keys(patch)) {
    if (!SITE_COPY_LANGS.includes(lang)) return { ok: false, error: `Unknown site_copy language: ${lang}. Use ${SITE_COPY_LANGS.join(', ')}` }
    const fields = patch[lang]
    if (fields === null) {
      delete next[lang]
      continue
    }
    if (typeof fields !== 'object' || Array.isArray(fields)) return { ok: false, error: `copy.${lang} must be an object` }
    const merged = { ...(next[lang] || {}) }
    for (const key of Object.keys(fields)) {
      if (!SITE_COPY_FIELDS.includes(key)) return { ok: false, error: `Unknown site_copy field: ${lang}.${key}. Use ${SITE_COPY_FIELDS.join(', ')}` }
      const value = fields[key]
      if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) delete merged[key]
      else merged[key] = value
    }
    next[lang] = merged
  }
  return parseSiteCopy(next)
}

// Effective copy for one language. defaults is the built-in COPY[lang]; siteDescription is meta.description.
export function resolveSiteCopy(defaults, siteCopy, lang, siteDescription = '') {
  const own = readSiteCopy(siteCopy)[lang] || {}
  return {
    tagline: own.tagline || defaults.tagline,
    kicker: own.kicker || defaults.kicker,
    description: own.description || siteDescription || defaults.description,
    footer: own.footer || defaults.footer,
    aboutTitle: own.aboutTitle || defaults.aboutTitle,
    aboutBody: own.aboutBody && own.aboutBody.length ? own.aboutBody : defaults.aboutBody,
  }
}
