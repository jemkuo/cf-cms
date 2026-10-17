import type { Hono } from 'hono'
import onboarding from '../../onboarding.json'
import { processTranslationJobs } from '../jobs'
import { handleRpc } from '../mcp/dispatch'
import type { AppEnv } from '../types'

async function tokenMatches(expected: string | undefined, header: string | undefined): Promise<boolean> {
  if (!expected || expected.length < 16) return false
  const presented = (header || '').replace(/^Bearer\s+/i, '').trim()
  const encode = (value: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  const [left, right] = await Promise.all([encode(presented), encode(expected)])
  return crypto.subtle.timingSafeEqual(new Uint8Array(left), new Uint8Array(right))
}

export function mountMcp(app: Hono<AppEnv>) {
  app.get('/mcp', (c) =>
    c.json({
      name: 'CF CMS',
      package: 'cf-cms',
      protocol: '2024-11-05',
      onboarding,
      auth: 'POST JSON-RPC to this URL with Authorization: Bearer $ADMIN_API_TOKEN',
    }),
  )

  app.post('/mcp', async (c) => {
    const token = c.env.ADMIN_API_TOKEN
    if (!token || token.length < 16) {
      return c.json(
        { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'ADMIN_API_TOKEN is not configured' } },
        503,
      )
    }
    if (!(await tokenMatches(token, c.req.header('authorization')))) {
      return c.json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Unauthorized' } }, 401)
    }
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400)
    }
    const response = await handleRpc(c.env, body)
    const ctx = c.executionCtx
    if (ctx?.waitUntil) ctx.waitUntil(processTranslationJobs(c.env, { maxAiCalls: 8 }).catch((error) => console.error('translation job', error)))
    if (response === null) return c.body(null, 202)
    return c.json(response)
  })
}
