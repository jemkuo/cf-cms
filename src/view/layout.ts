import { html, raw } from 'hono/html'
import type { SiteConfig } from '../config'
import { poweredByMarkup } from '../footer-credit.mjs'
import { COPY, LANG_META } from '../i18n'
import { brandStyle, hasLogo, iconHref, logoHtml, markText } from '../kit'
import { siteName } from '../site'
import type { Env, Lang } from '../types'
import { LANGS } from '../types'
import { socialImage, xmlEscape } from '../text'

export type Alternate = { lang: Lang; path: string }

export type Shell = {
  env: Env
  nonce: string
  lang: Lang
  title: string
  description: string
  path: string
  alternates: Alternate[]
  type?: 'website' | 'article'
  imageKey?: string | null
  noindex?: boolean
  jsonLd?: unknown[]
  published?: string | null
  modified?: string | null
  tags?: string[]
  hasXEmbed?: boolean
  active?: 'writing' | 'about'
  admin?: boolean
  adminNav?: boolean
  activeAdmin?: string
  settings: SiteConfig
  pager?: { prev?: string; next?: string }
  body: ReturnType<typeof html>
}

function abs(origin: string, path: string): string {
  return new URL(path, origin).href
}

function styleHref(settings: SiteConfig): string {
  const brand = settings.brand.themeColor.replace('#', '') || 'accent'
  const token = [
    '5',
    settings.template.id,
    settings.template.font,
    settings.template.accent,
    settings.template.radius,
    settings.layout.width,
    settings.layout.header,
    settings.layout.home,
    brand,
  ].join('.')
  return `/styles.css?v=${token}`
}

