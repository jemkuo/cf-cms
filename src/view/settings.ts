import { html } from 'hono/html'
import {
  ACCENTS,
  FONTS,
  HEADERS,
  HOMES,
  RADII,
  TWITTER_CARDS,
  WIDTHS,
  type Channel,
  type SiteConfig,
  type TagAdmin,
} from '../config'
import { HEAD_PRESETS } from '../head-meta.mjs'
import { hasLogo, logoHtml, markText } from '../kit'
import { LANG_META } from '../i18n'
import { NICHE_ORDER, presetById, presetsInNiche } from '../templates'
import { siteName } from '../site'
import type { Env } from '../types'
import { LANGS } from '../types'
import { adminPrefix } from '../safepath'
import { shell } from './layout'

type Base = { env: Env; nonce: string; settings: SiteConfig; channels: Channel[] }

function page(base: Base, title: string, active: string, body: ReturnType<typeof html>) {
  return shell({
    ...base,
    lang: 'en',
    title,
    description: 'CF CMS',
    path: adminPrefix(base.env) || '/admin',
    alternates: [],
    noindex: true,
    admin: true,
    activeAdmin: active,
    body,
  })
}

function banner(ok?: string, error?: string) {
  return html`${ok ? html`<p class="banner">${ok}</p>` : ''}${error ? html`<p class="banner error">${error}</p>` : ''}`
}

export function templateView(base: Base, ok?: string, error?: string) {
  const value = base.settings.template
  const current = presetById(value.id)
  return page(
    base,
    'Template',
    'template',
    html`<div class="wrap">
      <header class="page-head">
        <p class="kicker">Frontend</p>
        <h1>Template</h1>
        <p class="dek">Choosing another template applies its accent, type, and layout. Generate a visual kit when you also want a matching logo. The kit leaves the site description and title suffix alone, so each language keeps its own homepage line.</p>
      </header>
      ${banner(ok, error)}
      <form method="post" action="/admin/template" class="stack">
        <label><span class="lbl">Template</span>
          <select name="id">
            ${NICHE_ORDER.map(
              (niche) => html`<optgroup label="${presetsInNiche(niche)[0]?.nicheLabel || niche}">
                ${presetsInNiche(niche).map(
                  (preset) => html`<option value="${preset.id}" ${value.id === preset.id ? 'selected' : ''}>${preset.label}</option>`,
                )}
              </optgroup>`,
            )}
          </select>
        </label>
        ${current
          ? html`<p class="dek">${current.blurb} Visual reference only: ${current.reference}</p>`
          : ''}
        <label><span class="lbl">Accent</span>
          <select name="accent">${ACCENTS.map((id) => html`<option value="${id}" ${value.accent === id ? 'selected' : ''}>${id}</option>`)}</select>
        </label>
        <label><span class="lbl">Radius</span>
          <select name="radius">${RADII.map((id) => html`<option value="${id}" ${value.radius === id ? 'selected' : ''}>${id}</option>`)}</select>
        </label>
        <label><span class="lbl">Font</span>
          <select name="font">${FONTS.map((id) => html`<option value="${id}" ${value.font === id ? 'selected' : ''}>${id}</option>`)}</select>
        </label>
        <div class="form-actions">
          <button type="submit" name="intent" value="save">Save template</button>
          <button type="submit" name="intent" value="generate" class="ghost">Generate visual kit</button>
        </div>
      </form>
    </div>`,
  )
}

