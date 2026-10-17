export const PUBLIC_SURFACES: readonly ['post', 'list', 'channel', 'tag', 'rss', 'sitemap', 'jsonld', 'llms', 'og', 'search']

export function isLive(status: string, publishedAt: string | null | undefined, nowIso: string): boolean

export function visibilityOf(
  status: string,
  publishedAt: string | null | undefined,
  nowIso: string,
): 'draft' | 'scheduled' | 'live'

export function visibleOn(
  surface: string,
  post: { status: string; publishedAt?: string | null } | null | undefined,
  nowIso: string,
): boolean

export function matchesListStatus(
  filter: string | null | undefined,
  status: string,
  publishedAt: string | null | undefined,
  nowIso: string,
): boolean

export function liveSql(alias?: string): string

export function publicCacheControl(
  nowIso: string,
  nextIso: string | null | undefined,
  capSeconds: number,
  swrSeconds?: number,
): string

export function isIanaTimeZone(value: unknown): boolean
export function canonicalTimeZone(value: unknown): string
export function parseTimeZone(value: unknown): string
export function assertTimeZone(value: unknown): string
export function zoneLabel(timeZone: string, at?: Date): string
export function formatWall(iso: string, timeZone: string): string
export function formatWallLabel(iso: string, timeZone: string): string
export function wallToUtc(wall: string, timeZone: string): string
export function parsePublishAt(value: unknown, nowIso: string): string
