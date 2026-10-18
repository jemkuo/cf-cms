import type { Lang, PostMeta } from './types'
import { LANGS } from './types'
import { clip, nowIso, slugOk } from './text'
import { TEMPLATE_IDS, type TemplateId } from './templates'
import { showPoweredBy } from './footer-credit.mjs'
import { emptyHeadMeta, parseHeadMeta, type HeadMetaSettings } from './head-meta.mjs'
import { requireAllLanguages } from './publish-gate.mjs'
import { assertTimeZone, parseTimeZone } from './schedule.mjs'
import { emptySiteCopy, parseSiteCopy, readSiteCopy, type SiteCopySettings } from './site-copy.mjs'

export { TEMPLATE_IDS, type TemplateId }
export const ACCENTS = ['vermilion', 'blue', 'green', 'gold', 'slate'] as const
export const RADII = ['sharp', 'soft'] as const
export const FONTS = ['serif', 'sans', 'mono'] as const
export const WIDTHS = ['narrow', 'wide'] as const
export const HEADERS = ['bar', 'stacked'] as const
export const HOMES = ['list', 'compact'] as const
export const TWITTER_CARDS = ['summary', 'summary_large_image'] as const

export type Accent = (typeof ACCENTS)[number]
export type Radius = (typeof RADII)[number]
export type FontChoice = (typeof FONTS)[number]
export type Width = (typeof WIDTHS)[number]
export type HeaderStyle = (typeof HEADERS)[number]
export type HomeStyle = (typeof HOMES)[number]
export type TwitterCard = (typeof TWITTER_CARDS)[number]

export type TemplateSettings = { id: TemplateId; accent: Accent; radius: Radius; font: FontChoice }
export type LayoutSettings = {
  width: Width
  header: HeaderStyle
  home: HomeStyle
  showAuthor: boolean
  showTags: boolean
  showShare: boolean
  showKicker: boolean
  show_powered_by: boolean
}
export type SiteMetaSettings = {
  description: string
  titleSuffix: string
  ogImage: string
  twitterCard: TwitterCard
  robots: string
}
export type ShareSettings = {
  x: string
  github: string
  mastodon: string
  linkedin: string
  website: string
  showRss: boolean
}
export type BrandSettings = {
  mark: string
  themeColor: string
  logoSvg: string
  logoKey: string
  faviconSvg: string
  faviconKey: string
}
export type { HeadMetaSettings, SiteCopySettings }

export type SiteConfig = {
  template: TemplateSettings
  layout: LayoutSettings
  meta: SiteMetaSettings
  share: ShareSettings
  brand: BrandSettings
  require_all_languages: boolean
  head_meta: HeadMetaSettings
  timezone: string
  site_copy: SiteCopySettings
}
export type SettingsKey = keyof SiteConfig

export type { PostMeta }

export type Channel = {
  slug: string
  sortOrder: number
  visible: boolean
  names: Partial<Record<Lang, string>>
  descriptions: Partial<Record<Lang, string>>
}

export type TagAdmin = {
  slug: string
  count: number
  names: Partial<Record<Lang, string>>
}

export const DEFAULT_CONFIG: SiteConfig = {
  template: { id: 'paper', accent: 'vermilion', radius: 'sharp', font: 'sans' },
  layout: {
    width: 'narrow',
    header: 'bar',
    home: 'list',
    showAuthor: true,
    showTags: true,
    showShare: true,
    showKicker: true,
    show_powered_by: true,
  },
  meta: {
    description: '',
    titleSuffix: '',
    ogImage: '',
    twitterCard: 'summary_large_image',
    robots: 'index, follow, max-image-preview:large',
  },
  share: { x: '', github: '', mastodon: '', linkedin: '', website: '', showRss: true },
  brand: { mark: '', themeColor: '', logoSvg: '', logoKey: '', faviconSvg: '', faviconKey: '' },
  require_all_languages: true,
  head_meta: emptyHeadMeta(),
  timezone: 'UTC',
  site_copy: emptySiteCopy(),
}

export const EMPTY_POST_META: PostMeta = { noindex: false, canonical: '', keywords: '', ogImage: '' }

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function flag(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (value === 'on' || value === 'true' || value === '1' || value === 1) return true
  if (value === 'off' || value === 'false' || value === '0' || value === 0 || value === '') return false
  return fallback
}

function asRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  return input as Record<string, unknown>
}

