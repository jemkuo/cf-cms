import { html, raw } from 'hono/html'
import { channelLabel, type Channel, type SiteConfig } from '../config'
import { COPY, LANG_META, formatDate } from '../i18n'
import { originOf, siteHandle, siteName } from '../site'
import type { Article, Env, Lang, PostCard } from '../types'
import { PAGE_SIZE } from '../db'
import { coverPublicPath, socialImage } from '../text'
import { shell, type Alternate } from './layout'

type Base = {
  env: Env
  nonce: string
  lang: Lang
  settings: SiteConfig
  channels: Channel[]
}

function cat(base: Base, slug: string): string {
  return channelLabel(base.channels, slug, base.lang)
}

function alternates(lang: Lang, pathFor: (code: Lang) => string | null): Alternate[] {
  const items: Alternate[] = []
  for (const code of ['zh', 'en', 'ja', 'es', 'ar'] as const) {
    const path = pathFor(code)
    if (path) items.push({ lang: code, path })
  }
  if (!items.some((item) => item.lang === lang) && pathFor(lang)) {
    items.push({ lang, path: pathFor(lang)! })
  }
  return items
}

function samePath(path: string): Alternate[] {
  return (['zh', 'en', 'ja', 'es', 'ar'] as const).map((code) => ({
    lang: code,
    path: path.replace(/^\/(zh|en|ja|es|ar)(?=\/|$)/, `/${code}`),
  }))
}

export function homeView(
  base: Base,
  posts: PostCard[],
  page: number,
  pages: number,
  tags: { slug: string; name: string }[],
) {
  const ui = COPY[base.lang]
  const path = page <= 1 ? `/${base.lang}/` : `/${base.lang}/?page=${page}`
  return shell({
    ...base,
    title: ui.tagline,
    description: base.settings.meta.description || ui.description,
    path,
    alternates: samePath(`/${base.lang}/`),
    active: 'writing',
    pager: pagerLinks(`/${base.lang}/`, page, pages),
    body: html`<div class="wrap">
      <header class="masthead">
        ${base.settings.layout.showKicker ? html`<p class="kicker">${ui.kicker}</p>` : ''}
        <h1>${ui.tagline}</h1>
        <p class="dek">${base.settings.meta.description || ui.description}</p>
      </header>
      ${base.settings.layout.showTags && tags.length
        ? html`<nav class="tag-row" aria-label="${ui.tagsLabel}">
            ${tags.map((tag) => html`<a href="/${base.lang}/tags/${tag.slug}">${tag.name}</a>`)}
          </nav>`
        : ''}
      ${posts.length ? postList(base, posts, page) : empty(base.lang)}
      ${pagerNav(base.lang, `/${base.lang}/`, page, pages)}
    </div>`,
  })
}

export function filteredView(
  base: Base,
  kind: 'tag' | 'topic',
  slug: string,
  heading: string,
  description: string,
  posts: PostCard[],
  page: number,
  pages: number,
) {
  const ui = COPY[base.lang]
  const prefix = kind === 'tag' ? 'tags' : 'topics'
  const basePath = `/${base.lang}/${prefix}/${slug}`
  const path = page <= 1 ? basePath : `${basePath}?page=${page}`
  return shell({
    ...base,
    title: heading,
    description,
    path,
    alternates: samePath(basePath),
    active: 'writing',
    pager: pagerLinks(basePath, page, pages),
    body: html`<div class="wrap narrow-head">
      <header class="page-head">
        <p class="kicker">${kind === 'tag' ? ui.tagsLabel : ui.writing}</p>
        <h1>${heading}</h1>
        <p class="dek">${description}</p>
      </header>
      ${posts.length ? postList(base, posts, page) : empty(base.lang)}
      ${pagerNav(base.lang, basePath, page, pages)}
    </div>`,
  })
}

export function aboutView(base: Base) {
  const ui = COPY[base.lang]
  const handle = base.settings.share.x || siteHandle(base.env)
  return shell({
    ...base,
    title: ui.aboutTitle,
    description: ui.aboutBody[0] || ui.description,
    path: `/${base.lang}/about`,
    alternates: samePath(`/${base.lang}/about`),
    active: 'about',
    body: html`<article class="wrap prose-wrap">
      <header class="page-head">
        <p class="kicker">${ui.kicker}</p>
        <h1>${ui.aboutTitle}</h1>
      </header>
      <div class="prose">
        ${ui.aboutBody.map((paragraph) => html`<p>${paragraph}</p>`)}
        ${handle ? html`<p><a rel="me" href="https://x.com/${handle}">@${handle}</a></p>` : ''}
      </div>
    </article>`,
  })
}

