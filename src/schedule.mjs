export const PUBLIC_SURFACES = ['post', 'list', 'channel', 'tag', 'rss', 'sitemap', 'jsonld', 'llms', 'og', 'search']

function blank(value) {
  return value == null || String(value).trim() === ''
}

export function isLive(status, publishedAt, nowIso) {
  if (status !== 'published') return false
  if (blank(publishedAt)) return true
  const published = Date.parse(publishedAt)
  const now = Date.parse(nowIso)
  if (!Number.isFinite(published) || !Number.isFinite(now)) return false
  return published <= now
}

export function visibilityOf(status, publishedAt, nowIso) {
  if (status !== 'published') return 'draft'
  return isLive(status, publishedAt, nowIso) ? 'live' : 'scheduled'
}

export function visibleOn(surface, post, nowIso) {
  if (!PUBLIC_SURFACES.includes(surface) || !post) return false
  return isLive(post.status, post.publishedAt, nowIso)
}

export function matchesListStatus(filter, status, publishedAt, nowIso) {
  const wanted = filter || 'any'
  if (wanted === 'any') return true
  if (wanted === 'scheduled') return visibilityOf(status, publishedAt, nowIso) === 'scheduled'
  if (wanted === 'published') return status === 'published'
  if (wanted === 'draft') return status === 'draft'
  return false
}

export function liveSql(alias = 'p') {
  const name = /^[A-Za-z_][A-Za-z0-9_]*$/.test(alias) ? alias : 'p'
  return `${name}.status = 'published' AND (${name}.published_at IS NULL OR ${name}.published_at <= ?)`
}

export function publicCacheControl(nowIso, nextIso, capSeconds, swrSeconds = 0) {
  const cap = Math.max(0, Math.floor(Number(capSeconds) || 0))
  const swr = Math.max(0, Math.floor(Number(swrSeconds) || 0))
  if (blank(nextIso)) {
    if (swr > 0) return `public, max-age=${cap}, stale-while-revalidate=${swr}`
    return `public, max-age=${cap}`
  }
  const delta = Date.parse(nextIso) - Date.parse(nowIso)
  if (!Number.isFinite(delta) || delta <= 0) return 'no-store'
  const seconds = Math.floor(delta / 1000)
  if (seconds <= 0) return 'no-store'
  return `public, max-age=${Math.min(cap, seconds)}, must-revalidate`
}

export function isIanaTimeZone(value) {
  if (typeof value !== 'string' || !value.trim()) return false
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value.trim() })
    return true
  } catch {
    return false
  }
}

export function canonicalTimeZone(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (raw.toUpperCase() === 'UTC') return 'UTC'
  if (typeof Intl.supportedValuesOf === 'function') {
    const found = Intl.supportedValuesOf('timeZone').find((zone) => zone.toLowerCase() === raw.toLowerCase())
    if (found) return found
  }
  if (isIanaTimeZone(raw)) return raw
  return ''
}

export function parseTimeZone(value) {
  return canonicalTimeZone(value) || 'UTC'
}

export function assertTimeZone(value) {
  const zone = canonicalTimeZone(value)
  if (!zone) throw new Error('Timezone must be an IANA name such as UTC or Asia/Shanghai.')
  return zone
}

function wallParts(date, timeZone) {
  const bag = { year: '0000', month: '01', day: '01', hour: '00', minute: '00' }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  for (const part of parts) {
    if (part.type in bag) bag[part.type] = part.value
  }
  if (bag.hour === '24') bag.hour = '00'
  bag.hour = bag.hour.padStart(2, '0')
  bag.minute = bag.minute.padStart(2, '0')
  bag.month = bag.month.padStart(2, '0')
  bag.day = bag.day.padStart(2, '0')
  return bag
}

export function zoneLabel(timeZone, at = new Date()) {
  const zone = parseTimeZone(timeZone)
  let offset = 'UTC'
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(at)
    offset = parts.find((part) => part.type === 'timeZoneName')?.value || 'UTC'
  } catch {
    offset = 'UTC'
  }
  return `${zone} (${offset})`
}

export function formatWall(iso, timeZone) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const parts = wallParts(date, parseTimeZone(timeZone))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

export function formatWallLabel(iso, timeZone) {
  const wall = formatWall(iso, timeZone)
  if (!wall) return ''
  return `${wall.replace('T', ' ')} ${zoneLabel(timeZone, new Date(iso))}`
}

export function wallToUtc(wall, timeZone) {
  const raw = String(wall ?? '').trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(raw)
  if (!match) throw new Error('Enter a date and time.')
  const provided = String(timeZone ?? '').trim()
  const zone = provided ? canonicalTimeZone(provided) : 'UTC'
  if (!zone) throw new Error('Timezone must be an IANA name such as UTC or Asia/Shanghai.')
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const wanted = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}`
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0)
  for (let i = 0; i < 4; i += 1) {
    const got = formatWall(new Date(utc).toISOString(), zone)
    if (got === wanted) return new Date(utc).toISOString()
    const parsed = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(got)
    if (!parsed) break
    const gotUtc = Date.UTC(Number(parsed[1]), Number(parsed[2]) - 1, Number(parsed[3]), Number(parsed[4]), Number(parsed[5]), 0)
    utc += Date.UTC(year, month - 1, day, hour, minute, 0) - gotUtc
  }
  throw new Error('That time does not exist in this timezone.')
}

export function parsePublishAt(value, nowIso) {
  const raw = String(value ?? '').trim()
  if (!raw) throw new Error('publish_at is required')
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) {
    throw new Error('publish_at must be ISO 8601 with a timezone offset or Z')
  }
  const parsed = Date.parse(raw)
  const now = Date.parse(nowIso)
  if (!Number.isFinite(parsed)) throw new Error('publish_at is not a valid datetime')
  if (!Number.isFinite(now) || parsed <= now) {
    throw new Error('publish_at must be in the future. Publish now, or pick a later time.')
  }
  return new Date(parsed).toISOString()
}
