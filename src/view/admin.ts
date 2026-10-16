import { html } from 'hono/html'
import type { Channel, SiteConfig } from '../config'
import { type ParsedPost } from '../form'
import { LANG_META, formatDate } from '../i18n'
import type { AdminListItem, AdminPost, Env, Lang } from '../types'
import { LANGS } from '../types'
import { adminPrefix } from '../safepath'
import { coverPublicPath, formatTagInput } from '../text'
import { shell } from './layout'

const ERRORS: Record<string, string> = {
  slug: 'The slug may use only lowercase letters, numbers, and hyphens.',
  source: 'The source language needs a title and a body.',
  cover: 'A cover must be a /covers/ path or an uploaded /media/images/ path.',
  author: 'Use the site name.',
  body: 'The body is longer than 80,000 characters.',
  auth: 'That password is wrong.',
  config: 'Set ADMIN_PASSWORD and a SESSION_SECRET of at least 16 characters. Locally they live in .dev.vars. In production use wrangler pages secret put.',
  upload: 'No image was received.',
  size: 'Images must be smaller than 5MB.',
  type: 'Only JPEG, PNG, GIF, WebP, and AVIF are accepted.',
  missing: 'That post does not exist.',
  'source-empty': 'The source body is empty, so it cannot be translated yet.',
}

const OKS: Record<string, string> = {
  saved: 'Saved.',
  translated: 'Translation finished. Unpublished placeholders stay off the public site.',
  uploaded: 'Image uploaded.',
}

type Base = { env: Env; nonce: string; settings: SiteConfig; channels: Channel[] }

function adminShell(base: Base, title: string, active: string, body: ReturnType<typeof html>, nav = true) {
  return shell({
    ...base,
    lang: 'en',
    title,
    description: 'CF CMS',
    path: adminPrefix(base.env) || '/admin',
    alternates: [],
    noindex: true,
    admin: true,
    adminNav: nav,
    activeAdmin: active,
    body,
  })
}

export function loginView(base: Base, next: string, error?: string) {
  return adminShell(
    base,
    'Sign in',
    'posts',
    html`<div class="wrap login">
      <h1>Sign in</h1>
      <p class="dek">CF CMS. Public pages are open. Writing needs this password, or Cloudflare Access.</p>
      ${error ? html`<p class="banner error">${ERRORS[error] || error}</p>` : ''}
      <form method="post" action="/admin/login" class="stack">
        <input type="hidden" name="next" value="${next}">
        <label>
          <span class="lbl">Password</span>
          <input name="password" type="password" autocomplete="current-password" required>
        </label>
        <button type="submit">Enter</button>
      </form>
    </div>`,
    false,
  )
}

export function listView(base: Base, posts: AdminListItem[], message?: string) {
  return adminShell(
    base,
    'Posts',
    'posts',
    html`<div class="wrap">
      <header class="page-head row-head">
        <div>
          <p class="kicker">CMS</p>
          <h1>Posts</h1>
        </div>
        <a class="button" href="/admin/posts/new">New</a>
      </header>
      ${message ? html`<p class="banner">${OKS[message] || message}</p>` : ''}
      ${posts.length === 0
        ? html`<div class="empty"><h2>No posts yet</h2><p>Write one. Publishing can translate it into the other four languages.</p></div>`
        : html`<div class="table-wrap">
            <table class="admin-table">
              <thead>
                <tr><th>Title</th><th>Status</th><th>Languages</th><th>Updated</th></tr>
              </thead>
              <tbody>
                ${posts.map((post) => html`<tr>
                  <td><a href="/admin/posts/${post.id}">${post.title}</a><div class="muted">${post.slug}</div></td>
                  <td>${post.status === 'published' ? 'Published' : 'Draft'}</td>
                  <td>${LANGS.map((lang) => {
                    const found = post.langs.find((item) => item.lang === lang)
                    const cls = !found ? 'badge' : found.ready ? 'badge ok' : 'badge warn'
                    return html`<span class="${cls}">${LANG_META[lang].short}</span>`
                  })}</td>
                  <td><time datetime="${post.updatedAt}">${formatDate(post.updatedAt, 'en')}</time></td>
                </tr>`)}
              </tbody>
            </table>
          </div>`}
    </div>`,
  )
}

type EditorInput = {
  post: AdminPost | null
  draft?: ParsedPost
  error?: string
  ok?: string
  defaults: { author: string; handle: string }
}

