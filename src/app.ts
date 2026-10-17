import { Hono } from 'hono'
import { DEFAULT_CONFIG, loadChannels, loadConfig } from './config'
import { processTranslationJobs } from './jobs'
import { mountAdmin } from './routes/admin'
import { mountMcp } from './routes/mcp'
import { mountPublic } from './routes/public'
import { mountSettings } from './routes/settings'
import {
  adminPrefix,
  bareAdminPath,
  configuredSafepath,
  rewriteAdminHtml,
  rewriteAdminLocation,
  safepathMatches,
} from './safepath'
import { nonce, sameOrigin } from './site'
import type { AppEnv } from './types'

const app = new Hono<AppEnv>()
const rewrittenAdmin = new WeakSet<Request>()
let rewriteMark = ''

function rewriteHeader(): string {
  if (!rewriteMark) rewriteMark = crypto.randomUUID()
  return rewriteMark
}

async function presentAdmin(response: Response, prefix: string): Promise<Response> {
  const headers = new Headers(response.headers)
  const location = headers.get('location')
  if (location) headers.set('location', rewriteAdminLocation(location, prefix))
  headers.set('x-robots-tag', 'noindex, nofollow')
  const type = headers.get('content-type') || ''
  if (!type.includes('text/html')) {
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  }
  headers.delete('content-length')
  const html = rewriteAdminHtml(await response.text(), prefix)
  return new Response(html, { status: response.status, statusText: response.statusText, headers })
}

app.use('*', async (c, next) => {
  c.set('nonce', nonce())
  c.set('settings', DEFAULT_CONFIG)
  c.set('channels', [])
  try {
    c.set('settings', await loadConfig(c.env.DB))
    c.set('channels', await loadChannels(c.env.DB))
  } catch {
    c.set('settings', DEFAULT_CONFIG)
    c.set('channels', [])
  }
  const ctx = c.executionCtx
  if (ctx?.waitUntil) ctx.waitUntil(processTranslationJobs(c.env).catch((error) => console.error('translation job', error)))
  await next()
  c.header('x-content-type-options', 'nosniff')
  c.header('referrer-policy', 'strict-origin-when-cross-origin')
  c.header('x-frame-options', 'DENY')
  c.header('permissions-policy', 'camera=(), microphone=(), geolocation=()')
  c.header(
    'content-security-policy',
    [
      "default-src 'self'",
      "img-src 'self' data: https:",
      `style-src 'self' 'nonce-${c.get('nonce')}'`,
      `script-src 'self' 'nonce-${c.get('nonce')}' https://platform.twitter.com`,
      'frame-src https://platform.twitter.com https://syndication.twitter.com',
      "connect-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
  )
  if (bareAdminPath(c.req.path) || adminPrefix(c.env) === c.req.path || c.req.path.startsWith(`${adminPrefix(c.env) || '\0'}/`)) {
    c.header('x-robots-tag', 'noindex, nofollow')
  }
})

app.use('*', async (c, next) => {
  if (rewrittenAdmin.has(c.req.raw) || (rewriteMark && c.req.header('x-cfb-rewrite') === rewriteMark)) return next()
  if (bareAdminPath(c.req.path)) return c.notFound()
  const secret = configuredSafepath(c.env)
  const parts = c.req.path.split('/')
  if (secret && parts[2] === 'admin' && (await safepathMatches(parts[1] || '', secret))) {
    const prefix = `/${secret}/admin`
    const url = new URL(c.req.url)
    let rest = c.req.path.slice(prefix.length)
    if (rest.length > 1) rest = rest.replace(/\/+$/, '')
    url.pathname = `/admin${rest}`
    const headers = new Headers(c.req.raw.headers)
    headers.set('x-cfb-rewrite', rewriteHeader())
    const req = new Request(url, {
      method: c.req.method,
      headers,
      body: c.req.method === 'GET' || c.req.method === 'HEAD' ? undefined : c.req.raw.body,
      duplex: 'half',
    } as RequestInit)
    rewrittenAdmin.add(req)
    const response = await app.fetch(req, c.env, c.executionCtx)
    return presentAdmin(response, prefix)
  }
  return next()
})

app.use('*', async (c, next) => {
  if (c.req.path === '/mcp') return next()
  if (c.req.method === 'POST' && !sameOrigin(c)) {
    return c.text('Cross-site request blocked', 403)
  }
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return next()
  const url = new URL(c.req.url)
  const path = url.pathname
  if (/^\/(zh|en|ja|es|ar)$/.test(path)) {
    return c.redirect(`${path}/${url.search}`, 301)
  }
  if (path.length > 1 && path.endsWith('/') && !/^\/(zh|en|ja|es|ar)\/$/.test(path)) {
    return c.redirect(`${path.replace(/\/+$/, '')}${url.search}`, 301)
  }
  await next()
})

mountMcp(app)
mountAdmin(app)
mountSettings(app)
mountPublic(app)

export default app
