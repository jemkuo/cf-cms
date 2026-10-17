export const HEAD_PRESETS = [
  { key: 'google-site-verification', kind: 'name', attr: 'content', label: 'Google' },
  { key: 'msvalidate.01', kind: 'name', attr: 'content', label: 'Bing' },
  { key: 'baidu-site-verification', kind: 'name', attr: 'content', label: 'Baidu' },
  { key: 'yandex-verification', kind: 'name', attr: 'content', label: 'Yandex' },
  { key: 'p:domain_verify', kind: 'name', attr: 'content', label: 'Pinterest' },
  { key: 'facebook-domain-verification', kind: 'name', attr: 'content', label: 'Facebook' },
  { key: 'impact-site-verification', kind: 'name', attr: 'value', label: 'Impact' },
]

const RESERVED = new Set(['charset', 'viewport', 'description', 'robots', 'canonical'])
const META_ATTRS = new Set(['name', 'property', 'content', 'value'])
const LINK_ATTRS = new Set(['rel', 'href', 'hreflang', 'type', 'title', 'sizes', 'as'])

export function emptyHeadMeta() {
  return { entries: [], raw: '' }
}

export function isReservedMetaKey(key) {
  const name = String(key ?? '').trim().toLowerCase()
  if (!name) return true
  if (RESERVED.has(name)) return true
  if (name.startsWith('og:')) return true
  return false
}

function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function decodeAttr(value) {
  return String(value ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function keyOk(key) {
  return /^[A-Za-z0-9_.:-]{1,80}$/.test(key)
}

function parseEntry(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return { ok: false, error: 'Each head entry must be an object' }
  const kind = item.kind === 'property' ? 'property' : 'name'
  const key = String(item.key ?? item.name ?? '').trim()
  if (!keyOk(key)) return { ok: false, error: `Invalid meta name: ${key || '(empty)'}` }
  if (isReservedMetaKey(key)) return { ok: false, error: `Reserved head tag: ${key}` }
  let attr = item.attr === 'value' ? 'value' : 'content'
  if (key === 'impact-site-verification') attr = 'value'
  const value = String(item.value ?? item.content ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 500)
  if (!value) return { ok: true, skip: true }
  return { ok: true, value: { kind, key, attr, value } }
}

function parseAttrs(source) {
  const attrs = {}
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
  let match = re.exec(source)
  while (match) {
    const key = match[1].toLowerCase()
    if (key !== '/' && !key.startsWith('/')) attrs[key] = decodeAttr(match[2] ?? match[3] ?? match[4] ?? '')
    match = re.exec(source)
  }
  return attrs
}

function hrefOk(value) {
  if (!value) return false
  if (value.startsWith('/') && !value.startsWith('//')) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function renderTag(name, attrs) {
  const allowed = name === 'meta' ? META_ATTRS : LINK_ATTRS
  const parts = []
  for (const [key, value] of Object.entries(attrs)) {
    if (!allowed.has(key) || value === '') continue
    parts.push(`${key}="${escapeAttr(value)}"`)
  }
  if (!parts.length) return ''
  return `<${name} ${parts.join(' ')}>`
}

export function sanitizeHeadSnippet(input) {
  let text = String(input ?? '').trim()
  if (!text) return { ok: true, html: '' }
  text = text.replace(/<!--[\s\S]*?-->/g, '')
  text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<script\b[^>]*\/?>/gi, '')
  if (/<script/i.test(text)) return { ok: false, error: 'Scripts are not allowed in the head snippet' }
  text = text.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  if (/\son[a-z]+\s*=/i.test(text)) return { ok: false, error: 'Event handlers are not allowed in the head snippet' }
  if (/javascript\s*:/i.test(text)) return { ok: false, error: 'javascript: URLs are not allowed in the head snippet' }
  const tags = []
  const re = /<\s*([a-zA-Z][\w:-]*)\b([^>]*)>/g
  let last = 0
  let match = re.exec(text)
  while (match) {
    if (text.slice(last, match.index).trim()) return { ok: false, error: 'Only meta and link tags are allowed in the head snippet' }
    const name = match[1].toLowerCase()
    if (name !== 'meta' && name !== 'link') return { ok: false, error: 'Only meta and link tags are allowed in the head snippet' }
    const attrs = parseAttrs(match[2])
    if (name === 'meta') {
      const named = attrs.name || attrs.property || ''
      if (isReservedMetaKey(named) || attrs.charset !== undefined || attrs['http-equiv']) {
        return { ok: false, error: `Reserved head tag: ${named || 'charset'}` }
      }
    }
    if (name === 'link') {
      const rel = String(attrs.rel || '').toLowerCase().split(/\s+/)
      if (rel.includes('canonical')) return { ok: false, error: 'Reserved head tag: canonical' }
      if (!hrefOk(attrs.href || '')) return { ok: false, error: 'Link tags need an http(s) or site href' }
    }
    const rendered = renderTag(name, attrs)
    if (rendered) tags.push(rendered)
    last = match.index + match[0].length
    match = re.exec(text)
  }
  if (text.slice(last).trim()) return { ok: false, error: 'Only meta and link tags are allowed in the head snippet' }
  return { ok: true, html: tags.join('\n') }
}

export function parseHeadMeta(input) {
  if (input === undefined || input === null || input === '') return { ok: true, value: emptyHeadMeta() }
  if (typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'head_meta must be an object' }
  const entries = []
  const list = Array.isArray(input.entries) ? input.entries : []
  for (const item of list) {
    const parsed = parseEntry(item)
    if (!parsed.ok) return parsed
    if (parsed.skip) continue
    if (entries.some((entry) => entry.kind === parsed.value.kind && entry.key === parsed.value.key)) continue
    entries.push(parsed.value)
  }
  const raw = sanitizeHeadSnippet(input.raw || '')
  if (!raw.ok) return raw
  return { ok: true, value: { entries, raw: raw.html } }
}

export function renderHeadMeta(meta) {
  const entries = meta && Array.isArray(meta.entries) ? meta.entries : []
  const lines = []
  const seen = new Set()
  for (const entry of entries) {
    if (!entry || isReservedMetaKey(entry.key) || !keyOk(String(entry.key || ''))) continue
    const kind = entry.kind === 'property' ? 'property' : 'name'
    const attr = entry.key === 'impact-site-verification' || entry.attr === 'value' ? 'value' : 'content'
    const token = `${kind}:${String(entry.key).toLowerCase()}`
    if (seen.has(token)) continue
    seen.add(token)
    lines.push(`<meta ${kind}="${escapeAttr(entry.key)}" ${attr}="${escapeAttr(entry.value)}">`)
  }
  if (meta && meta.raw) lines.push(meta.raw)
  return lines.join('\n')
}