export function articleView(base: Base, article: Article, options?: { preview?: boolean }) {
  const ui = COPY[base.lang]
  const path = `/${base.lang}/posts/${article.slug}`
  const cover = coverPublicPath(article.coverKey)
  const handle = article.authorX || siteHandle(base.env) || base.settings.share.x
  const profile = handle ? `https://x.com/${handle}` : ''
  const shareUrl = new URL(path, originOf(base.env)).href
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(article.shareText)}&url=${encodeURIComponent(shareUrl)}`
  const crumbs = [
    { name: ui.writing, path: `/${base.lang}/` },
    { name: cat(base, article.category), path: `/${base.lang}/topics/${article.category}` },
    { name: article.title, path },
  ]
  return shell({
    ...base,
    title: article.title,
    description: article.description || article.summary,
    keywords: article.meta.keywords,
    path: article.meta.canonical || path,
    alternates: alternates(base.lang, (code) => (article.langs.includes(code) ? `/${code}/posts/${article.slug}` : null)),
    type: 'article',
    imageKey: article.meta.ogImage || article.coverKey,
    noindex: options?.preview || article.meta.noindex,
    published: article.publishedAt,
    modified: article.updatedAt,
    tags: article.tags.map((tag) => tag.name),
    hasXEmbed: article.hasXEmbed,
    active: 'writing',
    jsonLd: articleJsonLd(base, article, shareUrl, crumbs),
    body: html`<article class="wrap prose-wrap">
      ${options?.preview ? html`<p class="banner">This preview is not listed, sitemapped, or included in RSS.</p>` : ''}
      <nav class="crumbs" aria-label="${ui.breadcrumb}">
        ${crumbs.map((crumb, index) => html`${index ? html`<span class="crumb-sep" aria-hidden="true">›</span>` : ''}<a href="${crumb.path}">${crumb.name}</a>`)}
      </nav>
      <header class="article-head">
        <p class="kicker">
          <a href="/${base.lang}/topics/${article.category}">${cat(base, article.category)}</a>
          <span aria-hidden="true"> · </span>
          <time datetime="${article.publishedAt}">${formatDate(article.publishedAt, base.lang)}</time>
          <span aria-hidden="true"> · </span>
          ${ui.minRead(article.minutes)}
        </p>
        <h1>${article.title}</h1>
        ${article.summary ? html`<p class="summary">${article.summary}</p>` : ''}
        ${base.settings.layout.showAuthor
          ? html`<p class="byline">
          ${profile ? html`<a rel="author" href="${profile}">${article.authorName}</a>` : html`<span>${article.authorName}</span>`}
          ${handle ? html`<span dir="ltr">@${handle}</span>` : ''}
          ${article.lang !== article.sourceLang
            ? html`<span class="translated">${ui.translatedFrom(ui.langNames[article.sourceLang])}</span>`
            : ''}
        </p>`
          : ''}
      </header>
      ${cover ? html`<img class="hero" src="${cover}" alt="${article.title}">` : ''}
      <div class="prose">${raw(article.bodyHtml)}</div>
      ${article.faq.length
        ? html`<section class="faq" aria-labelledby="faq-title">
            <h2 id="faq-title">${ui.faq}</h2>
            ${article.faq.map((item) => html`<details><summary>${item.q}</summary><p>${item.a}</p></details>`)}
          </section>`
        : ''}
      ${base.settings.layout.showTags && article.tags.length
        ? html`<ul class="taglist">
            ${article.tags.map((tag) => html`<li><a href="/${base.lang}/tags/${tag.slug}">${tag.name}</a></li>`)}
          </ul>`
        : ''}
      ${base.settings.layout.showShare
        ? html`<div class="share">
        <a class="button" href="${intent}" rel="noopener noreferrer" target="_blank">${ui.share}</a>
        <button type="button" class="ghost" data-copy="${shareUrl}" data-copied="${ui.copied}">${ui.copyLink}</button>
      </div>`
        : ''}
    </article>`,
  })
}

export function notFoundView(base: Base) {
  const ui = COPY[base.lang]
  return shell({
    ...base,
    title: ui.notFoundTitle,
    description: ui.notFoundBody,
    path: `/${base.lang}/`,
    alternates: samePath(`/${base.lang}/`),
    noindex: true,
    body: html`<div class="wrap page-head">
      <h1>${ui.notFoundTitle}</h1>
      <p class="dek">${ui.notFoundBody}</p>
      <p><a class="button" href="/${base.lang}/">${ui.backHome}</a></p>
    </div>`,
  })
}

export function schemaErrorView(base: Base) {
  const ui = COPY[base.lang]
  return shell({
    ...base,
    title: ui.schemaTitle,
    description: ui.schemaBody,
    path: `/${base.lang}/`,
    alternates: [],
    noindex: true,
    body: html`<div class="wrap page-head">
      <h1>${ui.schemaTitle}</h1>
      <p class="dek">${ui.schemaBody}</p>
      <pre class="code"><code>npm run db:setup</code></pre>
    </div>`,
  })
}

function postList(base: Base, posts: PostCard[], page: number) {
  const lang = base.lang
  const ui = COPY[lang]
  const compact = base.settings.layout.home === 'compact'
    return html`<ol class="entries${compact ? ' compact' : ''}">
    ${posts.map((post, index) => {
      const number = String((page - 1) * PAGE_SIZE + index + 1).padStart(2, '0')
      const cover = coverPublicPath(post.coverKey)
      return html`<li class="entry${index === 0 && page === 1 ? ' feature' : ''}">
        <p class="entry-num" dir="ltr">${number}</p>
        <div>
          <p class="kicker">
            <time datetime="${post.publishedAt}">${formatDate(post.publishedAt, lang)}</time>
            <span aria-hidden="true"> · </span>
            <a href="/${lang}/topics/${post.category}">${cat(base, post.category)}</a>
            <span aria-hidden="true"> · </span>
            ${ui.minRead(post.minutes)}
          </p>
          <h2><a href="/${lang}/posts/${post.slug}">${post.title}</a></h2>
          <p class="dek">${post.description}</p>
          ${cover && index === 0 && page === 1 ? html`<img class="hero" src="${cover}" alt="">` : ''}
          ${base.settings.layout.showTags && post.tags.length
            ? html`<ul class="taglist">
                ${post.tags.map((tag) => html`<li><a href="/${lang}/tags/${tag.slug}">${tag.name}</a></li>`)}
              </ul>`
            : ''}
        </div>
      </li>`
    })}
  </ol>`
}

function empty(lang: Lang) {
  const ui = COPY[lang]
  return html`<div class="empty">
    <h2>${ui.emptyTitle}</h2>
    <p>${ui.emptyBody}</p>
  </div>`
}

function pagerLinks(basePath: string, page: number, pages: number): { prev?: string; next?: string } {
  return {
    prev: page > 1 ? (page === 2 ? basePath : `${basePath}?page=${page - 1}`) : undefined,
    next: page < pages ? `${basePath}?page=${page + 1}` : undefined,
  }
}

function pagerNav(lang: Lang, basePath: string, page: number, pages: number) {
  if (pages <= 1) return ''
  const ui = COPY[lang]
  const links = pagerLinks(basePath, page, pages)
  return html`<nav class="pager" aria-label="${ui.pager}">
    ${links.prev ? html`<a href="${links.prev}" rel="prev">${ui.prev}</a>` : html`<span></span>`}
    <span>${ui.page(page)}</span>
    ${links.next ? html`<a href="${links.next}" rel="next">${ui.next}</a>` : html`<span></span>`}
  </nav>`
}

function articleJsonLd(
  base: Base,
  article: Article,
  shareUrl: string,
  crumbs: { name: string; path: string }[],
) {
  const origin = originOf(base.env)
  const image = socialImage(origin, article.meta.ogImage || article.coverKey)
  const publisherHandle = base.settings.share.x || siteHandle(base.env)
  const graph: Record<string, unknown>[] = [
    {
      '@type': 'Article',
      headline: article.title,
      description: article.description,
      inLanguage: LANG_META[article.lang].hreflang,
      datePublished: article.publishedAt,
      dateModified: article.updatedAt,
      mainEntityOfPage: shareUrl,
      image,
      author: {
        '@type': 'Organization',
        name: siteName(base.env),
        url: origin,
      },
      publisher: {
        '@type': 'Organization',
        name: siteName(base.env),
        url: origin,
        ...(publisherHandle ? { sameAs: [`https://x.com/${publisherHandle}`] } : {}),
      },
      keywords: [article.meta.keywords, ...article.tags.map((tag) => tag.name)].filter(Boolean).join(', '),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: crumb.name,
        item: new URL(crumb.path, origin).href,
      })),
    },
  ]
  if (article.faq.length) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: article.faq.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    })
  }
  return [{ '@context': 'https://schema.org', '@graph': graph }]
}
