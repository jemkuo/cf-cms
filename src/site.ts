import type { Context } from 'hono'
import type { AppEnv, Env } from './types'

export function originOf(env: Env): string {
  return (env.SITE_URL || 'https://example.com').replace(/\/$/, '')
}

export function siteName(env: Env): string {
  return env.SITE_NAME || 'Field Notes'
}

export function siteHandle(env: Env): string {
  return (env.SITE_X || '').replace(/^@/, '')
}

export function sameOrigin(c: Context<AppEnv>): boolean {
  const host = new URL(c.req.url).host
  const origin = c.req.header('origin')
  if (origin) {
    try {
      return new URL(origin).host === host
    } catch {
      return false
    }
  }
  const referer = c.req.header('referer')
  if (!referer) return false
  try {
    return new URL(referer).host === host
  } catch {
    return false
  }
}

export function nonce(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

export function isSchemaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /no such table/i.test(message)
}
