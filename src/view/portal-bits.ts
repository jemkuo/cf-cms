import { html } from 'hono/html'
import { COPY, formatDate } from '../i18n'
import type { ResolvedSections } from '../sections.mjs'
import { coverPublicPath } from '../text'
import type { Lang, PostCard } from '../types'
import { shell, type Alternate } from './layout'
import type { SiteConfig } from '../config'
import type { Channel } from '../config'
import type { Env } from '../types'

export type PortalBase = {
  env: Env
  nonce: string
  lang: Lang
  settings: SiteConfig
  channels: Channel[]
}

export function samePath(path: string): Alternate[] {
  return (['zh', 'en', 'ja', 'es', 'ar'] as const).map((code) => ({
    lang: code,
    path: path.replace(/^\/(zh|en|ja|es|ar)(?=\/|$)/, `/${code}`),
  }))
}

export function hrefFor(lang: Lang, path: string): string {
  if (!path || path === '/') return `/${lang}/`
  if (path.startsWith('#')) return path
  if (/^\/(zh|en|ja|es|ar)(\/|$)/.test(path)) return path
  return `/${lang}${path.startsWith('/') ? path : `/${path}`}`
}

export function portalPage(
  base: PortalBase,
  input: { title: string; description: string; path: string; active: 'home' | 'services' | 'products' | 'about' | 'insights' | 'news' | 'contact'; body: ReturnType<typeof html> },
) {
  return shell({
    ...base,
    title: input.title,
    description: input.description,
    path: input.path,
    alternates: samePath(input.path),
    active: input.active,
    body: input.body,
  })
}

export function postCards(base: PortalBase, posts: PostCard[], kind: 'insight' | 'news', images: string[]) {
  return posts.map((post, index) => {
    const cover = coverPublicPath(post.coverKey) || images[index % images.length] || ''
    return html`<a class="card ${kind}" href="/${base.lang}/posts/${post.slug}">
      ${cover ? html`<div class="thumb"><img src="${cover}" alt=""></div>` : ''}
      <div class="body"><span class="tag">${formatDate(post.publishedAt, base.lang)}</span><h3>${post.title}</h3><p>${post.description || post.summary}</p></div>
    </a>`
  })
}

export function emptyPosts(lang: Lang) {
  const ui = COPY[lang]
  return html`<p class="lede">${ui.emptyTitle}. ${ui.emptyBody}</p>`
}

export function contactForm(lang: Lang, sections: ResolvedSections, sent: boolean) {
  const note = sent
    ? lang === 'zh'
      ? '演示表单没有发送邮件，也没有保存你输入的内容。'
      : 'This demo form did not send mail or store what you typed.'
    : sections.contact.lede
  return html`<form class="form" method="post" action="/${lang}/contact">
    <label>${lang === 'zh' ? '称呼' : 'Name'}<input name="name" autocomplete="name"></label>
    <label>${lang === 'zh' ? '邮箱' : 'Email'}<input type="email" name="email" autocomplete="email"></label>
    <label>${lang === 'zh' ? '想了解的内容' : 'What should we look at'}<textarea name="message" rows="5"></textarea></label>
    <button class="btn btn-primary" type="submit">${sections.contact.title || (lang === 'zh' ? '发送' : 'Send')}</button>
    <p>${note}</p>
  </form>`
}
