import { html, raw } from 'hono/html'
import {
  loadConfig,
  parseBrand,
  parseLayout,
  parseSiteMeta,
  parseTemplate,
  saveSettings,
  type BrandSettings,
  type SiteConfig,
} from './config'
import { imageKey, sniffImage } from './media'
import { PRESETS, TEMPLATE_IDS, presetById, type MarkShape, type TemplatePreset } from './templates'
import type { Env } from './types'

const SVG_TAGS = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'title',
  'desc',
  'defs',
  'lineargradient',
  'radialgradient',
  'stop',
])

export function sanitizeSvg(input: string): string | null {
  let text = input.replace(/^\uFEFF/, '').trim()
  text = text.replace(/^<\?xml\b[^?]*\?>\s*/i, '').trim()
  text = text.replace(/<!--[\s\S]*?-->/g, '').trim()
  if (text.length < 20 || text.length > 20000) return null
  if (!/^<svg[\s>]/i.test(text) || !/<\/svg>\s*$/i.test(text)) return null
  if (/<script|foreignobject|<!DOCTYPE|<!\[CDATA\[|javascript:|data:|on[a-z]+\s*=/i.test(text)) return null
  if (/\b(?:xlink:)?href\s*=\s*["'](?!#)/i.test(text)) return null
  const tags = text.match(/<\/?\s*([a-zA-Z0-9:]+)/g) || []
  for (const tag of tags) {
    const name = tag.replace(/<\/?\s*/, '').split(':').pop()!.toLowerCase()
    if (!SVG_TAGS.has(name)) return null
  }
  return text
}

function xml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function markInitials(mark: string): string {
  const trimmed = mark.trim()
  if (!trimmed) return 'FN'
  const parts = trimmed.split(/\s+/).filter(Boolean)
  const asciiWord = (value: string) => /^[A-Za-z0-9]+$/.test(value)
  if (parts.length >= 2 && asciiWord(parts[0]!) && asciiWord(parts[1]!)) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  }
  return Array.from(trimmed).slice(0, 2).join('')
}

function inkFor(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luminance > 0.62 ? '#1c1915' : '#f7f4ee'
}

function shapeMarkup(shape: MarkShape, color: string, ink: string): string {
  if (shape === 'circle') return `<circle cx="32" cy="32" r="30" fill="${color}"/>`
  if (shape === 'rounded') return `<rect width="64" height="64" rx="18" fill="${color}"/>`
  if (shape === 'pill') return `<rect x="4" y="14" width="56" height="36" rx="18" fill="${color}"/>`
  if (shape === 'bars') {
    return `<rect width="64" height="64" rx="6" fill="${color}"/><rect x="10" y="46" width="30" height="5" fill="${ink}"/><rect x="10" y="36" width="18" height="5" fill="${ink}" opacity="0.65"/>`
  }
  if (shape === 'ring') return `<circle cx="32" cy="32" r="24" fill="none" stroke="${color}" stroke-width="8"/>`
  if (shape === 'shield') {
    return `<path d="M32 4 56 14v18c0 14-10 24-24 28C18 56 8 46 8 32V14Z" fill="${color}"/>`
  }
  if (shape === 'slash') {
    return `<rect width="64" height="64" rx="4" fill="${color}"/><polygon points="42,6 58,6 22,58 6,58" fill="${ink}" opacity="0.28"/>`
  }
  return `<rect width="64" height="64" fill="${color}"/>`
}

export function buildLogoSvg(preset: Pick<TemplatePreset, 'themeColor' | 'shape' | 'font'>, mark: string): string {
  const letters = markInitials(mark)
  const ink = inkFor(preset.themeColor)
  const count = Array.from(letters).length
  const size = count > 1 ? 18 : 28
  const family = preset.font === 'mono' ? 'ui-monospace,monospace' : preset.font === 'sans' ? 'Arial,sans-serif' : 'Georgia,serif'
  const y = preset.shape === 'bars' ? 28 : preset.shape === 'ring' ? 38 : 40
  const fill = preset.shape === 'ring' ? preset.themeColor : ink
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-hidden="true" data-kit="cfb" data-shape="${preset.shape}">${shapeMarkup(preset.shape, preset.themeColor, ink)}<text x="32" y="${y}" text-anchor="middle" font-family="${family}" font-size="${size}" fill="${fill}">${xml(letters)}</text></svg>`
}

const SHAPES = new Set<MarkShape>(['square', 'rounded', 'bars', 'circle', 'ring', 'shield', 'pill', 'slash'])

export function isKitSvg(svg: string): boolean {
  return svg.includes('data-kit="cfb"') || svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-hidden="true">')
}

function shapeFromSvg(svg: string): MarkShape | null {
  const marked = svg.match(/data-shape="([a-z]+)"/)
  if (marked && SHAPES.has(marked[1] as MarkShape)) return marked[1] as MarkShape
  if (svg.includes('stroke-width="8"')) return 'ring'
  if (svg.includes('M32 4')) return 'shield'
  if (svg.includes('<polygon ')) return 'slash'
  if (svg.includes('x="4" y="14"')) return 'pill'
  if (svg.includes('y="46"')) return 'bars'
  if (svg.includes('rx="18"')) return 'rounded'
  if (svg.includes('<circle ')) return 'circle'
  if (svg.includes('<rect ')) return 'square'
  return null
}

export function paintKitSvg(svg: string, themeColor: string, mark: string, font: TemplatePreset['font'], fallbackShape: MarkShape): string | null {
  if (!isKitSvg(svg) || !/^#[0-9a-fA-F]{6}$/.test(themeColor)) return null
  return buildLogoSvg({ themeColor, shape: shapeFromSvg(svg) || fallbackShape, font }, mark)
}

export function paintKitBrand(brand: BrandSettings, templateId: string): BrandSettings {
  const preset = presetById(templateId)
  if (!preset || !brand.themeColor) return brand
  const next = { ...brand }
  const logo = brand.logoSvg ? paintKitSvg(brand.logoSvg, brand.themeColor, brand.mark, preset.font, preset.shape) : null
  const icon = brand.faviconSvg ? paintKitSvg(brand.faviconSvg, brand.themeColor, brand.mark, preset.font, preset.shape) : null
  if (logo) next.logoSvg = logo
  if (icon) next.faviconSvg = icon
  return parseBrand(next)
}

export function markText(brand: BrandSettings, fallback: string): string {
  return brand.mark.trim() || fallback
}

export function iconHref(brand: BrandSettings): string {
  if (brand.faviconKey) return brand.faviconKey
  if (brand.faviconSvg || brand.logoSvg) return '/brand/icon'
  return '/favicon.svg'
}

export function brandStyle(brand: BrandSettings, nonce: string): ReturnType<typeof raw> | '' {
  if (!/^#[0-9a-fA-F]{6}$/.test(brand.themeColor)) return ''
  return raw(`<style nonce="${nonce}">html{--brand:${brand.themeColor}}</style>`)
}

export function logoHtml(brand: BrandSettings): ReturnType<typeof html> {
  if (brand.logoSvg) return html`<span class="logo-mark">${raw(brand.logoSvg)}</span>`
  if (brand.logoKey) return html`<span class="logo-mark"><img src="${brand.logoKey}" alt=""></span>`
  return html``
}

export function hasLogo(brand: BrandSettings): boolean {
  return Boolean(brand.logoSvg || brand.logoKey)
}

type LogoAsset =
  | { kind: 'svg'; svg: string }
  | { kind: 'png'; bytes: Uint8Array; type: string; ext: string }
  | { error: string }

export function readLogoAsset(bytes: Uint8Array): LogoAsset {
  if (bytes.byteLength === 0) return { error: 'empty' }
  if (bytes.byteLength > 1024 * 1024) return { error: 'size' }
  const head = new TextDecoder().decode(bytes.slice(0, 200)).trimStart()
  if (head.startsWith('<svg') || head.startsWith('<?xml')) {
    const svg = sanitizeSvg(new TextDecoder().decode(bytes))
    if (!svg) return { error: 'svg' }
    return { kind: 'svg', svg }
  }
  const sniffed = sniffImage(bytes)
  if (sniffed?.ext === 'png') return { kind: 'png', bytes, type: sniffed.type, ext: sniffed.ext }
  return { error: 'type' }
}

async function deleteMediaKey(env: Env, publicPath: string) {
  const key = publicPath.replace(/^\/media\//, '')
  if (!key.startsWith('images/') || key.includes('..')) return
  try {
    await env.MEDIA.delete(key)
  } catch {
    /* old object may already be gone */
  }
}

export async function applyLogoAsset(
  env: Env,
  current: BrandSettings,
  slot: 'logo' | 'favicon',
  bytes: Uint8Array,
): Promise<{ brand: BrandSettings } | { error: string }> {
  const asset = readLogoAsset(bytes)
  if ('error' in asset) return { error: asset.error }
  const next = { ...current }
  if (asset.kind === 'svg') {
    if (slot === 'logo') {
      if (current.logoKey) await deleteMediaKey(env, current.logoKey)
      next.logoSvg = asset.svg
      next.logoKey = ''
    } else {
      if (current.faviconKey) await deleteMediaKey(env, current.faviconKey)
      next.faviconSvg = asset.svg
      next.faviconKey = ''
    }
  } else {
    const key = imageKey(asset.ext)
    await env.MEDIA.put(key, asset.bytes, { httpMetadata: { contentType: asset.type } })
    const path = `/media/${key}`
    if (slot === 'logo') {
      if (current.logoKey) await deleteMediaKey(env, current.logoKey)
      next.logoKey = path
      next.logoSvg = ''
    } else {
      if (current.faviconKey) await deleteMediaKey(env, current.faviconKey)
      next.faviconKey = path
      next.faviconSvg = ''
    }
  }
  const brand = parseBrand(next)
  await saveSettings(env.DB, 'brand', brand)
  return { brand }
}

export async function clearBrandSlot(env: Env, slot: 'logo' | 'favicon'): Promise<BrandSettings> {
  const current = (await loadConfig(env.DB)).brand
  const next = { ...current }
  if (slot === 'logo') {
    if (current.logoKey) await deleteMediaKey(env, current.logoKey)
    next.logoSvg = ''
    next.logoKey = ''
  } else {
    if (current.faviconKey) await deleteMediaKey(env, current.faviconKey)
    next.faviconSvg = ''
    next.faviconKey = ''
  }
  const brand = parseBrand(next)
  await saveSettings(env.DB, 'brand', brand)
  return brand
}

function matchesPresetCopy(value: string, field: 'description' | 'titleSuffix'): boolean {
  const text = value.trim()
  if (!text) return false
  return TEMPLATE_IDS.some((id) => PRESETS[id][field] === text)
}

function keptSiteMeta(meta: SiteConfig['meta']): SiteConfig['meta'] {
  return parseSiteMeta({
    ...meta,
    description: matchesPresetCopy(meta.description, 'description') ? '' : meta.description,
    titleSuffix: matchesPresetCopy(meta.titleSuffix, 'titleSuffix') ? '' : meta.titleSuffix,
  })
}

export async function applyVisualKit(env: Env, templateId: string, mark: string): Promise<SiteConfig> {
  const preset = presetById(templateId)
  if (!preset) throw new Error('Unknown template')
  const current = await loadConfig(env.DB)
  const chosen = mark.trim() || current.brand.mark.trim() || (env.SITE_NAME || 'Field Notes')
  const logoSvg = buildLogoSvg(preset, chosen)
  if (current.brand.logoKey) await deleteMediaKey(env, current.brand.logoKey)
  if (current.brand.faviconKey) await deleteMediaKey(env, current.brand.faviconKey)
  const template = parseTemplate({
    id: preset.id,
    accent: preset.accent,
    radius: preset.radius,
    font: preset.font,
  })
  const layout = parseLayout({
    width: preset.width,
    header: preset.header,
    home: preset.home,
    showAuthor: preset.showAuthor,
    showTags: preset.showTags,
    showShare: preset.showShare,
    showKicker: preset.showKicker,
  })
  const brand = parseBrand({
    mark: chosen,
    themeColor: preset.themeColor,
    logoSvg,
    logoKey: '',
    faviconSvg: logoSvg,
    faviconKey: '',
  })
  const meta = keptSiteMeta(current.meta)
  await saveSettings(env.DB, 'template', template)
  await saveSettings(env.DB, 'layout', layout)
  await saveSettings(env.DB, 'brand', brand)
  await saveSettings(env.DB, 'meta', meta)
  return { ...current, template, layout, brand, meta }
}