export function brandView(base: Base, ok?: string, error?: string) {
  const brand = base.settings.brand
  const mark = markText(brand, siteName(base.env))
  const preset = presetById(base.settings.template.id)
  return page(
    base,
    'Brand',
    'brand',
    html`<div class="wrap">
      <header class="page-head">
        <p class="kicker">Frontend</p>
        <h1>Brand</h1>
        <p class="dek">Logo, mark, favicon, and theme color. SVG is stored with the settings. PNG is stored in R2.</p>
      </header>
      ${banner(ok, error)}
      <div class="brand-preview" aria-label="Brand preview">
        <p class="lbl">Preview</p>
        <div class="brand-preview-row">
          ${hasLogo(brand) ? logoHtml(brand) : html`<span class="logo-fallback"></span>`}
          <span class="mark-text">${mark}</span>
          <span class="swatch" title="${brand.themeColor || 'Accent'}"></span>
        </div>
      </div>
      <form method="post" action="/admin/brand" enctype="multipart/form-data" class="stack">
        <label><span class="lbl">Site mark</span><input name="mark" value="${brand.mark}" placeholder="${siteName(base.env)}"></label>
        <label><span class="lbl">Theme color</span><input name="themeColor" value="${brand.themeColor}" placeholder="#1d4e89"></label>
        <label><span class="lbl">Logo SVG or PNG</span><input type="file" name="logo" accept=".svg,image/svg+xml,image/png,.png"></label>
        <label class="check"><input type="checkbox" name="clearLogo"><span>Remove the current logo</span></label>
        <label><span class="lbl">Favicon SVG or PNG</span><input type="file" name="favicon" accept=".svg,image/svg+xml,image/png,.png"></label>
        <label class="check"><input type="checkbox" name="clearFavicon"><span>Remove the current favicon</span></label>
        <button type="submit">Save brand</button>
      </form>
      <form method="post" action="/admin/brand/generate" class="stack">
        <p class="dek">Generate a logo and favicon for the active template${preset ? html` (${preset.label}, ${preset.nicheLabel})` : ''}. This applies that template’s layout and theme color. It does not replace a description or title suffix you already saved. Saving a new theme color recolors a generated kit logo.</p>
        <button type="submit">Generate visual kit</button>
      </form>
    </div>`,
  )
}

export function layoutView(base: Base, ok?: string, error?: string) {
  const value = base.settings.layout
  const check = (name: string, on: boolean, label: string) =>
    html`<label class="check"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span>${label}</span></label>`
  return page(
    base,
    'Layout',
    'layout',
    html`<div class="wrap">
      <header class="page-head"><p class="kicker">Frontend</p><h1>Layout</h1></header>
      ${banner(ok, error)}
      <form method="post" action="/admin/layout" class="stack">
        <label><span class="lbl">Width</span>
          <select name="width">${WIDTHS.map((id) => html`<option value="${id}" ${value.width === id ? 'selected' : ''}>${id}</option>`)}</select>
        </label>
        <label><span class="lbl">Header</span>
          <select name="header">${HEADERS.map((id) => html`<option value="${id}" ${value.header === id ? 'selected' : ''}>${id}</option>`)}</select>
        </label>
        <label><span class="lbl">Home</span>
          <select name="home">${HOMES.map((id) => html`<option value="${id}" ${value.home === id ? 'selected' : ''}>${id}</option>`)}</select>
        </label>
        ${check('showAuthor', value.showAuthor, 'Show author')}
        ${check('showTags', value.showTags, 'Show tags')}
        ${check('showShare', value.showShare, 'Show share actions and RSS')}
        ${check('showKicker', value.showKicker, 'Show the home kicker')}
        ${check('show_powered_by', value.show_powered_by, 'Show Powered by CF CMS in the public footer')}
        <button type="submit">Save layout</button>
      </form>
    </div>`,
  )
}

export function metaView(base: Base, ok?: string, error?: string) {
  const value = base.settings.meta
  return page(
    base,
    'Meta',
    'meta',
    html`<div class="wrap">
      <header class="page-head">
        <p class="kicker">Site</p>
        <h1>Metadata</h1>
        <p class="dek">Site title and the public URL still come from SITE_NAME and SITE_URL. These fields cover description, cards, and robots. Verification tags live under Head. Per-post meta is on each post.</p>
      </header>
      ${banner(ok, error)}
      <form method="post" action="/admin/meta" class="stack">
        <label><span class="lbl">Default description</span><textarea name="description" rows="3">${value.description}</textarea></label>
        <label><span class="lbl">Title suffix</span><input name="titleSuffix" value="${value.titleSuffix}"></label>
        <label><span class="lbl">Default Open Graph image</span><input name="ogImage" value="${value.ogImage}" placeholder="/og.png"></label>
        <label><span class="lbl">Twitter card</span>
          <select name="twitterCard">${TWITTER_CARDS.map((id) => html`<option value="${id}" ${value.twitterCard === id ? 'selected' : ''}>${id}</option>`)}</select>
        </label>
        <label><span class="lbl">Robots</span><input name="robots" value="${value.robots}"></label>
        <label class="check">
          <input type="checkbox" name="require_all_languages" ${base.settings.require_all_languages ? 'checked' : ''}>
          <span>Require all 5 languages (zh, en, ja, es, ar) before a post can be published</span>
        </label>
        <button type="submit">Save metadata</button>
      </form>
    </div>`,
  )
}

