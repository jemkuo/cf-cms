import { translateChunkText, translateFields, translationUnavailable } from './ai'
import { splitMarkdown } from './chunks.mjs'
import {
  failOpenTranslationJobs,
  getAdminPost,
  listOpenTranslationJobs,
  listTranslationJobs,
  markTranslationError,
  nextTranslationJob,
  replaceTranslationJobs,
  saveTranslationJob,
  writeTranslation,
} from './db'
import type { Env, Faq, Lang, SaveTranslation } from './types'
import { LANGS } from './types'
import { isLang } from './text'

type PartialState = {
  fieldsReady?: boolean
  title?: string
  description?: string
  summary?: string
  shareText?: string
  faq?: Faq[]
  parts?: string[]
  done?: boolean[]
}

function readPartial(raw: string): PartialState {
  if (!raw) return {}
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as PartialState
  } catch {
    return {}
  }
}

function sameShape(partial: PartialState, count: number): boolean {
  return Array.isArray(partial.parts) && partial.parts.length === count && Array.isArray(partial.done) && partial.done.length === count
}

export async function enqueueTranslations(
  env: Env,
  postId: string,
  requested: Lang[] | undefined,
  mode: 'missing' | 'unlocked',
): Promise<{ queued: Lang[]; skipped: { lang: Lang; reason: string }[] }> {
  const post = await getAdminPost(env.DB, postId)
  if (!post) return { queued: [], skipped: [] }
  const source = post.translations.find((item) => item.lang === post.sourceLang)
  if (!source?.title.trim() || !source.body.trim()) return { queued: [], skipped: [] }
  const wanted = (requested && requested.length ? requested : LANGS).filter((lang) => lang !== post.sourceLang)
  const skipped: { lang: Lang; reason: string }[] = []
  const queued: Lang[] = []
  for (const lang of wanted) {
    if (!isLang(lang) || lang === post.sourceLang) continue
    const existing = post.translations.find((item) => item.lang === lang)
    if (existing?.locked) {
      skipped.push({ lang, reason: 'locked' })
      continue
    }
    const hasBody = Boolean(existing?.body.trim()) && existing?.engine !== 'fallback'
    if (mode === 'missing' && hasBody) {
      skipped.push({ lang, reason: 'kept' })
      continue
    }
    queued.push(lang)
  }
  if (queued.length) await replaceTranslationJobs(env.DB, post.id, queued)
  return { queued, skipped }
}

async function failLanguage(env: Env, postId: string, lang: Lang, message: string): Promise<void> {
  const post = await getAdminPost(env.DB, postId)
  const existing = post?.translations.find((item) => item.lang === lang)
  const keepBody = Boolean(existing && existing.engine !== 'fallback' && existing.body.trim())
  if (keepBody) return
  await markTranslationError(env.DB, postId, lang, message, false)
}

export async function processTranslationJobs(env: Env, options?: { maxAiCalls?: number }): Promise<void> {
  const max = options?.maxAiCalls ?? 3
  let calls = 0
  while (calls < max) {
    let job: Awaited<ReturnType<typeof nextTranslationJob>>
    try {
      job = await nextTranslationJob(env.DB)
    } catch {
      return
    }
    if (!job || !isLang(job.lang)) return
    const used = await stepJob(env, job)
    calls += Math.max(1, used)
    if (used < 0) return
  }
}