export function shell(input: Shell) {
  const meta = LANG_META[input.lang]
  const ui = COPY[input.lang]
  const origin = (input.env.SITE_URL || 'https://example.com').replace(/\/$/, '')
  const name = siteName(input.env)
  const visibleMark = markText(input.settings.brand, name)
  const brandColor = /^#[0-9a-fA-F]{6}$/.test(input.settings.brand.themeColor)
  const handle = (input.settings.share.x || input.env.SITE_X || '').replace(/^@/, '')
  const description = input.settings.meta.description || input.description || ui.description
  const canonical = abs(origin, input.path)
  const image = socialImage(origin, input.imageKey || input.settings.meta.ogImage || null)
  const imageIsDefault = image.endsWith('/og.png')
  const suffix = input.settings.meta.titleSuffix
  const fullTitle = input.title === name ? (suffix ? `${name} · ${suffix}` : name) : `${input.title} · ${name}`
  const fullDescription = description
  const xEmbed = input.hasXEmbed
    ? html`<script async nonce="${input.nonce}" src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>`
    : ''
  const json = (input.jsonLd ?? []).map((entry) => {
    const payload = JSON.stringify(entry).replace(/</g, '\\u003c')
    return raw(`<script type="application/ld+json" nonce="${input.nonce}">${payload}</script>`)
  })
  return html`<!DOCTYPE html>
<html lang="${meta.htmlLang}" dir="${meta.dir}" data-template="${input.settings.template.id}" data-accent="${input.settings.template.accent}" data-radius="${input.settings.template.radius}" data-font="${input.settings.template.font}" data-width="${input.settings.layout.width}" data-header="${input.settings.layout.header}" data-home="${input.settings.layout.home}"${brandColor ? raw(' data-brand-color="1"') : ''}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${fullTitle}</title>
  <meta name="description" content="${fullDescription}">
  <link rel="canonical" href="${canonical}">
  <link rel="icon" href="${iconHref(input.settings.brand)}" type="${iconHref(input.settings.brand).endsWith('.png') ? 'image/png' : 'image/svg+xml'}">
  <link rel="alternate" type="text/plain" href="${origin}/llms.txt" title="llms.txt">
  ${!input.admin && input.settings.layout.showShare && input.settings.share.showRss
    ? html`<link rel="alternate" type="application/rss+xml" title="${name}" href="${origin}/${input.lang}/rss.xml">`
    : ''}
  ${input.alternates.map((item) => {
    const alt = LANG_META[item.lang]
    return html`<link rel="alternate" hreflang="${alt.hreflang}" href="${abs(origin, item.path)}">`
  })}
  ${input.alternates.some((item) => item.lang === 'zh')
    ? html`<link rel="alternate" hreflang="x-default" href="${abs(origin, input.alternates.find((item) => item.lang === 'zh')!.path)}">`
    : ''}
  <meta name="robots" content="${input.noindex ? 'noindex, nofollow' : input.settings.meta.robots}">
  <meta property="og:site_name" content="${name}">
  <meta property="og:type" content="${input.type === 'article' ? 'article' : 'website'}">
  <meta property="og:title" content="${input.title}">
  <meta property="og:description" content="${fullDescription}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:locale" content="${meta.ogLocale}">
  ${input.alternates
    .filter((item) => item.lang !== input.lang)
    .map((item) => html`<meta property="og:locale:alternate" content="${LANG_META[item.lang].ogLocale}">`)}
  <meta property="og:image" content="${image}">
  ${imageIsDefault
    ? html`<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`
    : ''}
  <meta name="twitter:card" content="${input.settings.meta.twitterCard}">
  ${handle ? html`<meta name="twitter:site" content="@${handle}">` : ''}
  <meta name="twitter:title" content="${input.title}">
  <meta name="twitter:description" content="${fullDescription}">
  <meta name="twitter:image" content="${image}">
  ${input.published ? html`<meta property="article:published_time" content="${input.published}">` : ''}
  ${input.modified ? html`<meta property="article:modified_time" content="${input.modified}">` : ''}
  ${(input.tags ?? []).map((tag) => html`<meta property="article:tag" content="${tag}">`)}
  ${input.pager?.prev ? html`<link rel="prev" href="${abs(origin, input.pager.prev)}">` : ''}
  ${input.pager?.next ? html`<link rel="next" href="${abs(origin, input.pager.next)}">` : ''}
  ${brandColor
    ? html`<meta name="theme-color" content="${input.settings.brand.themeColor}">`
    : html`<meta name="theme-color" content="#f3efe4" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#12110f" media="(prefers-color-scheme: dark)">`}
  ${brandStyle(input.settings.brand, input.nonce)}
  <script nonce="${input.nonce}">(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
  <link rel="stylesheet" href="${styleHref(input.settings)}">
  ${json}
</head>
<body>
  <a class="skip" href="#main">${ui.skip}</a>
  ${input.admin ? adminHeader(input, visibleMark) : publicHeader(input, ui, visibleMark)}
  <main id="main">
    ${input.body}
  </main>
  ${input.admin ? '' : footer(input, ui, origin, handle)}
  ${xEmbed}
  <script nonce="${input.nonce}" src="/site.js"></script>
</body>
</html>`
}

function publicHeader(input: Shell, ui: (typeof COPY)[Lang], visibleMark: string) {
  const lang = input.lang
  return html`<header class="site-header">
    <div class="wrap header-row">
      <a class="wordmark${hasLogo(input.settings.brand) ? ' has-logo' : ''}" href="/${lang}/">${logoHtml(input.settings.brand)}<span class="mark-text">${visibleMark}</span></a>
      <div class="header-actions">
        <nav class="nav-wide" aria-label="${ui.writing}">
          <a href="/${lang}/" aria-current="${input.active === 'writing' ? 'page' : 'false'}">${ui.writing}</a>
          <a href="/${lang}/about" aria-current="${input.active === 'about' ? 'page' : 'false'}">${ui.about}</a>
        </nav>
        ${langSwitch(input)}
        <button type="button" class="ghost theme-btn" data-theme-toggle aria-pressed="false">${ui.theme}</button>
        <details class="nav-small">
          <summary>${ui.menu}</summary>
          <div class="nav-small-panel">
            <a href="/${lang}/">${ui.writing}</a>
            <a href="/${lang}/about">${ui.about}</a>
          </div>
        </details>
      </div>
    </div>
  </header>`
}

const ADMIN_LINKS = [
  ['/admin', 'Posts', 'posts'],
  ['/admin/posts/new', 'New', 'new'],
  ['/admin/media', 'Media', 'media'],
  ['/admin/template', 'Template', 'template'],
  ['/admin/brand', 'Brand', 'brand'],
  ['/admin/layout', 'Layout', 'layout'],
  ['/admin/channels', 'Channels', 'channels'],
  ['/admin/meta', 'Meta', 'meta'],
  ['/admin/tags', 'Tags', 'tags'],
  ['/admin/share', 'Share', 'share'],
] as const

function adminHeader(input: Shell, visibleMark: string) {
  return html`<header class="site-header">
    <div class="wrap header-row">
      <a class="wordmark${hasLogo(input.settings.brand) ? ' has-logo' : ''}" href="/admin">${logoHtml(input.settings.brand)}<span class="mark-text">${visibleMark}</span><span class="admin-mark">CF CMS</span></a>
      <div class="header-actions">
        <a href="/zh/">View site</a>
        <button type="button" class="ghost theme-btn" data-theme-toggle aria-pressed="false">Theme</button>
        <form method="post" action="/admin/logout">
          <button class="ghost" type="submit">Log out</button>
        </form>
      </div>
    </div>
    ${input.adminNav === false
      ? ''
      : html`<nav class="admin-sub wrap" aria-label="CF CMS">
          ${ADMIN_LINKS.map(
            ([href, label, key]) =>
              html`<a href="${href}" aria-current="${input.activeAdmin === key ? 'page' : 'false'}">${label}</a>`,
          )}
        </nav>`}
  </header>`
}

function langSwitch(input: Shell) {
  const ui = COPY[input.lang]
  return html`<nav class="langs" aria-label="${ui.langNames[input.lang]}">
    ${LANGS.map((code) => {
      const alt = input.alternates.find((item) => item.lang === code)
      const href = alt?.path ?? `/${code}/`
      const current = code === input.lang
      return html`<a href="${href}" hreflang="${LANG_META[code].hreflang}" lang="${LANG_META[code].htmlLang}"${current ? html` aria-current="page"` : ''}>${LANG_META[code].short}</a>`
    })}
  </nav>`
}

function footer(input: Shell, ui: (typeof COPY)[Lang], origin: string, handle: string) {
  const year = new Date().getUTCFullYear()
  const name = siteName(input.env)
  const share = input.settings.share
  return html`<footer class="site-footer">
    <div class="wrap footer-row">
      <p>${ui.footer}</p>
      <nav aria-label="${name}">
        ${input.settings.layout.showShare && share.showRss ? html`<a href="/${input.lang}/rss.xml">${ui.rss}</a>` : ''}
        <a href="${origin}/llms.txt">llms.txt</a>
        <a href="${origin}/llms-full.txt">llms-full.txt</a>
        <a href="${origin}/sitemap.xml">sitemap</a>
        ${handle ? html`<a rel="me" href="https://x.com/${xmlEscape(handle)}">@${handle}</a>` : ''}
        ${share.github ? html`<a rel="me" href="${share.github}">GitHub</a>` : ''}
        ${share.mastodon ? html`<a rel="me" href="${share.mastodon}">Mastodon</a>` : ''}
        ${share.linkedin ? html`<a rel="me" href="${share.linkedin}">LinkedIn</a>` : ''}
        ${share.website ? html`<a rel="me" href="${share.website}">Site</a>` : ''}
      </nav>
      <p class="copy">© ${year} ${name}</p>
      ${input.settings.layout.show_powered_by ? raw(poweredByMarkup()) : ''}
    </div>
  </footer>`
}
