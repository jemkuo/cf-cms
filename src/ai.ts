import type { Env, Faq, Lang } from './types'
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

export type TranslatedFields = {
  title: string
  description: string
  summary: string
  shareText: string
  faq: Faq[]
}

function aiUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /not logged|authentication|unauthorized|binding is not available/i.test(message)
}

export function translationUnavailable(error: unknown): boolean {
  return aiUnavailable(error)
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

async function runModel(env: Env, model: string, input: Record<string, unknown>): Promise<unknown> {
  if (!env.AI) throw new Error('Workers AI binding is not available')
  const run = env.AI.run.bind(env.AI) as (name: string, body: Record<string, unknown>) => Promise<unknown>
  return run(model, input)
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
  const out = (result.translated_text || '').trim()
  if (!out) throw new Error('Workers AI returned an empty translation')
  if (out === trimmed && [...trimmed].length > 24) throw new Error('Workers AI returned the source text')
  return out
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
  }
  chunks.push(rest)
  const out: string[] = []
  for (const chunk of chunks) {
    if (!chunk.trim()) {
      out.push(chunk)
      continue
    }
    const protectedChunk = protect(chunk)
    const translated = await mt(env, protectedChunk.text, source, target)
    out.push(restore(translated, protectedChunk.tokens))
  }
  return out.join('')
}

async function llamaFields(
  env: Env,
  source: { sourceLang: Lang; targetLang: Lang; title: string; description: string; summary: string; faq: Faq[] },
): Promise<TranslatedFields | null> {
  const model = env.AI_MODEL || '@cf/meta/llama-3.2-3b-instruct'
  const system = [
    'You translate blog fields and return JSON only.',
    `Source language: ${NAMES[source.sourceLang]}. Target language: ${NAMES[source.targetLang]}.`,
    'Keys: title, description, summary, share_text, faq.',
    'faq is an array of up to 3 objects with q and a.',
    'Do not add commentary. Do not copy the source language into the values.',
    source.targetLang === 'ar' ? 'Write Arabic in Arabic script.' : '',
    source.targetLang === 'ja' ? 'Write Japanese in Japanese.' : '',
    source.targetLang === 'es' ? 'Write Spanish in Spanish.' : '',
  ]
    .filter(Boolean)
    .join('\n')
  const result = (await runModel(env, model, {
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: JSON.stringify({
          title: source.title,
          description: source.description,
          summary: source.summary,
          faq: source.faq,
        }),
      },
    ],
    max_tokens: 1200,
    temperature: 0.2,
  })) as { response?: string }
  const parsed = parseModelJson(result.response || '')
  if (!parsed) return null
  const title = asString(parsed.title)
  if (!title) return null
  if (title === source.title.trim() && [...title].length > 24) return null
  const description = clip(asString(parsed.description) || title, 280)
  return {
    title: clip(title, 180),
    description,
    summary: clip(asString(parsed.summary) || description, 400),
    shareText: clip(asString(parsed.share_text) || title, 220),
    faq: asFaq(parsed.faq).slice(0, 3),
  }
}

export async function translateFields(
  env: Env,
  source: { sourceLang: Lang; targetLang: Lang; title: string; description: string; summary: string; faq: Faq[] },
): Promise<TranslatedFields> {
  if (!env.AI) throw new Error('Workers AI binding is not available')
  try {
    const drafted = await llamaFields(env, source)
    if (drafted) return drafted
  } catch (error) {
    if (aiUnavailable(error)) throw error
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
  return { title, description, summary, shareText: clip(title, 180), faq }
}

export async function translateChunkText(env: Env, text: string, source: Lang, target: Lang): Promise<string> {
  if (!env.AI) throw new Error('Workers AI binding is not available')
  let last = 'translation failed'
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const translated = await translateProse(env, text, source, target)
      if (!translated.trim()) throw new Error('Workers AI returned an empty translation')
      return translated
    } catch (error) {
      last = error instanceof Error ? error.message : 'translation failed'
      if (aiUnavailable(error)) throw error
    }
  }
  throw new Error(last)
}
