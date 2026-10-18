export type SiteCopyLang = 'zh' | 'en' | 'ja' | 'es' | 'ar'
export type SiteCopyFields = {
  tagline?: string
  kicker?: string
  description?: string
  footer?: string
  aboutTitle?: string
  aboutBody?: string[]
}
export type SiteCopySettings = Partial<Record<SiteCopyLang, SiteCopyFields>>
export type ResolvedSiteCopy = {
  tagline: string
  kicker: string
  description: string
  footer: string
  aboutTitle: string
  aboutBody: string[]
}
type Result = { ok: true; value: SiteCopySettings } | { ok: false; error: string }

export const SITE_COPY_LANGS: SiteCopyLang[]
export const SITE_COPY_TEXT_FIELDS: string[]
export const SITE_COPY_FIELDS: string[]
export const SITE_COPY_LIMITS: Record<string, number>
export function emptySiteCopy(): SiteCopySettings
export function splitParagraphs(value: unknown): string[]
export function parseSiteCopy(input: unknown): Result
export function readSiteCopy(input: unknown): SiteCopySettings
export function mergeSiteCopy(current: unknown, patch: unknown, replace?: boolean): Result
export function resolveSiteCopy(
  defaults: { tagline: string; kicker: string; description: string; footer: string; aboutTitle: string; aboutBody: string[] },
  siteCopy: unknown,
  lang: string,
  siteDescription?: string,
): ResolvedSiteCopy
