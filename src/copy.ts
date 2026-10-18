import type { SiteConfig } from './config'
import { COPY } from './i18n'
import { readSiteCopy, resolveSiteCopy, type SiteCopyFields } from './site-copy.mjs'
import type { Lang } from './types'

type CopySettings = Pick<SiteConfig, 'site_copy' | 'meta'>

// Stored overrides for one language (no fallbacks).
export function ownCopy(lang: Lang, settings?: Partial<CopySettings> | null): SiteCopyFields {
  return readSiteCopy(settings?.site_copy)[lang] || {}
}

// Built-in copy for a language with the editable site copy applied.
// description falls back to the site-wide meta description, then to the built-in line.
export function uiFor(lang: Lang, settings?: Partial<CopySettings> | null): (typeof COPY)[Lang] {
  const base = COPY[lang]
  if (!settings) return base
  return { ...base, ...resolveSiteCopy(base, settings.site_copy, lang, settings.meta?.description || '') }
}