export function editorView(base: Base, input: EditorInput) {
  const post = input.post
  const value = input.draft
  const sourceLang = value?.sourceLang || post?.sourceLang || 'zh'
  const title = post ? 'Edit post' : 'New post'
  const meta = value?.meta || post?.meta
  const channels = [...base.channels]
  const currentChannel = value?.category || post?.category || 'notes'
  if (currentChannel && !channels.some((item) => item.slug === currentChannel)) {
    channels.push({ slug: currentChannel, sortOrder: 99, visible: true, names: {}, descriptions: {} })
  }
  return adminShell(
    base,
    title,
    post ? 'posts' : 'new',
    html`<div class="wrap editor">
      <header class="page-head">
        <p class="kicker">${post ? post.slug : 'New post'}</p>
        <h1>${title}</h1>
      </header>
      ${input.error ? html`<p class="banner error">${ERRORS[input.error] || input.error}</p>` : ''}
      ${input.ok ? html`<p class="banner">${OKS[input.ok] || input.ok}</p>` : ''}
      ${post?.translateNote ? html`<p class="banner">${post.translateNote}</p>` : ''}
      ${post
        ? html`<form class="upload-row" data-upload action="/admin/media" method="post" enctype="multipart/form-data">
            <input type="hidden" name="next" value="/admin/posts/${post.id}">
            <label>
              <span class="lbl">Upload to R2</span>
              <input type="file" name="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif" required>
            </label>
            <button class="ghost" type="submit">Upload</button>
            <p class="muted" data-upload-result hidden></p>
          </form>`
        : html`<p class="muted">Save a draft before uploading. The library is at <a href="/admin/media">/admin/media</a>.</p>`}
      <form method="post" action="${post ? `/admin/posts/${post.id}` : '/admin/posts'}" class="stack">
        <div class="form-grid">
          <label>
            <span class="lbl">Slug</span>
            <input name="slug" required value="${value?.slug || post?.slug || ''}" placeholder="small-models">
          </label>
          <label>
            <span class="lbl">Status</span>
            <select name="status">
              ${['draft', 'published'].map((status) => {
                const current = value?.status || post?.status || 'draft'
                return html`<option value="${status}" ${current === status ? 'selected' : ''}>${status === 'published' ? 'Published' : 'Draft'}</option>`
              })}
            </select>
          </label>
          <label>
            <span class="lbl">Channel</span>
            <select name="category">
              ${channels.map((channel) => html`<option value="${channel.slug}" ${currentChannel === channel.slug ? 'selected' : ''}>${channel.names.en || channel.slug}</option>`)}
            </select>
          </label>
          <label>
            <span class="lbl">Source language</span>
            <select name="source_lang">
              ${LANGS.map((lang) => html`<option value="${lang}" ${sourceLang === lang ? 'selected' : ''}>${LANG_META[lang].label}</option>`)}
            </select>
          </label>
          <label>
            <span class="lbl">Author</span>
            <input name="author_name" required value="${value?.authorName || post?.authorName || input.defaults.author}">
          </label>
          <label>
            <span class="lbl">Author X handle</span>
            <input name="author_x" value="${value?.authorX || post?.authorX || input.defaults.handle}" placeholder="handle">
          </label>
          <label class="span-2">
            <span class="lbl">Tags · slug or slug|name, comma separated</span>
            <input name="tags" value="${value ? value.tags.map((tag) => (tag.name ? `${tag.slug}|${tag.name}` : tag.slug)).join(', ') : formatTagInput(post?.tags || [], sourceLang)}">
          </label>
          <label class="span-2">
            <span class="lbl">Cover</span>
            <input name="cover_key" value="${coverValue(value?.coverKey ?? post?.coverKey ?? null)}" placeholder="/media/images/2026/10/….png">
          </label>
        </div>
        <fieldset class="stack">
          <legend>Per-post meta</legend>
          <label class="check">
            <input type="checkbox" name="meta_noindex" ${meta?.noindex ? 'checked' : ''}>
            <span>noindex this post</span>
          </label>
          <label>
            <span class="lbl">Canonical URL</span>
            <input name="meta_canonical" value="${meta?.canonical || ''}" placeholder="https://example.com/en/posts/slug">
          </label>
          <label>
            <span class="lbl">Keywords</span>
            <input name="meta_keywords" value="${meta?.keywords || ''}" placeholder="edge, workers">
          </label>
          <label>
            <span class="lbl">Open Graph image</span>
            <input name="meta_og" value="${meta?.ogImage || ''}" placeholder="/og.png or /media/images/…">
          </label>
        </fieldset>
        ${LANGS.map((lang) => languageFields(lang, sourceLang, post, value))}
        <label class="check">
          <input type="checkbox" name="auto_translate" checked>
          <span>On save, ask Workers AI to fill languages that have no body yet</span>
        </label>
        <div class="form-actions">
          <button type="submit">Save</button>
          ${post ? html`<a class="button ghost" href="/admin/preview/${post.id}/${sourceLang}">Preview source</a>` : ''}
        </div>
      </form>
      ${post
        ? html`<form method="post" action="/admin/posts/${post.id}/translate" class="inline-form">
            <input type="hidden" name="mode" value="unlocked">
            <button class="ghost" type="submit">Retranslate unlocked languages</button>
          </form>
          <form method="post" action="/admin/posts/${post.id}/delete" data-confirm="Delete this post? This cannot be undone.">
            <button class="ghost danger" type="submit">Delete</button>
          </form>`
        : ''}
      <aside class="help">
        <p>Image: <code>![alt](/media/images/…)</code></p>
        <p>X post: <code>{{x:https://x.com/user/status/123}}</code></p>
        <p>Locked languages are not overwritten. If AI is unavailable, an unpublished placeholder is stored until you edit it and mark it public.</p>
      </aside>
    </div>`,
  )
}

