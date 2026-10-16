import type { Context } from 'hono'
import type { Hono } from 'hono'
import { channelLabel } from '../config'
import { PAGE_SIZE, getArticle, listPublished, listTagCloud, publishedSource, schemaReady, tagExists, tagName } from '../db'
import { llmsTxt, robotsTxt, rss, sitemapIndex, sitemapLang } from '../feeds'
import { COPY } from '../i18n'
import { isSchemaError } from '../site'
import type { AppEnv, Lang } from '../types'
import { isLang, negotiate } from '../text'
import { aboutView, articleView, filteredView, homeView, notFoundView, schemaErrorView } from '../view/public'

function pageOf(raw: string | undefined): number {
  const value = Number(raw || '1')
  return Number.isInteger(value) && value > 0 ? value : 1
}

function langParam(c: Context<AppEnv>): Lang | null {
  const value = c.req.param('lang') || ''
  return isLang(value) ? value : null
}

async function send(c: Context<AppEnv>, body: ReturnType<typeof homeView>, status = 200) {
  return c.html(body, status as 200, {
    'cache-control': status === 200 ? 'public, max-age=60, stale-while-revalidate=600' : 'no-store',
  })
}

export function mountPublic(app: Hono<AppEnv>) {
  app.get('/health', async (c) => {
    let d1 = false
    let r2 = false
    let schema = false
    try {
      await c.env.DB.prepare('SELECT 1 AS ok').first()
      d1 = true
      schema = await schemaReady(c.env.DB)
    } catch {
      d1 = false
    }
    try {
      await c.env.MEDIA.list({ limit: 1 })
      r2 = true
    } catch {
      r2 = false
    }
    return c.json({ ok: d1 && r2 && schema, d1, r2, schema }, d1 && r2 && schema ? 200 : 503)
  })

  app.get('/brand/icon', (c) => {
    const brand = c.get('settings').brand
    const svg = brand.faviconSvg || brand.logoSvg
    if (!svg) return c.redirect('/favicon.svg', 302)
    return c.body(svg, 200, {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'x-content-type-options': 'nosniff',
    })
  })

  app.get('/robots.txt', (c) => robotsTxt(c.env))
  app.get('/sitemap.xml', (c) => sitemapIndex(c.env))
  app.get('/llms.txt', (c) => llmsTxt(c.env, false))
  app.get('/llms-full.txt', (c) => llmsTxt(c.env, true))
  for (const lang of ['zh', 'en', 'ja', 'es', 'ar'] as const) {
    app.get(`/sitemap-${lang}.xml`, (c) => sitemapLang(c.env, lang))
  }

  app.get('/', (c) => {
    const lang = negotiate(c.req.header('accept-language'))
    c.header('vary', 'Accept-Language')
    c.header('cache-control', 'no-store')
    return c.redirect(`/${lang}/`, 302)
  })

  app.get('/posts/:slug', async (c) => {
    const source = await publishedSource(c.env.DB, c.req.param('slug'))
    if (!source) return c.notFound()
    return c.redirect(`/${source}/posts/${c.req.param('slug')}`, 301)
  })

  app.get('/media/*', async (c) => {
    const key = c.req.path.slice('/media/'.length)
    if (!key || key.includes('..') || key.startsWith('/')) return c.notFound()
    const object = await c.env.MEDIA.get(key)
    if (!object) return c.notFound()
    const etag = object.httpEtag
    if (etag && c.req.header('if-none-match') === etag) {
      return new Response(null, { status: 304, headers: { etag } })
    }
    const headers = new Headers()
    headers.set('content-type', object.httpMetadata?.contentType || 'application/octet-stream')
    headers.set('cache-control', 'public, max-age=31536000, immutable')
    headers.set('etag', etag)
    headers.set('x-content-type-options', 'nosniff')
    return new Response(object.body, { headers })
  })

  app.get('/:lang{zh|en|ja|es|ar}/rss.xml', async (c) => {
    const lang = langParam(c)
    if (!lang) return c.notFound()
    return rss(c.env, lang)
  })

  app.get('/:lang{zh|en|ja|es|ar}/', async (c) => {
    const lang = langParam(c)
    if (!lang) return c.notFound()
    const page = pageOf(c.req.query('page'))
    const [{ posts, total }, tags] = await Promise.all([
      listPublished(c.env.DB, lang, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
      listTagCloud(c.env.DB, lang),
    ])
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    if (page > pages) return c.notFound()
    return send(c, homeView(base(c, lang), posts, page, pages, tags))
  })

  app.get('/:lang{zh|en|ja|es|ar}/about', async (c) => {
    const lang = langParam(c)
    if (!lang) return c.notFound()
    return send(c, aboutView(base(c, lang)))
  })

  app.get('/:lang{zh|en|ja|es|ar}/posts/:slug', async (c) => {
    const lang = langParam(c)
    if (!lang) return c.notFound()
    const article = await getArticle(c.env.DB, c.req.param('slug'), lang, false)
    if (!article) return missing(c, lang)
    return send(c, articleView(base(c, lang), article))
  })

  app.get('/:lang{zh|en|ja|es|ar}/tags/:slug', async (c) => {
    const lang = langParam(c)
    if (!lang) return c.notFound()
    const slug = c.req.param('slug')
    if (!slug || !(await tagExists(c.env.DB, slug))) return missing(c, lang)
    const page = pageOf(c.req.query('page'))
    const name = await tagName(c.env.DB, slug, lang)
    const { posts, total } = await listPublished(c.env.DB, lang, {
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      tag: slug,
    })
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    if (page > pages) return c.notFound()
    const ui = COPY[lang]
    return send(
      c,
      filteredView(base(c, lang), 'tag', slug, name, `${ui.tagsLabel}: ${name}`, posts, page, pages),
    )
  })

  app.get('/:lang{zh|en|ja|es|ar}/topics/:slug', async (c) => {
    const lang = langParam(c)
    const slug = c.req.param('slug')
    const channel = c.get('channels').find((item) => item.slug === slug && item.visible)
    if (!lang || !channel) return c.notFound()
    const page = pageOf(c.req.query('page'))
    const { posts, total } = await listPublished(c.env.DB, lang, {
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      category: slug,
    })
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    if (page > pages) return c.notFound()
    const ui = COPY[lang]
    return send(
      c,
      filteredView(
        base(c, lang),
        'topic',
        slug,
        channelLabel(c.get('channels'), slug, lang),
        ui.description,
        posts,
        page,
        pages,
      ),
    )
  })

  app.notFound(async (c) => missing(c, langFromPath(c.req.path) ?? negotiate(c.req.header('accept-language'))))

  app.onError((error, c) => {
    console.error(error)
    const lang = langFromPath(c.req.path) ?? 'zh'
    if (isSchemaError(error)) {
      return c.html(schemaErrorView(base(c, lang)), 503, { 'cache-control': 'no-store' })
    }
    return c.html(notFoundView(base(c, lang)), 500, { 'cache-control': 'no-store' })
  })
}

function base(c: Context<AppEnv>, lang: Lang) {
  return {
    env: c.env,
    nonce: c.get('nonce'),
    lang,
    settings: c.get('settings'),
    channels: c.get('channels'),
  }
}

function langFromPath(path: string): Lang | null {
  const match = path.match(/^\/(zh|en|ja|es|ar)(?:\/|$)/)
  return match && isLang(match[1]) ? match[1] : null
}

function missing(c: Context<AppEnv>, lang: Lang) {
  return c.html(notFoundView(base(c, lang)), 404, { 'cache-control': 'no-store' })
}