export function cleanPath(value: unknown): string {
  const raw = clip(String(value ?? '').trim(), 240)
  if (!raw) return ''
  if (raw === '/og.png') return raw
  if ((raw.startsWith('/covers/') || raw.startsWith('/media/images/')) && !raw.includes('..')) return raw
  return ''
}

function cleanUrl(value: unknown): string {
  const raw = clip(String(value ?? '').trim(), 300)
  if (!raw) return ''
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
    return url.href
  } catch {
    return ''
  }
}

function cleanHandle(value: unknown): string {
  return clip(String(value ?? '').replace(/^@/, '').trim(), 80).replace(/\s+/g, '')
}

function cleanText(value: unknown, max: number): string {
  return clip(String(value ?? '').replace(/[\u0000-\u001f]/g, '').trim(), max)
}

export function parseTemplate(input: unknown): TemplateSettings {
  const row = asRecord(input)
  const base = DEFAULT_CONFIG.template
  return {
    id: oneOf(row.id, TEMPLATE_IDS, base.id),
    accent: oneOf(row.accent, ACCENTS, base.accent),
    radius: oneOf(row.radius, RADII, base.radius),
    font: oneOf(row.font, FONTS, base.font),
  }
}

export function parseLayout(input: unknown): LayoutSettings {
  const row = asRecord(input)
  const base = DEFAULT_CONFIG.layout
  return {
    width: oneOf(row.width, WIDTHS, base.width),
    header: oneOf(row.header, HEADERS, base.header),
    home: oneOf(row.home, HOMES, base.home),
    showAuthor: flag(row.showAuthor, base.showAuthor),
    showTags: flag(row.showTags, base.showTags),
    showShare: flag(row.showShare, base.showShare),
    showKicker: flag(row.showKicker, base.showKicker),
    show_powered_by: showPoweredBy(row.show_powered_by),
  }
}

export function parseSiteMeta(input: unknown): SiteMetaSettings {
  const row = asRecord(input)
  const base = DEFAULT_CONFIG.meta
  return {
    description: cleanText(row.description, 300),
    titleSuffix: cleanText(row.titleSuffix, 40),
    ogImage: cleanPath(row.ogImage),
    twitterCard: oneOf(row.twitterCard, TWITTER_CARDS, base.twitterCard),
    robots: cleanText(row.robots, 120) || base.robots,
  }
}

function cleanHex(value: unknown): string {
  const raw = String(value ?? '').trim()
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toLowerCase() : ''
}

