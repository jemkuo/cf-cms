export type SectionLang = 'zh' | 'en' | 'ja' | 'es' | 'ar'
export type SectionSchemaId = 'saas' | 'industrial'

export type HeroBlock = {
  eyebrow: string
  title: string
  lede: string
  primaryLabel: string
  primaryHref: string
  secondaryLabel: string
  secondaryHref: string
  badgeTitle: string
  badgeText: string
  image: string
}
export type CardBlock = {
  icon?: string
  tag?: string
  title?: string
  body?: string
  href?: string
  more?: string
  image?: string
  points?: string[]
}
export type StatBlock = { value: string; label: string }
export type CtaBlock = { eyebrow: string; title: string; body: string; label: string; href: string }
export type PersonBlock = { name: string; role: string }
export type WhyBlock = { eyebrow: string; title: string; body: string; label: string; href: string; image: string; points: string[] }
export type ContactBlock = { eyebrow: string; title: string; lede: string; email: string; address: string; note: string }

export type ResolvedSections = {
  schema: SectionSchemaId | ''
  hero: HeroBlock
  trustLabel: string
  trust: string[]
  capabilities: CardBlock[]
  productLines: CardBlock[]
  stats: StatBlock[]
  cta: CtaBlock
  team: PersonBlock[]
  why: WhyBlock
  contact: ContactBlock
}

export type SectionsSettings =
  | { schema?: undefined; locales?: undefined }
  | { schema: SectionSchemaId; locales: Partial<Record<SectionLang, Record<string, unknown>>> }

type Result = { ok: true; value: SectionsSettings } | { ok: false; error: string }

export const SECTION_LANGS: SectionLang[]
export const SAAS_FIELDS: string[]
export const INDUSTRIAL_FIELDS: string[]
export function emptySections(): SectionsSettings
export function sectionSchemaOf(preset: { sectionSchema?: string } | null | undefined): SectionSchemaId | ''
export function sectionsResetNeeded(
  previous: { sectionSchema?: string } | null | undefined,
  next: { sectionSchema?: string } | null | undefined,
): boolean
export function parseSections(input: unknown): Result
export function readSections(input: unknown): SectionsSettings
export function mergeSections(current: unknown, patch: unknown, schema: string, replace?: boolean): Result
export function resolveSections(schema: string, stored: unknown, lang: string): ResolvedSections
