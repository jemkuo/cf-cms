import { getAdminPost, setTranslateNote, writeTranslation } from './db'
import { LANG_META } from './i18n'
import type { Env, Faq, Lang, SaveTranslation } from './types'
import { LANGS } from './types'
import { clip, parseFaq } from './text'

const NAMES: Record<Lang, string> = {
  zh: 'Simplified Chinese',
  en: 'English',
  ja: 'Japanese',
  es: 'Spanish',
  ar: 'Arabic',
}

const MT_CODES: Record<Lang, string> = {
  zh: 'zh',
  en: 'en',
  ja: 'ja',
  es: 'es',
  ar: 'ar',
}

export type Draft = {
  title: string
  description: string
  summary: string
  body: string
  shareText: string
  faq: Faq[]
  tags: { slug: string; name: string }[]
  engine: 'workers-ai' | 'fallback'
  note: string
  unavailable?: boolean
}

function aiUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /not logged|authentication|unauthorized|binding is not available/i.test(message)
}

type Source = {
  sourceLang: Lang
  targetLang: Lang
  title: string
  description: string
  summary: string
  body: string
  faq: Faq[]
  tags: { slug: string; name: string }[]
}

function fallback(source: Source, note: string): Draft {
  return {
    title: source.title,
    description: source.description,
    summary: source.summary || source.description,
    body: source.body,
    shareText: clip(source.title, 180),
    faq: source.faq,
    tags: source.tags,
    engine: 'fallback',
    note,
  }
}

function parseModelJson(text: string): Record<string, unknown> | null {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '')
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const value: unknown = JSON.parse(stripped.slice(start, end + 1))
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
  } catch {
    return null
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asFaq(value: unknown): Faq[] {
  if (!Array.isArray(value)) return []
  return parseFaq(JSON.stringify(value))
}

function asTags(value: unknown, known: { slug: string }[]): { slug: string; name: string }[] {
  const allowed = new Set(known.map((tag) => tag.slug))
  if (!Array.isArray(value)) return []
  const tags: { slug: string; name: string }[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const slug = 'slug' in item && typeof item.slug === 'string' ? item.slug.trim() : ''
    const name = 'name' in item && typeof item.name === 'string' ? item.name.trim() : ''
    if (!slug || !name || !allowed.has(slug)) continue
    tags.push({ slug, name: clip(name, 40) })
  }
  return tags
}

async function runModel(env: Env, model: string, input: Record<string, unknown>): Promise<unknown> {
  if (!env.AI) throw new Error('Workers AI binding is not available')
  const run = env.AI.run.bind(env.AI) as (name: string, body: Record<string, unknown>) => Promise<unknown>
  return run(model, input)
}

async function llamaTranslate(env: Env, source: Source): Promise<Draft | null> {
  const model = env.AI_MODEL || '@cf/meta/llama-3.2-3b-instruct'
  const target = NAMES[source.targetLang]
  const system = [
    'You translate technical blog posts and return JSON only.',
    `Source language: ${NAMES[source.sourceLang]}. Target language: ${target}.`,
    'Keys: title, description, summary, body, share_text, faq, tags.',
    'faq is an array of up to 3 objects with q and a.',
    'tags is an array of {slug, name}. Keep every slug unchanged and translate only name.',
    'body is Markdown. Keep code fences, URLs, image markdown, and {{x:...}} shortcodes exactly.',
    'Do not translate code. Do not add commentary.',
    'summary is one or two sentences. share_text is under 180 characters and fits a post on X.',
    source.targetLang === 'ar' ? 'Write Arabic in Arabic script.' : '',
    source.targetLang === 'ja' ? 'Write Japanese in Japanese.' : '',
    source.targetLang === 'es' ? 'Write Spanish in Spanish.' : '',
  ]
    .filter(Boolean)
    .join('\n')
  const user = JSON.stringify({
    title: source.title,
    description: source.description,
    summary: source.summary,
    tags: source.tags,
    faq: source.faq,
    body: source.body,
  })
  const result = (await runModel(env, model, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: 4096,
    temperature: 0.2,
  })) as { response?: string }
  const parsed = parseModelJson(result.response || '')
  if (!parsed) return null
  const title = asString(parsed.title)
  const body = asString(parsed.body)
  if (!title || !body) return null
  if (source.body.length > 400 && body.length < source.body.length * 0.35) return null
  return {
    title: clip(title, 180),
    description: clip(asString(parsed.description) || title, 280),
    summary: clip(asString(parsed.summary) || asString(parsed.description) || title, 400),
    body,
    shareText: clip(asString(parsed.share_text) || title, 220),
    faq: asFaq(parsed.faq).slice(0, 3),
    tags: asTags(parsed.tags, source.tags),
    engine: 'workers-ai',
    note: '',
  }
}