async function stepJob(
  env: Env,
  job: NonNullable<Awaited<ReturnType<typeof nextTranslationJob>>>,
): Promise<number> {
  const lang = job.lang as Lang
  const post = await getAdminPost(env.DB, job.post_id)
  if (!post) {
    await saveTranslationJob(env.DB, job.id, { status: 'error', error: 'Post not found', attempts: job.attempts })
    return 0
  }
  const source = post.translations.find((item) => item.lang === post.sourceLang)
  if (!source?.title.trim() || !source.body.trim()) {
    await saveTranslationJob(env.DB, job.id, { status: 'error', error: 'Source text is empty', attempts: job.attempts })
    return 0
  }
  const existing = post.translations.find((item) => item.lang === lang)
  if (existing?.locked) {
    await saveTranslationJob(env.DB, job.id, { status: 'done', error: '', cursor: job.cursor, partial: job.partial, attempts: job.attempts })
    return 0
  }
  const chunks = splitMarkdown(source.body)
  let partial = readPartial(job.partial)
  if (!sameShape(partial, chunks.length)) {
    partial = {
      fieldsReady: false,
      parts: chunks.map((chunk) => (chunk.kind === 'keep' ? chunk.text : '')),
      done: chunks.map((chunk) => chunk.kind === 'keep' || !chunk.text.trim()),
    }
  }
  if (!partial.fieldsReady) {
    try {
      const fields = await translateFields(env, {
        sourceLang: post.sourceLang,
        targetLang: lang,
        title: source.title,
        description: source.description,
        summary: source.summary,
        faq: source.faq,
      })
      partial.fieldsReady = true
      partial.title = fields.title
      partial.description = fields.description
      partial.summary = fields.summary
      partial.shareText = fields.shareText
      partial.faq = fields.faq
      await saveTranslationJob(env.DB, job.id, {
        status: 'running',
        error: '',
        cursor: (partial.done || []).filter(Boolean).length,
        partial: JSON.stringify(partial),
        attempts: 0,
      })
      return 1
    } catch (error) {
      return failStep(env, job, lang, error)
    }
  }
  const index = (partial.done || []).findIndex((done) => !done)
  if (index < 0) {
    await commitJob(env, post.id, lang, partial, existing)
    await saveTranslationJob(env.DB, job.id, {
      status: 'done',
      error: '',
      cursor: chunks.length,
      partial: JSON.stringify(partial),
      attempts: job.attempts,
    })
    return 0
  }
  try {
    const translated = await translateChunkText(env, chunks[index].text, post.sourceLang, lang)
    partial.parts = partial.parts || []
    partial.done = partial.done || []
    partial.parts[index] = translated
    partial.done[index] = true
    const finished = partial.done.every(Boolean)
    if (finished) await commitJob(env, post.id, lang, partial, existing)
    await saveTranslationJob(env.DB, job.id, {
      status: finished ? 'done' : 'running',
      error: '',
      cursor: partial.done.filter(Boolean).length,
      partial: JSON.stringify(partial),
      attempts: 0,
    })
    return 1
  } catch (error) {
    return failStep(env, job, lang, error, partial)
  }
}

async function failStep(
  env: Env,
  job: NonNullable<Awaited<ReturnType<typeof nextTranslationJob>>>,
  lang: Lang,
  error: unknown,
  partial?: PartialState,
): Promise<number> {
  const message = error instanceof Error ? error.message : 'translation failed'
  if (translationUnavailable(error)) {
    const open = await listOpenTranslationJobs(env.DB)
    for (const item of open) {
      if (!isLang(item.lang)) continue
      await failLanguage(env, item.postId, item.lang, message)
    }
    await failOpenTranslationJobs(env.DB, message)
    return -1
  }
  const attempts = job.attempts + 1
  if (attempts >= 3) {
    await failLanguage(env, job.post_id, lang, message)
    await saveTranslationJob(env.DB, job.id, {
      status: 'error',
      error: message,
      cursor: job.cursor,
      partial: partial ? JSON.stringify(partial) : job.partial,
      attempts,
    })
    return 1
  }
  await saveTranslationJob(env.DB, job.id, {
    status: 'running',
    error: message,
    cursor: job.cursor,
    partial: partial ? JSON.stringify(partial) : job.partial,
    attempts,
  })
  return 1
}

async function commitJob(env: Env, postId: string, lang: Lang, partial: PartialState, existing: { keywords: string; ogImage: string; locked: boolean } | undefined): Promise<void> {
  const item: SaveTranslation = {
    lang,
    title: partial.title || '',
    description: partial.description || '',
    summary: partial.summary || '',
    body: (partial.parts || []).join(''),
    faq: partial.faq || [],
    shareText: partial.shareText || '',
    keywords: existing?.keywords || '',
    ogImage: existing?.ogImage || '',
    error: '',
    engine: 'workers-ai',
    ready: true,
    locked: existing?.locked || false,
  }
  if (!item.title.trim() || !item.body.trim()) {
    await markTranslationError(env.DB, postId, lang, 'Translation finished without title or body', false)
    return
  }
  await writeTranslation(env.DB, postId, item)
}

export async function translationStatus(env: Env, postId: string) {
  const post = await getAdminPost(env.DB, postId)
  if (!post) return null
  return {
    id: post.id,
    slug: post.slug,
    jobs: await listTranslationJobs(env.DB, post.id),
    languages: post.translations.map((item) => ({
      lang: item.lang,
      ready: item.ready,
      engine: item.engine,
      error: item.error,
    })),
  }
}
