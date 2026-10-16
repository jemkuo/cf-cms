import { Marked, Renderer, type Tokens } from 'marked'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sanitizeUrl(href: string): string {
  const trimmed = href.trim()
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\')) return trimmed
  try {
    const url = new URL(trimmed)
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href
  } catch {
    return ''
  }
  return ''
}

export function statusId(raw: string): string | null {
  const trimmed = raw.trim()
  if (/^\d{1,22}$/.test(trimmed)) return trimmed
  try {
    const url = new URL(trimmed)
    const host = url.hostname.replace(/^www\./, '')
    if (host !== 'x.com' && host !== 'twitter.com' && host !== 'mobile.twitter.com' && host !== 'mobile.x.com') {
      return null
    }
    const match = url.pathname.match(/\/status(?:es)?\/(\d{1,22})/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

function headingId(text: string, used: Map<string, number>): string {
  const base = text
    .replace(/<[^>]+>/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-|-$/g, '')
  const seed = base || 'section'
  const count = used.get(seed) ?? 0
  used.set(seed, count + 1)
  return count === 0 ? seed : `${seed}-${count + 1}`
}

function xFigure(id: string, label: string): string {
  const href = `https://x.com/i/status/${id}`
  return `<figure class="x-embed" dir="ltr"><blockquote class="twitter-tweet" data-dnt="true"><p><a href="${href}">${escapeHtml(label)}</a></p></blockquote></figure>`
}

export function renderMarkdown(source: string, xLabel: string): { html: string; hasXEmbed: boolean } {
  const embeds: string[] = []
  const withTokens = source.replace(/\{\{x:\s*([^}]+?)\s*\}\}/g, (_match, raw: string) => {
    const id = statusId(String(raw))
    if (!id) return ''
    const token = `XEMBED${embeds.length}END`
    embeds.push(xFigure(id, xLabel))
    return `\n\n${token}\n\n`
  })

  const used = new Map<string, number>()
  const renderer = new Renderer()
  renderer.heading = function heading(token: Tokens.Heading) {
    const inner = this.parser.parseInline(token.tokens)
    const id = headingId(inner, used)
    return `<h${token.depth} id="${id}">${inner}</h${token.depth}>\n`
  }
  renderer.html = () => ''
  renderer.code = function code({ text, lang, escaped }: Tokens.Code) {
    const language = (lang || '').match(/^[\w+-]+/)?.[0] ?? ''
    const cls = language ? ` class="language-${escapeHtml(language)}"` : ''
    const body = escaped ? text : escapeHtml(text)
    return `<pre class="code"><code${cls}>${body}</code></pre>\n`
  }
  renderer.link = function link(token: Tokens.Link) {
    const href = sanitizeUrl(token.href)
    const inner = this.parser.parseInline(token.tokens)
    if (!href) return inner
    const external = href.startsWith('http')
    const rel = external ? ' rel="noopener noreferrer" target="_blank"' : ''
    return `<a href="${escapeHtml(href)}"${rel}>${inner}</a>`
  }
  renderer.image = function image(token: Tokens.Image) {
    const href = sanitizeUrl(token.href)
    if (!href) return escapeHtml(token.text)
    const title = token.title ? ` title="${escapeHtml(token.title)}"` : ''
    return `<img src="${escapeHtml(href)}" alt="${escapeHtml(token.text)}"${title} loading="lazy" decoding="async">`
  }

  const marked = new Marked({ gfm: true, renderer })
  const parsed = marked.parse(withTokens, { async: false }) as string
  const html = parsed
    .replace(/<p>\s*XEMBED(\d+)END\s*<\/p>/g, (_m, index: string) => embeds[Number(index)] ?? '')
    .replace(/XEMBED(\d+)END/g, (_m, index: string) => embeds[Number(index)] ?? '')
  return { html, hasXEmbed: embeds.length > 0 }
}
