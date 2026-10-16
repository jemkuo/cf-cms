import type { Env } from './types'

const SHAPE = /^[A-Za-z0-9_-]{12,128}$/

export function configuredSafepath(env: Env): string | null {
  const value = (env.ADMIN_SAFEPATH || '').trim()
  return SHAPE.test(value) ? value : null
}

export function adminPrefix(env: Env): string | null {
  const secret = configuredSafepath(env)
  return secret ? `/${secret}/admin` : null
}

export async function safepathMatches(presented: string, expected: string): Promise<boolean> {
  const digest = (value: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  const [left, right] = await Promise.all([digest(presented), digest(expected)])
  return crypto.subtle.timingSafeEqual(new Uint8Array(left), new Uint8Array(right))
}

export function bareAdminPath(path: string): boolean {
  return path === '/admin' || path.startsWith('/admin/')
}

export function rewriteAdminLocation(location: string, prefix: string): string {
  if (location === '/admin' || location.startsWith('/admin/') || location.startsWith('/admin?')) {
    return prefix + location.slice('/admin'.length)
  }
  try {
    const url = new URL(location)
    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
      url.pathname = prefix + url.pathname.slice('/admin'.length)
      return url.href
    }
  } catch {
    return location
  }
  return location
}

export function rewriteAdminHtml(html: string, prefix: string): string {
  return html.replaceAll('="/admin', `="${prefix}`)
}