async function mt(env: Env, text: string, source: Lang, target: Lang): Promise<string> {
  const model = env.AI_MT_MODEL || '@cf/meta/m2m100-1.2b'
  const trimmed = text.trim()
  if (!trimmed) return text
  const result = (await runModel(env, model, {
    text: trimmed,
    source_lang: MT_CODES[source],
    target_lang: MT_CODES[target],
  })) as { translated_text?: string }
  return (result.translated_text || '').trim() || text
}

function protect(text: string): { text: string; tokens: string[] } {
  const tokens: string[] = []
  const protectedText = text.replace(/\{\{x:[^}]+\}\}|`[^`\n]+`|https?:\/\/[^\s)]+/g, (match) => {
    const id = tokens.push(match) - 1
    return `XTK${id}X`
  })
  return { text: protectedText, tokens }
}

function restore(text: string, tokens: string[]): string {
  let out = text
  tokens.forEach((token, index) => {
    out = out.replaceAll(`XTK${index}X`, token)
  })
  return out
}

async function translateProse(env: Env, text: string, source: Lang, target: Lang): Promise<string> {
  if (!text.trim()) return text
  const chunks: string[] = []
  let rest = text
  while (rest.length > 700) {
    let cut = rest.lastIndexOf('\n', 700)
    if (cut < 200) cut = rest.lastIndexOf(' ', 700)
    if (cut < 200) cut = 700
    chunks.push(rest.slice(0, cut))
    rest = rest.slice(cut)
    if (chunks.length >= 8) break
  }
  chunks.push(rest)
  const out: string[] = []
  for (const chunk of chunks) {
    if (!chunk.trim()) {
      out.push(chunk)
      continue
    }
    out.push(await mt(env, chunk, source, target))
  }
  return out.join('')
}

async function m2mMarkdown(env: Env, source: Source): Promise<Draft> {
  const pieces = source.body.split(/(```[\s\S]*?```)/g)
  const bodyParts: string[] = []
  for (const piece of pieces) {
    if (piece.startsWith('```')) {
      bodyParts.push(piece)
      continue
    }
    const protectedPiece = protect(piece)
    const paragraphs = protectedPiece.text.split(/\n{2,}/)
    const translated: string[] = []
    for (const paragraph of paragraphs) {
      translated.push(restore(await translateProse(env, paragraph, source.sourceLang, source.targetLang), protectedPiece.tokens))
    }
    bodyParts.push(translated.join('\n\n'))
  }
  const title = clip(await mt(env, source.title, source.sourceLang, source.targetLang), 180)
  const description = source.description
    ? clip(await mt(env, source.description, source.sourceLang, source.targetLang), 280)
    : title
  const summary = source.summary
    ? clip(await mt(env, source.summary, source.sourceLang, source.targetLang), 400)
    : description
  const faq: Faq[] = []
  for (const item of source.faq.slice(0, 3)) {
    faq.push({
      q: clip(await mt(env, item.q, source.sourceLang, source.targetLang), 180),
      a: clip(await mt(env, item.a, source.sourceLang, source.targetLang), 400),
    })
  }
  const tags: { slug: string; name: string }[] = []
  for (const tag of source.tags.slice(0, 8)) {
    const name = tag.name === tag.slug ? tag.slug : await mt(env, tag.name, source.sourceLang, source.targetLang)
    tags.push({ slug: tag.slug, name: clip(name, 40) })
  }
  return {
    title,
    description,
    summary,
    body: bodyParts.join(''),
    shareText: clip(title, 180),
    faq,
    tags,
    engine: 'workers-ai',
    note: 'm2m100',
  }
}

