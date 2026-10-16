import type { Context, Hono } from 'hono'
import { fillTranslations } from '../ai'
import { authConfigured, clearSession, isAuthed, passwordMatches, writeSession } from '../auth'
import {
  deletePost,
  getAdminPost,
  getArticle,
  adminList,
  savePost,
  slugOwner,
} from '../db'
import { parsePostForm, type ParsedPost } from '../form'
import { sameOrigin } from '../site'
import type { AdminPost, AdminTranslation, AppEnv, Lang, SaveTranslation } from '../types'
import { LANGS } from '../types'
import { isLang, nowIso, safeNext } from '../text'
import { editorView, listView, loginView, mediaView } from '../view/admin'
import { articleView } from '../view/public'

import { MAX_IMAGE, imageKey, sniffImage } from '../media'

function page(c: Context<AppEnv>, body: ReturnType<typeof loginView>, status = 200) {
  return c.html(body, status as 200, { 'cache-control': 'private, no-store' })
}

function changed(prev: AdminTranslation | undefined, next: ParsedPost['translations'][Lang]): boolean {
  if (!prev) return true
  return (
    prev.title !== next.title ||
    prev.description !== next.description ||
    prev.summary !== next.summary ||
    prev.body !== next.body ||
    prev.shareText !== next.shareText ||
    prev.ready !== next.ready ||
    prev.locked !== next.locked ||
    JSON.stringify(prev.faq) !== JSON.stringify(next.faq)
  )
}

async function storePost(c: Context<AppEnv>, existing: AdminPost | null) {
  const parsed = parsePostForm(await c.req.parseBody())
  const defaults = defaultsOf(c)
  if (!parsed.ok) {
    return page(c, editorView(viewBase(c), { post: existing, error: parsed.error, defaults }), 400)
  }
  const value = parsed.value
  const id = existing?.id ?? crypto.randomUUID()
  const owner = await slugOwner(c.env.DB, value.slug)
  if (owner && owner !== id) {
    return page(c, editorView(viewBase(c), { post: existing, draft: value, error: 'slug', defaults }), 400)
  }
  const now = nowIso()
  const translations: SaveTranslation[] = []
  const deleteLangs: Lang[] = []
  for (const lang of LANGS) {
    const next = value.translations[lang]
    const prev = existing?.translations.find((item) => item.lang === lang)
    const source = lang === value.sourceLang
    if (!next.title.trim() && !next.body.trim()) {
      if (!source && prev) deleteLangs.push(lang)
      continue
    }
    if (prev?.engine === 'fallback' && !changed(prev, next)) continue
    translations.push({
      lang,
      title: next.title,
      description: next.description,
      summary: next.summary,
      body: next.body,
      faq: next.faq,
      shareText: next.shareText,
      engine: 'human',
      ready: source ? true : next.ready,
      locked: source ? true : next.locked,
    })
  }
  let publishedAt = existing?.publishedAt ?? null
  if (value.status === 'published' && !publishedAt) publishedAt = now
  await savePost(c.env.DB, {
    id,
    slug: value.slug,
    status: value.status,
    category: value.category,
    meta: value.meta,
    coverKey: value.coverKey,
    authorName: value.authorName,
    authorX: value.authorX,
    sourceLang: value.sourceLang,
    publishedAt,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    tags: value.tags,
    translations,
    deleteLangs,
  })
  if (value.autoTranslate) await fillTranslations(c.env, id, 'missing')
  return c.redirect(`/admin/posts/${id}?ok=saved`, 303)
}

