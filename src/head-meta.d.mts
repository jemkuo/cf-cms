export type HeadMetaEntry = {
  kind: 'name' | 'property'
  key: string
  attr: 'content' | 'value'
  value: string
}

export type HeadMetaSettings = { entries: HeadMetaEntry[]; raw: string }

export const HEAD_PRESETS: { key: string; kind: 'name' | 'property'; attr: 'content' | 'value'; label: string }[]

export function emptyHeadMeta(): HeadMetaSettings

export function isReservedMetaKey(key: string): boolean

export function parseHeadMeta(
  input: unknown,
): { ok: true; value: HeadMetaSettings } | { ok: false; error: string }

export function sanitizeHeadSnippet(input: string): { ok: true; html: string } | { ok: false; error: string }

export function renderHeadMeta(meta: HeadMetaSettings | null | undefined): string
