export const PUBLISH_LANGS: readonly ['zh', 'en', 'ja', 'es', 'ar']

export type TranslationGateRow = {
  lang: string
  title?: string
  body?: string
  ready?: boolean
  engine?: string
  error?: string
}

export type PublishBlocker = { lang: string; state: string; error?: string }

export function requireAllLanguages(value: unknown): boolean

export function allLanguagesOption(value: unknown, fallback: unknown): boolean

export function publishBlockers(rows: TranslationGateRow[]): PublishBlocker[]

export function publishRefusal(blockers: PublishBlocker[]): { zh: string; en: string }

export function refusalText(blockers: PublishBlocker[]): string
