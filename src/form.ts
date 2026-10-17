import { cleanPath, parsePostMeta } from './config'
import type { Faq, Lang, PostMeta } from './types'
import { LANGS } from './types'
import { clip, isLang, isStatus, normalizeCover, parseTagInput, slugOk } from './text'

export const FAQ_SLOTS = 3

export type FieldBag = Record<string, string>

export type FormError = 'slug' | 'source' | 'cover' | 'author' | 'body'

export type ParsedPost = {
  slug: string
  status: 'draft' | 'published'
  category: string
  meta: PostMeta
  coverKey: string | null
  authorName: string
  authorX: string
  sourceLang: Lang
  autoTranslate: boolean
  tags: { slug: string; name?: string }[]
  translations: Record<
    Lang,
    {
      title: string
      description: string
      summary: string
      body: string
      shareText: string
      keywords: string
      ogImage: string
      ready: boolean
      locked: boolean
      faq: Faq[]
    }
  >
}

export function bagFromBody(body: Record<string, unknown>): FieldBag {
  const bag: FieldBag = {}
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') bag[key] = value
  }
  return bag
}

export function parsePostForm(body: Record<string, unknown>): { ok: true; value: ParsedPost } | { ok: false; error: FormError } {
  const bag = bagFromBody(body)
  const slug = bag.slug?.trim().toLowerCase() ?? ''
  if (!slugOk(slug)) return { ok: false, error: 'slug' }
  const sourceLang = isLang(bag.source_lang || '') ? (bag.source_lang as Lang) : 'zh'
  const translations = {} as ParsedPost['translations']
  for (const lang of LANGS) {
    const title = clip(bag[`title_${lang}`] || '', 180)
    const description = clip(bag[`description_${lang}`] || '', 280)
    const summary = clip(bag[`summary_${lang}`] || '', 400)
    const shareText = clip(bag[`share_${lang}`] || '', 220)
    const keywords = clip(bag[`keywords_${lang}`] || '', 180)
    const ogRaw = (bag[`og_${lang}`] || '').trim()
    const text = bag[`body_${lang}`] || ''
    if ([...text].length > 80000) return { ok: false, error: 'body' }
    const faq: Faq[] = []
    for (let i = 0; i < FAQ_SLOTS; i += 1) {
      const q = clip(bag[`faq_${lang}_${i}_q`] || '', 180)
      const a = clip(bag[`faq_${lang}_${i}_a`] || '', 400)
      if (q && a) faq.push({ q, a })
    }
    translations[lang] = {
      title,
      description,
      summary,
      body: text.replace(/\r\n/g, '\n'),
      shareText,
      keywords,
      ogImage: ogRaw,
      ready: bag[`ready_${lang}`] === 'on',
      locked: bag[`locked_${lang}`] === 'on',
      faq,
    }
  }
  const source = translations[sourceLang]
  if (!source.title || !source.body.trim()) return { ok: false, error: 'source' }
  const authorName = clip(bag.author_name || '', 80)
  if (!authorName) return { ok: false, error: 'author' }
  const cover = normalizeCover(bag.cover_key || '')
  if (cover === false) return { ok: false, error: 'cover' }
  for (const lang of LANGS) {
    const og = translations[lang].ogImage.trim()
    if (og && !cleanPath(og)) return { ok: false, error: 'cover' }
    translations[lang].ogImage = cleanPath(og)
  }
  const rawCategory = (bag.category || '').trim().toLowerCase()
  const category = slugOk(rawCategory) ? rawCategory : 'notes'
  const meta = parsePostMeta({
    noindex: bag.meta_noindex === 'on',
    canonical: bag.meta_canonical || '',
    keywords: bag.meta_keywords || '',
    ogImage: bag.meta_og || '',
  })
  let status = isStatus(bag.status || '') ? bag.status : 'draft'
  if (bag.action === 'publish') status = 'published'
  if (bag.action === 'unpublish') status = 'draft'
  return {
    ok: true,
    value: {
      slug,
      status: status === 'published' ? 'published' : 'draft',
      category,
      meta,
      coverKey: cover,
      authorName,
      authorX: (bag.author_x || '').replace(/^@/, '').trim(),
      sourceLang,
      autoTranslate: bag.auto_translate === 'on',
      tags: parseTagInput(bag.tags || ''),
      translations,
    },
  }
}
