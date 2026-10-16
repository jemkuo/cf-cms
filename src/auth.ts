import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { AppEnv, Env } from './types'

const COOKIE = 'cfb_session'
const TTL = 60 * 60 * 24 * 14

type AccessJwk = JsonWebKey & { kid?: string }
let certCache: { exp: number; keys: AccessJwk[] } | null = null

function bytesToB64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function b64urlToBytes(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4))
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/') + pad
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

function b64urlToJson<T>(value: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(b64urlToBytes(value))) as T
  } catch {
    return null
  }
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return new Uint8Array(sig)
}

export async function passwordMatches(input: string, expected: string): Promise<boolean> {
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(input)),
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(expected)),
  ])
  return crypto.subtle.timingSafeEqual(new Uint8Array(left), new Uint8Array(right))
}

export function authConfigured(env: Env): boolean {
  return Boolean(env.ADMIN_PASSWORD && env.SESSION_SECRET && env.SESSION_SECRET.length >= 16)
}

export async function readSession(c: Context<AppEnv>): Promise<boolean> {
  const secret = c.env.SESSION_SECRET
  if (!secret || secret.length < 16) return false
  const token = getCookie(c, COOKIE)
  if (!token) return false
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return false
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = bytesToB64url(await hmac(secret, payload))
  const left = new TextEncoder().encode(sig)
  const right = new TextEncoder().encode(expected)
  if (left.length !== right.length || !crypto.subtle.timingSafeEqual(left, right)) return false
  const data = b64urlToJson<{ exp?: number }>(payload)
  if (!data?.exp || data.exp < Math.floor(Date.now() / 1000)) return false
  return true
}

export async function writeSession(c: Context<AppEnv>): Promise<void> {
  const secret = c.env.SESSION_SECRET
  if (!secret) return
  const exp = Math.floor(Date.now() / 1000) + TTL
  const payload = bytesToB64url(new TextEncoder().encode(JSON.stringify({ exp, v: 1 })))
  const sig = bytesToB64url(await hmac(secret, payload))
  const secure = new URL(c.req.url).protocol === 'https:'
  setCookie(c, COOKIE, `${payload}.${sig}`, {
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: '/',
    maxAge: TTL,
  })
}

export function clearSession(c: Context<AppEnv>): void {
  deleteCookie(c, COOKIE, { path: '/' })
}

function teamName(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\.cloudflareaccess\.com\/?$/, '')
    .replace(/\/$/, '')
}

async function accessKeys(team: string): Promise<AccessJwk[]> {
  const now = Date.now()
  if (certCache && certCache.exp > now) return certCache.keys
  const response = await fetch(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`)
  if (!response.ok) return []
  const data = (await response.json()) as { keys?: AccessJwk[] }
  const keys = data.keys ?? []
  certCache = { exp: now + 60 * 60 * 1000, keys }
  return keys
}

export async function accessAllowed(request: Request, env: Env): Promise<boolean> {
  if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) return false
  const token = request.headers.get('Cf-Access-Jwt-Assertion')
  if (!token) return false
  const [headerPart, payloadPart, sigPart] = token.split('.')
  if (!headerPart || !payloadPart || !sigPart) return false
  const header = b64urlToJson<{ alg?: string; kid?: string }>(headerPart)
  const payload = b64urlToJson<{ aud?: string | string[]; iss?: string; exp?: number; nbf?: number }>(payloadPart)
  if (!header || header.alg !== 'RS256' || !header.kid || !payload) return false
  const now = Math.floor(Date.now() / 1000)
  if (!payload.exp || payload.exp < now) return false
  if (payload.nbf && payload.nbf > now + 60) return false
  const team = teamName(env.CF_ACCESS_TEAM_DOMAIN)
  if (payload.iss !== `https://${team}.cloudflareaccess.com`) return false
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!auds.includes(env.CF_ACCESS_AUD)) return false
  const keys = await accessKeys(team)
  const jwk = keys.find((key) => key.kid === header.kid)
  if (!jwk) return false
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const data = new TextEncoder().encode(`${headerPart}.${payloadPart}`)
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(sigPart), data)
}

export async function isAuthed(c: Context<AppEnv>): Promise<boolean> {
  if (await readSession(c)) return true
  try {
    return await accessAllowed(c.req.raw, c.env)
  } catch {
    return false
  }
}
