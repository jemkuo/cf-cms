import { html } from 'hono/html'
import type { ResolvedSections } from '../sections.mjs'
import type { PostCard } from '../types'
import { contactForm, emptyPosts, hrefFor, portalPage, postCards, type PortalBase } from './portal-bits'

const FALLBACK = ['/themes/harbor/insights-1.jpg', '/themes/harbor/insights-2.jpg', '/themes/harbor/insights-3.jpg']

function hero(base: PortalBase, sections: ResolvedSections) {
  const lang = base.lang
  const item = sections.hero
  return html`<section class="hero">
    <div>
      <p class="eyebrow"><span class="dot"></span>${item.eyebrow}</p>
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

export function harborLanding(base: PortalBase, sections: ResolvedSections, posts: PostCard[]) {
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
          <div class="section-head"><h2>${lang === 'zh' ? '服务' : 'Services'}</h2></div>
          <div class="grid-3">
            ${sections.capabilities.map(
              (card) => html`<article class="card">
                ${card.icon ? html`<div class="icon" aria-hidden="true">${card.icon}</div>` : ''}
                <h3>${card.title}</h3>
                <p>${card.body}</p>
                ${card.more ? html`<a class="more" href="${hrefFor(lang, card.href || '/services')}">${card.more}</a>` : ''}
              </article>`,
            )}
          </div>
        </section>
        <section><div class="stats">${sections.stats.map((stat) => html`<div class="stat"><strong>${stat.value}</strong><span>${stat.label}</span></div>`)}</div></section>
        <section>
          <div class="panel">
            <div class="panel-media">${sections.why.image ? html`<img src="${sections.why.image}" alt="">` : ''}</div>
            <div class="panel-body">
              <p class="eyebrow">${sections.why.eyebrow}</p>
              <h2>${sections.why.title}</h2>
              <p>${sections.why.body}</p>
              ${sections.why.points.length ? html`<ul class="checklist">${sections.why.points.map((point) => html`<li>${point}</li>`)}</ul>` : ''}
              ${sections.why.label ? html`<a class="btn btn-ghost" href="${hrefFor(lang, sections.why.href)}">${sections.why.label}</a>` : ''}
            </div>
          </div>
        </section>
        <section>
          <div class="section-head"><h2>${lang === 'zh' ? '洞察' : 'Insights'}</h2></div>
          ${posts.length ? html`<div class="grid-3">${postCards(base, posts, 'insight', FALLBACK)}</div>` : emptyPosts(lang)}
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

export function harborServices(base: PortalBase, sections: ResolvedSections) {
  const lang = base.lang
  return portalPage(base, {
    title: lang === 'zh' ? '服务' : 'Services',
    description: sections.hero.lede,
    path: `/${lang}/services`,
    active: 'services',
    body: html`<div class="wrap">
      <header class="page-hero">
        <p class="eyebrow"><span class="dot"></span>${lang === 'zh' ? '服务' : 'Services'}</p>
        <h1>${lang === 'zh' ? '服务目录' : 'Service catalog'}</h1>
        <p>${sections.hero.lede}</p>
      </header>
      <section class="grid-2">
        ${sections.capabilities.map(
          (card) => html`<article class="card">
            ${card.icon ? html`<div class="icon" aria-hidden="true">${card.icon}</div>` : ''}
            <h3>${card.title}</h3>
            <p>${card.body}</p>
            ${card.points?.length ? html`<ul class="checklist">${card.points.map((point) => html`<li>${point}</li>`)}</ul>` : ''}
          </article>`,
        )}
      </section>
    </div>`,
  })
}

export function harborInsights(base: PortalBase, posts: PostCard[], page: number, pages: number) {
  const lang = base.lang
  const path = page <= 1 ? `/${lang}/insights` : `/${lang}/insights?page=${page}`
  return portalPage(base, {
    title: lang === 'zh' ? '洞察' : 'Insights',
    description: lang === 'zh' ? '已发布的洞察文章。' : 'Published insight posts.',
    path,
    active: 'insights',
    body: html`<div class="wrap">
      <header class="page-hero">
        <p class="eyebrow"><span class="dot"></span>${lang === 'zh' ? '洞察' : 'Insights'}</p>
        <h1>${lang === 'zh' ? '洞察' : 'Insights'}</h1>
      </header>
      ${posts.length ? html`<div class="grid-3">${postCards(base, posts, 'insight', FALLBACK)}</div>` : emptyPosts(lang)}
      ${pages > 1 ? html`<p>${page} / ${pages}</p>` : ''}
    </div>`,
  })
}

export function harborContact(base: PortalBase, sections: ResolvedSections, sent: boolean) {
  const lang = base.lang
  return portalPage(base, {
    title: sections.contact.title || (lang === 'zh' ? '联系' : 'Contact'),
    description: sections.contact.lede,
    path: `/${lang}/contact`,
    active: 'contact',
    body: html`<div class="wrap">
      <header class="page-hero">
        <p class="eyebrow"><span class="dot"></span>${sections.contact.eyebrow}</p>
        <h1>${sections.contact.title}</h1>
        <p>${sections.contact.lede}</p>
      </header>
      <section class="grid-2">
        ${contactForm(lang, sections, sent)}
        <aside class="card">
          ${sections.contact.email ? html`<p><a href="mailto:${sections.contact.email}">${sections.contact.email}</a></p>` : ''}
          ${sections.contact.address ? html`<p>${sections.contact.address}</p>` : ''}
          ${sections.contact.note ? html`<p>${sections.contact.note}</p>` : ''}
          <img src="/themes/harbor/contact.jpg" alt="">
        </aside>
      </section>
    </div>`,
  })
}