export function headView(base: Base, ok?: string, error?: string) {
  const head = base.settings.head_meta
  const presetValue = (key: string) => head.entries.find((entry) => entry.key === key)?.value || ''
  const custom = head.entries.filter((entry) => !HEAD_PRESETS.some((preset) => preset.key === entry.key))
  return page(
    base,
    'Head tags',
    'head',
    html`<div class="wrap">
      <header class="page-head">
        <p class="kicker">头部 Meta</p>
        <h1>Head tags</h1>
        <p class="dek">Verification and custom meta tags are added to the head of every public page. Admin screens stay clear of them. Built-in tags (charset, viewport, description, robots, canonical, og) are rejected.</p>
      </header>
      ${banner(ok, error)}
      <form method="post" action="/admin/head" class="stack">
        ${HEAD_PRESETS.map(
          (preset, index) => html`<label>
            <span class="lbl">${preset.label} · ${preset.key}${preset.attr === 'value' ? ' · value attribute' : ''}</span>
            <input name="preset_${index}" value="${presetValue(preset.key)}" autocomplete="off">
          </label>`,
        )}
        <h2>Custom tags</h2>
        ${[0, 1, 2, 3].map((index) => {
          const entry = custom[index]
          return html`<div class="form-grid">
            <label>
              <span class="lbl">Name</span>
              <input name="custom_key_${index}" value="${entry?.key || ''}" placeholder="name or property">
            </label>
            <label>
              <span class="lbl">Kind</span>
              <select name="custom_kind_${index}">
                <option value="name" ${entry?.kind === 'property' ? '' : 'selected'}>name</option>
                <option value="property" ${entry?.kind === 'property' ? 'selected' : ''}>property</option>
              </select>
            </label>
            <label>
              <span class="lbl">Attribute</span>
              <select name="custom_attr_${index}">
                <option value="content" ${entry?.attr === 'value' ? '' : 'selected'}>content</option>
                <option value="value" ${entry?.attr === 'value' ? 'selected' : ''}>value</option>
              </select>
            </label>
            <label>
              <span class="lbl">Value</span>
              <input name="custom_value_${index}" value="${entry?.value || ''}">
            </label>
          </div>`
        })}
        <label>
          <span class="lbl">Raw head snippet · meta and link tags only</span>
          <textarea name="head_raw" rows="5" placeholder="<meta name=&quot;example&quot; content=&quot;token&quot;>">${head.raw}</textarea>
        </label>
        <button type="submit">Save head tags</button>
      </form>
    </div>`,
  )
}

export function shareView(base: Base, ok?: string, error?: string) {
  const value = base.settings.share
  return page(
    base,
    'Share',
    'share',
    html`<div class="wrap">
      <header class="page-head">
        <p class="kicker">Links</p>
        <h1>Share links</h1>
        <p class="dek">X is a handle. The other fields are full https URLs. Empty fields stay hidden. SITE_X is used when the X handle here is empty.</p>
      </header>
      ${banner(ok, error)}
      <form method="post" action="/admin/share" class="stack">
        <label><span class="lbl">X handle</span><input name="x" value="${value.x}" placeholder="your_handle"></label>
        <label><span class="lbl">GitHub</span><input name="github" value="${value.github}" placeholder="https://github.com/jemkuo"></label>
        <label><span class="lbl">Mastodon</span><input name="mastodon" value="${value.mastodon}" placeholder="https://example.social/@site"></label>
        <label><span class="lbl">LinkedIn</span><input name="linkedin" value="${value.linkedin}"></label>
        <label><span class="lbl">Website</span><input name="website" value="${value.website}"></label>
        <label class="check"><input type="checkbox" name="showRss" ${value.showRss ? 'checked' : ''}><span>Show RSS</span></label>
        <button type="submit">Save share links</button>
      </form>
    </div>`,
  )
}