export function mountAdmin(app: Hono<AppEnv>) {
  app.use('/admin', guard)
  app.use('/admin/*', guard)

  app.get('/admin/login', async (c) => {
    if (await isAuthed(c)) return c.redirect('/admin', 302)
    const error = c.req.query('error')
    return page(c, loginView(viewBase(c), safeNext(c.req.query('next'), c.env), error))
  })

  app.post('/admin/login', async (c) => {
    if (!sameOrigin(c)) return c.text('Cross-site request blocked', 403)
    const body = await c.req.parseBody()
    const next = safeNext(typeof body.next === 'string' ? body.next : undefined, c.env)
    if (!authConfigured(c.env)) return page(c, loginView(viewBase(c), next, 'config'), 503)
    const given = typeof body.password === 'string' ? body.password : ''
    if (!(await passwordMatches(given, c.env.ADMIN_PASSWORD || ''))) {
      return page(c, loginView(viewBase(c), next, 'auth'), 401)
    }
    await writeSession(c)
    return c.redirect(next, 303)
  })

  app.post('/admin/logout', (c) => {
    clearSession(c)
    return c.redirect('/admin/login', 303)
  })

  app.get('/admin', async (c) => {
    const posts = await adminList(c.env.DB)
    return page(c, listView(viewBase(c), posts, c.req.query('ok')))
  })

  app.get('/admin/posts/new', (c) => {
    return page(c, editorView(viewBase(c), { post: null, defaults: defaultsOf(c) }))
  })

  app.post('/admin/posts', (c) => storePost(c, null))

  app.get('/admin/posts/:id', async (c) => {
    const post = await getAdminPost(c.env.DB, c.req.param('id'))
    if (!post) return c.redirect('/admin?ok=missing', 302)
    return page(c, editorView(viewBase(c), { post, ok: c.req.query('ok'), defaults: defaultsOf(c) }))
  })

  app.post('/admin/posts/:id', async (c) => {
    const post = await getAdminPost(c.env.DB, c.req.param('id'))
    if (!post) return c.redirect('/admin?ok=missing', 302)
    return storePost(c, post)
  })

  app.post('/admin/posts/:id/translate', async (c) => {
    const post = await getAdminPost(c.env.DB, c.req.param('id'))
    if (!post) return c.redirect('/admin?ok=missing', 302)
    const mode = (await c.req.parseBody()).mode === 'unlocked' ? 'unlocked' : 'missing'
    await fillTranslations(c.env, post.id, mode)
    return c.redirect(`/admin/posts/${post.id}?ok=translated`, 303)
  })

  app.post('/admin/posts/:id/delete', async (c) => {
    await deletePost(c.env.DB, c.req.param('id'))
    return c.redirect('/admin?ok=deleted', 303)
  })

  app.get('/admin/preview/:id/:lang', async (c) => {
    const lang = c.req.param('lang')
    if (!isLang(lang)) return c.notFound()
    const post = await getAdminPost(c.env.DB, c.req.param('id'))
    if (!post) return c.notFound()
    const article = await getArticle(c.env.DB, post.slug, lang, true)
    if (!article) return c.notFound()
    return page(c, articleView({ ...viewBase(c), lang }, article, { preview: true }))
  })

  app.get('/admin/media', async (c) => mediaPage(c, c.req.query('uploaded'), c.req.query('error')))

  app.post('/admin/media', async (c) => {
    const body = await c.req.parseBody()
    const file = body.file
    const next = safeNext(typeof body.next === 'string' ? body.next : '/admin/media', c.env)
    const fail = async (error: string) => {
      if (wantsJson(c)) return c.json({ error }, 400)
      const url = new URL(next, c.req.url)
      url.searchParams.set('error', error)
      return c.redirect(url.pathname + url.search, 303)
    }
    if (!(file instanceof File) || file.size === 0) return fail('upload')
    if (file.size > MAX_IMAGE) return fail('size')
    const bytes = new Uint8Array(await file.arrayBuffer())
    const sniffed = sniffImage(bytes)
    if (!sniffed) return fail('type')
    const key = imageKey(sniffed.ext)
    await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: sniffed.type } })
    const url = `/media/${key}`
    if (wantsJson(c)) return c.json({ url, markdown: `![](${url})` })
    const dest = new URL(next, c.req.url)
    dest.searchParams.set('uploaded', url)
    return c.redirect(dest.pathname + dest.search, 303)
  })

  app.post('/admin/media/delete', async (c) => {
    const key = (await c.req.parseBody()).key
    if (typeof key !== 'string' || !key.startsWith('images/') || key.includes('..')) {
      return c.redirect('/admin/media?error=upload', 303)
    }
    await c.env.MEDIA.delete(key)
    return c.redirect('/admin/media', 303)
  })
}

async function guard(c: Context<AppEnv>, next: () => Promise<void>) {
  if (c.req.path === '/admin/login') return next()
  if (await isAuthed(c)) return next()
  if (c.req.method === 'GET') {
    const url = new URL(c.req.url)
    return c.redirect(`/admin/login?next=${encodeURIComponent(url.pathname + url.search)}`, 302)
  }
  return c.text('Unauthorized', 401)
}

function viewBase(c: Context<AppEnv>) {
  return { env: c.env, nonce: c.get('nonce'), settings: c.get('settings'), channels: c.get('channels') }
}

function defaultsOf(c: Context<AppEnv>) {
  return {
    author: c.env.DEFAULT_AUTHOR || 'Field Notes',
    handle: (c.get('settings').share.x || c.env.SITE_X || '').replace(/^@/, ''),
  }
}

function wantsJson(c: Context<AppEnv>): boolean {
  return (c.req.header('accept') || '').includes('application/json')
}

async function mediaPage(c: Context<AppEnv>, uploaded?: string, error?: string) {
  const listed = await c.env.MEDIA.list({ prefix: 'images/', limit: 40 })
  const objects = listed.objects
    .map((object) => ({ key: object.key, uploaded: object.uploaded.toISOString() }))
    .sort((a, b) => (a.uploaded < b.uploaded ? 1 : -1))
  const safe = uploaded && uploaded.startsWith('/media/images/') && !uploaded.includes('..') ? uploaded : undefined
  return page(c, mediaView(viewBase(c), objects, safe, error))
}