function storedSvg(value: unknown): string {
  if (typeof value !== 'string') return ''
  const text = value.trim()
  if (text.length < 20 || text.length > 20000 || !text.startsWith('<svg') || !text.endsWith('</svg>')) return ''
  if (/<script|foreignobject|<!\[CDATA\[|javascript:|data:|on[a-z]+\s*=/i.test(text)) return ''
  return text
}

export function parseBrand(input: unknown): BrandSettings {
  const row = asRecord(input)
  return {
    mark: cleanText(row.mark, 80),
    themeColor: cleanHex(row.themeColor),
    logoSvg: storedSvg(row.logoSvg),
    logoKey: cleanPath(row.logoKey),
    faviconSvg: storedSvg(row.faviconSvg),
    faviconKey: cleanPath(row.faviconKey),
  }
}

export function parseShare(input: unknown): ShareSettings {
  const row = asRecord(input)
  return {
    x: cleanHandle(row.x),
    github: cleanUrl(row.github),
    mastodon: cleanUrl(row.mastodon),
    linkedin: cleanUrl(row.linkedin),
    website: cleanUrl(row.website),
    showRss: flag(row.showRss, true),
  }
}

export function parsePostMeta(input: unknown): PostMeta {
  const row = asRecord(input)
  const canonical = cleanUrl(row.canonical)
  return {
    noindex: flag(row.noindex, false),
    canonical,
    keywords: cleanText(row.keywords, 180),
    ogImage: cleanPath(row.ogImage),
  }
}

export function parseHeadMetaSettings(input: unknown): HeadMetaSettings {
  const parsed = parseHeadMeta(input ?? emptyHeadMeta())
  return parsed.ok ? parsed.value : emptyHeadMeta()
}

const PARSERS = {
  template: parseTemplate,
  layout: parseLayout,
  meta: parseSiteMeta,
  share: parseShare,
  brand: parseBrand,
  require_all_languages: (input: unknown) => requireAllLanguages(input),
  head_meta: (input: unknown) => {
    const parsed = parseHeadMeta(input ?? emptyHeadMeta())
    if (!parsed.ok) throw new Error(parsed.error)
    return parsed.value
  },
  timezone: (input: unknown) => assertTimeZone(input),
  site_copy: (input: unknown) => {
    const parsed = parseSiteCopy(input)
    if (!parsed.ok) throw new Error(parsed.error)
    return parsed.value
  },
} as const

const SETTING_KEYS = ['template', 'layout', 'meta', 'share', 'brand', 'require_all_languages', 'head_meta', 'timezone', 'site_copy'] as const

export function parseSettings(partial: Partial<Record<SettingsKey, unknown>>): SiteConfig {
  return {
    template: parseTemplate(partial.template ?? DEFAULT_CONFIG.template),
    layout: parseLayout(partial.layout ?? DEFAULT_CONFIG.layout),
    meta: parseSiteMeta(partial.meta ?? DEFAULT_CONFIG.meta),
    share: parseShare(partial.share ?? DEFAULT_CONFIG.share),
    brand: parseBrand(partial.brand ?? DEFAULT_CONFIG.brand),
    require_all_languages: requireAllLanguages(partial.require_all_languages),
    head_meta: parseHeadMetaSettings(partial.head_meta),
    timezone: parseTimeZone(partial.timezone),
    site_copy: readSiteCopy(partial.site_copy),
  }
}

export async function loadConfig(db: D1Database): Promise<SiteConfig> {
  try {
    const { results } = await db
      .prepare(`SELECT key, value_json FROM settings WHERE key IN ('template', 'layout', 'meta', 'share', 'brand', 'require_all_languages', 'head_meta', 'timezone', 'site_copy')`)
      .all<{ key: string; value_json: string }>()
    const partial: Partial<Record<SettingsKey, unknown>> = {}
    for (const row of results) {
      if (!(SETTING_KEYS as readonly string[]).includes(row.key)) continue
      try {
        partial[row.key as SettingsKey] = JSON.parse(row.value_json)
      } catch {
        partial[row.key as SettingsKey] = {}
      }
    }
    return parseSettings(partial)
  } catch {
    return DEFAULT_CONFIG
  }
}

export async function saveSettings(db: D1Database, key: SettingsKey, value: SiteConfig[SettingsKey]): Promise<void> {
  const parsed = PARSERS[key](value)
  await db
    .prepare(
      `INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    )
    .bind(key, JSON.stringify(parsed), nowIso())
    .run()
}

export function channelLabel(channels: Channel[], slug: string, lang: Lang): string {
  const found = channels.find((item) => item.slug === slug)
  return found?.names[lang] || found?.names.en || slug
}

export async function listChannels(db: D1Database): Promise<Channel[]> {
  const { results } = await db
    .prepare(`SELECT slug, sort_order, visible FROM channels ORDER BY sort_order, slug`)
    .all<{ slug: string; sort_order: number; visible: number }>()
  const { results: names } = await db
    .prepare(`SELECT channel_slug, lang, name, description FROM channel_translations`)
    .all<{ channel_slug: string; lang: string; name: string; description: string }>()
  return results.map((row) => {
    const channel: Channel = { slug: row.slug, sortOrder: row.sort_order, visible: row.visible === 1, names: {}, descriptions: {} }
    for (const item of names) {
      if (item.channel_slug !== row.slug) continue
      if (!(LANGS as readonly string[]).includes(item.lang)) continue
      const lang = item.lang as Lang
      channel.names[lang] = item.name
      channel.descriptions[lang] = item.description
    }
    return channel
  })
}

export async function loadChannels(db: D1Database): Promise<Channel[]> {
  try {
    return await listChannels(db)
  } catch {
    return []
  }
}

type ChannelInput = {
  slug: string
  sortOrder?: number
  visible?: boolean
  names?: Partial<Record<Lang, string>>
  descriptions?: Partial<Record<Lang, string>>
}

export function parseChannelInput(input: unknown): ChannelInput | null {
  const row = asRecord(input)
  const slug = String(row.slug ?? '').trim().toLowerCase()
  if (!slugOk(slug)) return null
  const names: Partial<Record<Lang, string>> = {}
  const descriptions: Partial<Record<Lang, string>> = {}
  const nameRow = asRecord(row.names)
  const descRow = asRecord(row.descriptions)
  for (const lang of LANGS) {
    const name = cleanText(nameRow[lang] ?? row[`name_${lang}`], 60)
    const description = cleanText(descRow[lang] ?? row[`description_${lang}`], 180)
    if (name) names[lang] = name
    if (description) descriptions[lang] = description
  }
  const sort = Number(row.sortOrder ?? row.sort_order ?? 0)
  return {
    slug,
    sortOrder: Number.isFinite(sort) ? Math.max(0, Math.min(999, Math.trunc(sort))) : 0,
    visible: flag(row.visible, true),
    names,
    descriptions,
  }
}

export async function upsertChannel(db: D1Database, input: ChannelInput): Promise<void> {
  const now = nowIso()
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO channels (slug, sort_order, visible, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET sort_order = excluded.sort_order, visible = excluded.visible`,
      )
      .bind(input.slug, input.sortOrder ?? 0, input.visible === false ? 0 : 1, now),
  ]
  for (const lang of LANGS) {
    const name = input.names?.[lang]
    if (!name) continue
    statements.push(
      db
        .prepare(
          `INSERT INTO channel_translations (channel_slug, lang, name, description) VALUES (?, ?, ?, ?)
           ON CONFLICT(channel_slug, lang) DO UPDATE SET name = excluded.name, description = excluded.description`,
        )
        .bind(input.slug, lang, name, input.descriptions?.[lang] || ''),
    )
  }
  await db.batch(statements)
}

export async function deleteChannel(db: D1Database, slug: string): Promise<string | null> {
  if (!slugOk(slug)) return 'invalid'
  const used = await db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE category = ?`).bind(slug).first<{ n: number }>()
  if ((used?.n ?? 0) > 0) return 'in-use'
  await db.batch([
    db.prepare(`DELETE FROM channel_translations WHERE channel_slug = ?`).bind(slug),
    db.prepare(`DELETE FROM channels WHERE slug = ?`).bind(slug),
  ])
  return null
}

export async function listTagsAdmin(db: D1Database): Promise<TagAdmin[]> {
  const { results } = await db
    .prepare(
      `SELECT tg.slug, COUNT(pt.post_id) AS n
       FROM tags tg
       LEFT JOIN post_tags pt ON pt.tag_slug = tg.slug
       GROUP BY tg.slug
       ORDER BY tg.slug`,
    )
    .all<{ slug: string; n: number }>()
  const { results: names } = await db
    .prepare(`SELECT tag_slug, lang, name FROM tag_translations`)
    .all<{ tag_slug: string; lang: string; name: string }>()
  return results.map((row) => {
    const tag: TagAdmin = { slug: row.slug, count: row.n, names: {} }
    for (const item of names) {
      if (item.tag_slug !== row.slug) continue
      if (!(LANGS as readonly string[]).includes(item.lang)) continue
      tag.names[item.lang as Lang] = item.name
    }
    return tag
  })
}

export async function upsertTag(db: D1Database, slug: string, names: Partial<Record<Lang, string>>): Promise<boolean> {
  if (!slugOk(slug)) return false
  const now = nowIso()
  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO tags (slug, created_at) VALUES (?, ?) ON CONFLICT(slug) DO NOTHING`).bind(slug, now),
  ]
  for (const lang of LANGS) {
    const name = names[lang]?.trim()
    if (!name) continue
    statements.push(
      db
        .prepare(
          `INSERT INTO tag_translations (tag_slug, lang, name) VALUES (?, ?, ?)
           ON CONFLICT(tag_slug, lang) DO UPDATE SET name = excluded.name`,
        )
        .bind(slug, lang, clip(name, 40)),
    )
  }
  await db.batch(statements)
  return true
}

export async function deleteTag(db: D1Database, slug: string): Promise<void> {
  await db.batch([
    db.prepare(`DELETE FROM post_tags WHERE tag_slug = ?`).bind(slug),
    db.prepare(`DELETE FROM tag_translations WHERE tag_slug = ?`).bind(slug),
    db.prepare(`DELETE FROM tags WHERE slug = ?`).bind(slug),
  ])
}

export function namesFromRow(row: Record<string, unknown>): Partial<Record<Lang, string>> {
  const source = asRecord(row.names)
  const names: Partial<Record<Lang, string>> = {}
  for (const lang of LANGS) {
    const value = cleanText(source[lang] ?? row[`name_${lang}`], 40)
    if (value) names[lang] = value
  }
  return names
}