export function channelsView(base: Base, ok?: string, error?: string) {
  return page(
    base,
    'Channels',
    'channels',
    html`<div class="wrap">
      <header class="page-head"><p class="kicker">Sections</p><h1>Channels</h1></header>
      ${banner(ok, error)}
      ${base.channels.map((channel) => html`<form method="post" action="/admin/channels" class="stack card">
        <input type="hidden" name="slug" value="${channel.slug}">
        <p class="kicker">${channel.slug}</p>
        <label><span class="lbl">Order</span><input name="sortOrder" type="number" value="${String(channel.sortOrder)}"></label>
        <label class="check"><input type="checkbox" name="visible" ${channel.visible ? 'checked' : ''}><span>Visible</span></label>
        ${LANGS.map((lang) => html`<label>
          <span class="lbl">${LANG_META[lang].label}</span>
          <input name="name_${lang}" value="${channel.names[lang] || ''}" dir="${LANG_META[lang].dir}">
        </label>
        <label>
          <span class="lbl">${LANG_META[lang].label} description</span>
          <input name="description_${lang}" value="${channel.descriptions[lang] || ''}" dir="${LANG_META[lang].dir}">
        </label>`)}
        <button type="submit">Save ${channel.slug}</button>
      </form>
      <form method="post" action="/admin/channels/delete" data-confirm="Delete this channel?">
        <input type="hidden" name="slug" value="${channel.slug}">
        <button class="ghost danger" type="submit">Delete</button>
      </form>`)}
      <form method="post" action="/admin/channels" class="stack">
        <h2>New channel</h2>
        <input type="hidden" name="visible" value="on">
        <label><span class="lbl">Slug</span><input name="slug" required placeholder="field-notes"></label>
        <label><span class="lbl">English name</span><input name="name_en" required></label>
        <label><span class="lbl">中文</span><input name="name_zh"></label>
        <button type="submit">Add channel</button>
      </form>
    </div>`,
  )
}

export function tagsView(base: Base, tags: TagAdmin[], ok?: string, error?: string) {
  return page(
    base,
    'Tags',
    'tags',
    html`<div class="wrap">
      <header class="page-head"><p class="kicker">Taxonomy</p><h1>Tags</h1></header>
      ${banner(ok, error)}
      ${tags.length === 0 ? html`<div class="empty"><h2>No tags yet</h2><p>Tags appear when a post uses them, or you can add one here.</p></div>` : ''}
      ${tags.map((tag) => html`<form method="post" action="/admin/tags" class="stack card">
        <input type="hidden" name="slug" value="${tag.slug}">
        <p class="kicker">${tag.slug} · ${String(tag.count)}</p>
        ${LANGS.map((lang) => html`<label>
          <span class="lbl">${LANG_META[lang].label}</span>
          <input name="name_${lang}" value="${tag.names[lang] || ''}" dir="${LANG_META[lang].dir}">
        </label>`)}
        <button type="submit">Save ${tag.slug}</button>
      </form>
      <form method="post" action="/admin/tags/delete" data-confirm="Delete this tag from every post?">
        <input type="hidden" name="slug" value="${tag.slug}">
        <button class="ghost danger" type="submit">Delete</button>
      </form>`)}
      <form method="post" action="/admin/tags" class="stack">
        <h2>New tag</h2>
        <label><span class="lbl">Slug</span><input name="slug" required placeholder="workers"></label>
        <label><span class="lbl">English name</span><input name="name_en"></label>
        <label><span class="lbl">中文</span><input name="name_zh"></label>
        <button type="submit">Add tag</button>
      </form>
    </div>`,
  )
}