function coverValue(key: string | null): string {
  if (!key) return ''
  return coverPublicPath(key) || ''
}

function languageFields(lang: Lang, sourceLang: Lang, post: AdminPost | null, draft?: ParsedPost) {
  const meta = LANG_META[lang]
  const fromPost = post?.translations.find((item) => item.lang === lang)
  const fromDraft = draft?.translations[lang]
  const title = fromDraft?.title ?? fromPost?.title ?? ''
  const description = fromDraft?.description ?? fromPost?.description ?? ''
  const summary = fromDraft?.summary ?? fromPost?.summary ?? ''
  const body = fromDraft?.body ?? fromPost?.body ?? ''
  const share = fromDraft?.shareText ?? fromPost?.shareText ?? ''
  const faq = fromDraft?.faq ?? fromPost?.faq ?? []
  const ready = fromDraft ? fromDraft.ready : fromPost ? fromPost.ready : true
  const locked = fromDraft ? fromDraft.locked : lang === sourceLang || Boolean(fromPost?.locked)
  const engine = fromPost?.engine
  const open = lang === sourceLang || Boolean(body)
  return html`<details class="lang-block" ${open ? 'open' : ''}>
    <summary>
      <span lang="${meta.htmlLang}">${meta.label}</span>
      ${lang === sourceLang ? html`<span class="badge">Source</span>` : ''}
      ${engine === 'workers-ai' ? html`<span class="badge ok">Workers AI</span>` : ''}
      ${engine === 'fallback' ? html`<span class="badge warn">Untranslated</span>` : ''}
      ${engine === 'human' && lang !== sourceLang ? html`<span class="badge ok">Edited</span>` : ''}
    </summary>
    <div class="stack">
      <label>
        <span class="lbl">Title</span>
        <input name="title_${lang}" value="${title}" dir="${meta.dir}" lang="${meta.htmlLang}">
      </label>
      <label>
        <span class="lbl">Description · meta and lists</span>
        <textarea name="description_${lang}" rows="2" dir="${meta.dir}" lang="${meta.htmlLang}">${description}</textarea>
      </label>
      <label>
        <span class="lbl">Summary · the semantic lead</span>
        <textarea name="summary_${lang}" rows="2" dir="${meta.dir}" lang="${meta.htmlLang}">${summary}</textarea>
      </label>
      <label>
        <span class="lbl">Markdown body</span>
        <textarea class="body" name="body_${lang}" dir="${meta.dir}" lang="${meta.htmlLang}" ${lang === sourceLang ? html`data-source-body` : ''}>${body}</textarea>
      </label>
      <label>
        <span class="lbl">Share text for X</span>
        <input name="share_${lang}" value="${share}" dir="${meta.dir}" lang="${meta.htmlLang}">
      </label>
      <div class="faq-grid">
        ${[0, 1, 2].map((index) => html`<label>
            <span class="lbl">Question ${index + 1}</span>
            <input name="faq_${lang}_${index}_q" value="${faq[index]?.q || ''}" dir="${meta.dir}">
          </label>
          <label>
            <span class="lbl">Answer ${index + 1}</span>
            <textarea name="faq_${lang}_${index}_a" rows="2" dir="${meta.dir}">${faq[index]?.a || ''}</textarea>
          </label>`)}
      </div>
      <div class="checks">
        <label class="check"><input type="checkbox" name="ready_${lang}" ${ready ? 'checked' : ''}><span>Public in this language</span></label>
        <label class="check"><input type="checkbox" name="locked_${lang}" ${locked ? 'checked' : ''}><span>Lock against automatic translation</span></label>
      </div>
    </div>
  </details>`
}

export function mediaView(
  base: Base,
  objects: { key: string; uploaded: string }[],
  message?: string,
  error?: string,
) {
  return adminShell(
    base,
    'Media',
    'media',
    html`<div class="wrap">
      <header class="page-head">
        <p class="kicker">R2</p>
        <h1>Media</h1>
      </header>
      ${message ? html`<p class="banner">Uploaded. Markdown: <code>![alt](${message})</code></p>` : ''}
      ${error ? html`<p class="banner error">${ERRORS[error] || error}</p>` : ''}
      <form class="stack" action="/admin/media" method="post" enctype="multipart/form-data">
        <input type="hidden" name="next" value="/admin/media">
        <label>
          <span class="lbl">Image</span>
          <input type="file" name="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif" required>
        </label>
        <button type="submit">Upload to R2</button>
      </form>
      ${objects.length === 0
        ? html`<div class="empty"><h2>The bucket is empty</h2><p>Uploaded images show up here.</p></div>`
        : html`<ul class="media-list">
            ${objects.map((item) => html`<li>
              <img src="/media/${item.key}" alt="">
              <div>
                <code>![alt](/media/${item.key})</code>
                <form method="post" action="/admin/media/delete" data-confirm="Delete this image?">
                  <input type="hidden" name="key" value="${item.key}">
                  <button class="ghost danger" type="submit">Delete</button>
                </form>
              </div>
            </li>`)}
          </ul>`}
    </div>`,
  )
}
