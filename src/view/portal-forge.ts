import { html } from 'hono/html'
import type { ResolvedSections } from '../sections.mjs'
import type { PostCard } from '../types'
import { contactForm, emptyPosts, hrefFor, portalPage, postCards, type PortalBase } from './portal-bits'

const FALLBACK = ['/themes/forge/news-1.jpg', '/themes/forge/news-2.jpg', '/themes/forge/news-3.jpg']

function hero(base: PortalBase, sections: ResolvedSections) {
  const lang = base.lang
  const item = sections.hero
  return html`<section class="hero">
    <div>
      <p class="eyebrow">${item.eyebrow}</p>
      <h1>${item.title}</h1>
      <p class="lede">${item.lede}</p>
      <div class="hero-actions">
        ${item.primaryLabel ? html`<a class="btn btn-primary" href="${hrefFor(lang, item.primaryHref)}">${item.primaryLabel}</a>` : ''}
        ${item.secondaryLabel ? html`<a class="btn btn-ghost" href="${hrefFor(lang, item.secondaryHref)}">${item.secondaryLabel}</a>` : ''}
      </div>
    </div>
    <div class="hero-visual">
      ${item.image ? html`<img src="${item.image}" alt="">` : ''}
      ${item.badgeTitle ? html`<div class="hero-badge"><strong>${item.badgeTitle}</strong>${item.badgeText}</div>` : ''}
    </div>
  </section>`
}

export function forgeLanding(base: PortalBase, sections: ResolvedSections, posts: PostCard[]) {
  const lang = base.lang
  return portalPage(base, {
    title: sections.hero.title,
    description: sections.hero.lede,
    path: `/${lang}/`,
    active: 'home',
    body: html`<div class="wrap">${hero(base, sections)}</div>
      <div class="trust"><div class="wrap">
        ${sections.trustLabel ? html`<p>${sections.trustLabel}</p>` : ''}
        <div class="trust-logos">${sections.trust.map((item) => html`<em>${item}</em>`)}</div>
      </div></div>
      <div class="wrap">
        <section>
          <div class="section-head"><h2>${lang === 'zh' ? '产品' : 'Products'}</h2></div>
          <div class="grid-3">
            ${sections.productLines.map(
              (card) => html`<article class="card product">
                ${card.image ? html`<div class="thumb"><img src="${card.image}" alt=""></div>` : ''}
                <div class="body">
                  ${card.tag ? html`<span class="tag">${card.tag}</span>` : ''}
                  <h3>${card.title}</h3>
                  <p>${card.body}</p>
                  ${card.more ? html`<a class="more" href="${hrefFor(lang, card.href || '/products')}">${card.more}</a>` : ''}
                </div>
              </article>`,
            )}
          </div>
        </section>
        <section><div class="stats">${sections.stats.map((stat) => html`<div class="stat"><strong>${stat.value}</strong><span>${stat.label}</span></div>`)}</div></section>
        <section>
          <div class="section-head"><h2>${lang === 'zh' ? '新闻' : 'News'}</h2></div>
          ${posts.length ? html`<div class="grid-3">${postCards(base, posts, 'news', FALLBACK)}</div>` : emptyPosts(lang)}
        </section>
        <section>
          <div class="cta-band">
            <p class="eyebrow">${sections.cta.eyebrow}</p>
            <h2>${sections.cta.title}</h2>
            <p>${sections.cta.body}</p>
            ${sections.cta.label ? html`<a class="btn btn-primary" href="${hrefFor(lang, sections.cta.href)}">${sections.cta.label}</a>` : ''}
          </div>
        </section>
      </div>`,
  })
}

export function forgeProducts(base: PortalBase, sections: ResolvedSections) {
  const lang = base.lang
  return portalPage(base, {
    title: lang === 'zh' ? '产品' : 'Products',
    description: sections.hero.lede,
    path: `/${lang}/products`,
    active: 'products',
    body: html`<div class="wrap">
      <header class="page-hero">
        <p class="eyebrow">${lang === 'zh' ? '产品' : 'Products'}</p>
        <h1>${lang === 'zh' ? '产品线' : 'Product lines'}</h1>
        <p>${sections.hero.lede}</p>
      </header>
      <section class="grid-3">
        ${sections.productLines.map(
          (card) => html`<article class="card product">
            ${card.image ? html`<div class="thumb"><img src="${card.image}" alt=""></div>` : ''}
            <div class="body">
              ${card.tag ? html`<span class="tag">${card.tag}</span>` : ''}
              <h3>${card.title}</h3>
              <p>${card.body}</p>
            </div>
          </article>`,
        )}
      </section>
      ${sections.capabilities.length
        ? html`<section class="grid-2">
            ${sections.capabilities.map(
              (card) => html`<article class="card"><h3>${card.title}</h3><p>${card.body}</p></article>`,
            )}
          </section>`
        : ''}
    </div>`,
  })
}

export function forgeNews(base: PortalBase, posts: PostCard[], page: number, pages: number) {
  const lang = base.lang
  const path = page <= 1 ? `/${lang}/news` : `/${lang}/news?page=${page}`
  return portalPage(base, {
    title: lang === 'zh' ? '新闻' : 'News',
    description: lang === 'zh' ? '已发布的新闻。' : 'Published news posts.',
    path,
    active: 'news',
    body: html`<div class="wrap">
      <header class="page-hero">
        <p class="eyebrow">${lang === 'zh' ? '新闻' : 'News'}</p>
        <h1>${lang === 'zh' ? '新闻' : 'News'}</h1>
      </header>
      ${posts.length ? html`<div class="grid-3">${postCards(base, posts, 'news', FALLBACK)}</div>` : emptyPosts(lang)}
      ${pages > 1 ? html`<p>${page} / ${pages}</p>` : ''}
    </div>`,
  })
}

export function forgeContact(base: PortalBase, sections: ResolvedSections, sent: boolean) {
  const lang = base.lang
  return portalPage(base, {
    title: sections.contact.title || (lang === 'zh' ? '联系' : 'Contact'),
    description: sections.contact.lede,
    path: `/${lang}/contact`,
    active: 'contact',
    body: html`<div class="wrap">
      <header class="page-hero">
        <p class="eyebrow">${sections.contact.eyebrow}</p>
        <h1>${sections.contact.title}</h1>
        <p>${sections.contact.lede}</p>
      </header>
      <section class="grid-2">
        ${contactForm(lang, sections, sent)}
        <aside class="card">
          ${sections.contact.email ? html`<p><a href="mailto:${sections.contact.email}">${sections.contact.email}</a></p>` : ''}
          ${sections.contact.address ? html`<p>${sections.contact.address}</p>` : ''}
          ${sections.contact.note ? html`<p>${sections.contact.note}</p>` : ''}
          <img src="/themes/forge/plant-exterior.jpg" alt="">
        </aside>
      </section>
    </div>`,
  })
}
