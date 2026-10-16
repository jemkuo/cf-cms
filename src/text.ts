import type { Category, Faq, Lang, PostStatus } from './types'
import { CATEGORIES, LANGS } from './types'

export function isLang(value: string): value is Lang {
  return (LANGS as readonly string[]).includes(value)
}

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value)
}

export function isStatus(value: string): value is PostStatus {
  return value === 'draft' || value === 'published'
}

export function clip(value: string, max: number): string {
  return [...value.trim()].slice(0, max).join('')
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function slugOk(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80
}

export function parseFaq(raw: string | null | undefined): Faq[] {
  if (!raw) return []
  try {
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    const faqs: Faq[] = []
    for (const item of data) {
      if (!item || typeof item !== 'object') continue
      const q = 'q' in item && typeof item.q === 'string' ? item.q.trim() : ''
      const a = 'a' in item && typeof item.a === 'string' ? item.a.trim() : ''
      if (!q || !a) continue
      faqs.push({ q, a })
      if (faqs.length === 6) break
    }
    return faqs
  } catch {
    return []
  }
}

export function faqJson(faq: Faq[]): string {
  return JSON.stringify(faq)
}

export function parseTagInput(raw: string): { slug: string; name?: string }[] {
  const seen = new Set<string>()
  const tags: { slug: string; name?: string }[] = []
  for (const part of raw.split(',')) {
    const [slugRaw, ...rest] = part.split('|')
    const slug = slugRaw.trim().toLowerCase()
    if (!slugOk(slug) || seen.has(slug)) continue
    seen.add(slug)
    const name = rest.join('|').trim()
    tags.push(name ? { slug, name: clip(name, 40) } : { slug })
    if (tags.length === 8) break
  }
  return tags
}

export function formatTagInput(
  tags: { slug: string; names: Partial<Record<Lang, string>> }[],
  lang: Lang,
): string {
  return tags
    .map((tag) => {
      const name = tag.names[lang]
      return name && name !== tag.slug ? `${tag.slug}|${name}` : tag.slug
    })
    .join(', ')
}

export function normalizeCover(raw: string): string | null | false {
  const value = raw.trim()
  if (!value) return null
  if (value.startsWith('/covers/') && !value.includes('..')) return value
  if (value.startsWith('/media/images/') && !value.includes('..')) {
    return value.slice('/media/'.length)
  }
  if (value.startsWith('images/') && !value.includes('..')) return value
  return false
}

export function coverPublicPath(key: string | null): string | null {
  if (!key) return null
  if (key.startsWith('/')) return key
  return `/media/${key}`
}

export function socialImage(origin: string, key: string | null): string {
  const path = coverPublicPath(key)
  if (!path || path.endsWith('.svg')) return `${origin}/og.png`
  return new URL(path, origin).href
}

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function cdata(value: string): string {
  return `<![CDATA[${value.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`
}

export function readingMinutes(markdown: string, lang: Lang): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~]/g, ' ')
  if (lang === 'zh' || lang === 'ja') {
    const chars = text.replace(/\s/g, '').length
    return Math.max(1, Math.round(chars / 450))
  }
  const words = text.split(/\s+/).filter(Boolean).length
  const perMinute = lang === 'ar' ? 180 : 220
  return Math.max(1, Math.round(words / perMinute))
}

export function minutesFromLength(length: number, lang: Lang): number {
  if (lang === 'zh' || lang === 'ja') return Math.max(1, Math.round(length / 450))
  const perMinute = lang === 'ar' ? 900 : 1100
  return Math.max(1, Math.round(length / perMinute))
}

export function sortLangs(langs: Iterable<string>): Lang[] {
  const set = new Set(langs)
  return LANGS.filter((lang) => set.has(lang))
}

export function safeNext(raw: string | undefined, env?: { ADMIN_SAFEPATH?: string }): string {
  if (!raw || raw.startsWith('//') || raw.includes('\\') || raw.includes('://')) return '/admin'
  const queryAt = raw.indexOf('?')
  const path = queryAt === -1 ? raw : raw.slice(0, queryAt)
  const query = queryAt === -1 ? '' : raw.slice(queryAt)
  if (path === '/admin' || path.startsWith('/admin/')) return path + query
  const secret = (env?.ADMIN_SAFEPATH || '').trim()
  const prefix = secret ? `/${secret}/admin` : ''
  if (prefix && (path === prefix || path.startsWith(`${prefix}/`))) {
    return `/admin${path.slice(prefix.length)}${query}`
  }
  return '/admin'
}

export function negotiate(header: string | undefined): Lang {
  if (!header) return 'zh'
  const parts = header
    .split(',')
    .map((piece) => {
      const [tag, ...params] = piece.trim().split(';')
      const qParam = params.find((item) => item.trim().startsWith('q='))
      const q = qParam ? Number(qParam.split('=')[1]) : 1
      return { tag: tag.toLowerCase(), q: Number.isFinite(q) ? q : 0 }
    })
    .sort((a, b) => b.q - a.q)
  for (const part of parts) {
    const base = part.tag.split('-')[0]
    if (base === 'zh') return 'zh'
    if (base === 'en' || base === 'ja' || base === 'es' || base === 'ar') return base
  }
  return 'zh'
}