export async function translateDraft(env: Env, source: Source): Promise<Draft> {
  if (source.sourceLang === source.targetLang) {
    return { ...fallback(source, ''), engine: 'workers-ai', note: '' }
  }
  if (!env.AI) {
    return { ...fallback(source, 'Workers AI binding is unavailable in this environment'), unavailable: true }
  }
  try {
    const drafted = await llamaTranslate(env, source)
    if (drafted) return drafted
  } catch (error) {
    console.error('llama translation failed', source.targetLang, error)
    if (aiUnavailable(error)) {
      return { ...fallback(source, 'Workers AI is not available in this environment'), unavailable: true }
    }
  }
  try {
    return await m2mMarkdown(env, source)
  } catch (error) {
    console.error('m2m100 translation failed', source.targetLang, error)
    const message = error instanceof Error ? error.message : 'translation failed'
    return { ...fallback(source, message), unavailable: aiUnavailable(error) }
  }
}

function toSave(lang: Lang, draft: Draft): SaveTranslation {
  return {
    lang,
    title: draft.title,
    description: draft.description,
    summary: draft.summary,
    body: draft.body,
    faq: draft.faq,
    shareText: draft.shareText,
    engine: draft.engine,
    ready: draft.engine === 'workers-ai',
    locked: false,
  }
}

export async function fillTranslations(env: Env, postId: string, mode: 'missing' | 'unlocked'): Promise<string> {
  const post = await getAdminPost(env.DB, postId)
  if (!post) return 'missing'
  const source = post.translations.find((item) => item.lang === post.sourceLang)
  if (!source || !source.body.trim() || !source.title.trim()) return 'source-empty'
  const tags = post.tags.map((tag) => ({
    slug: tag.slug,
    name: tag.names[post.sourceLang] || tag.slug,
  }))
  const notes: string[] = []
  let blocked = ''
  for (const lang of LANGS) {
    if (lang === post.sourceLang) continue
    const existing = post.translations.find((item) => item.lang === lang)
    if (existing?.locked) {
      notes.push(`${lang}: locked`)
      continue
    }
    const hasBody = Boolean(existing?.body.trim())
    if (mode === 'missing' && hasBody && existing?.engine !== 'fallback') {
      notes.push(`${lang}: kept`)
      continue
    }
    const draft = blocked
      ? { ...fallback({
          sourceLang: post.sourceLang,
          targetLang: lang,
          title: source.title,
          description: source.description,
          summary: source.summary,
          body: source.body,
          faq: source.faq,
          tags,
        }, blocked), unavailable: true }
      : await translateDraft(env, {
      sourceLang: post.sourceLang,
      targetLang: lang,
      title: source.title,
      description: source.description,
      summary: source.summary,
      body: source.body,
      faq: source.faq,
      tags,
    })
    if (draft.unavailable && draft.note) blocked = draft.note
    if (existing?.locked) continue
    await writeTranslation(env.DB, post.id, toSave(lang, draft), draft.tags)
    const label = LANG_META[lang].label
    notes.push(`${label}: ${draft.engine}${draft.note ? ` (${draft.note})` : ''}`)
  }
  const note = notes.join(' · ')
  await setTranslateNote(env.DB, post.id, note)
  return note
}
