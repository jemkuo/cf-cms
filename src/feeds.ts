import { listFeed, listLlms, responseCacheControl, sitemapPosts, sitemapTags } from './db'
import { COPY, LANG_META } from './i18n'
import { loadConfig } from './config'
import { ownCopy } from './copy'
import { originOf, siteHandle, siteName } from './site'
import type { Env, Lang } from './types'
import { LANGS } from './types'
import { cdata, parseFaq, xmlEscape } from './text'

function text(body: string, type = 'text/plain; charset=utf-8', cache = 'public, max-age=300'): Response {
  return new Response(body, {
    headers: {
      'content-type': type,
      'cache-control': cache,
      'cdn-cache-control': cache,
    },
  })
}

async function cachedText(env: Env, body: string, type: string): Promise<Response> {
  return text(body, type, await responseCacheControl(env.DB, 300, 0))
}

async function xml(env: Env, body: string): Promise<Response> {
  return cachedText(env, body, 'application/xml; charset=utf-8')
}

function loc(origin: string, path: string): string {
  return xmlEscape(new URL(path, origin).href)
}

function lastmod(iso: string): string {
  return iso.slice(0, 10)
}

function alternates(origin: string, langs: Lang[], pathFor: (lang: Lang) => string): string {
  const links = langs.map((lang) => {
    const href = loc(origin, pathFor(lang))
    return `    <xhtml:link rel="alternate" hreflang="${LANG_META[lang].hreflang}" href="${href}"/>`
  })
  if (langs.includes('zh')) {
    links.push(
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${loc(origin, pathFor('zh'))}"/>`,
    )
  }
  return links.join('\n')
}

export function robotsTxt(env: Env): Response {
  const origin = originOf(env)
  const body = `# ${siteName(env)}
# llms.txt: ${origin}/llms.txt
# llms-full.txt: ${origin}/llms-full.txt

User-agent: *
Allow: /
Disallow: /admin
Disallow: /mcp

User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-SearchBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: Amazonbot
Allow: /

User-agent: meta-externalagent
Allow: /

Sitemap: ${origin}/sitemap.xml
`
  return text(body, 'text/plain; charset=utf-8')
}

export async function sitemapIndex(env: Env): Promise<Response> {
  const origin = originOf(env)
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${LANGS.map((lang) => `  <sitemap><loc>${loc(origin, `/sitemap-${lang}.xml`)}</loc></sitemap>`).join('\n')}
</sitemapindex>
`
  return xml(env, body)
}

export async function sitemapLang(env: Env, lang: Lang): Promise<Response> {
  const origin = originOf(env)
  const [posts, tags] = await Promise.all([sitemapPosts(env.DB), sitemapTags(env.DB, lang)])
  const categories = [...new Set(posts.filter((post) => post.langs.includes(lang)).map((post) => post.category))]
  const urls: string[] = []
  const push = (langs: Lang[], pathFor: (code: Lang) => string, updated?: string) => {
    if (!langs.includes(lang)) return
    const mod = updated ? `\n    <lastmod>${lastmod(updated)}</lastmod>` : ''
    urls.push(`  <url>\n    <loc>${loc(origin, pathFor(lang))}</loc>${mod}\n${alternates(origin, langs, pathFor)}\n  </url>`)
  }
  push([...LANGS], (code) => `/${code}/`)
  push([...LANGS], (code) => `/${code}/about`)
  for (const category of categories) {
    push([...LANGS], (code) => `/${code}/topics/${category}`)
  }
  for (const tag of tags) {
    push([lang], () => `/${lang}/tags/${tag}`)
  }
  for (const post of posts) {
    if (!post.langs.includes(lang)) continue
    push(post.langs, (code) => `/${code}/posts/${post.slug}`, post.updatedAt)
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`
  return xml(env, body)
}

export async function rss(env: Env, lang: Lang): Promise<Response> {
  const origin = originOf(env)
  const name = siteName(env)
  const ui = COPY[lang]
  const own = ownCopy(lang, await loadConfig(env.DB))
  const posts = await listFeed(env.DB, lang)
  const self = `${origin}/${lang}/rss.xml`
  const items = posts
    .map((post) => {
      const link = `${origin}/${lang}/posts/${post.slug}`
      return `  <item>
    <title>${xmlEscape(post.title)}</title>
    <link>${xmlEscape(link)}</link>
    <guid isPermaLink="true">${xmlEscape(link)}</guid>
    <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>
    <description>${xmlEscape(post.description)}</description>
    <content:encoded>${cdata(post.bodyHtml)}</content:encoded>
    ${post.tags.map((tag) => `<category>${xmlEscape(tag.name)}</category>`).join('\n    ')}
  </item>`
    })
    .join('\n')
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>${xmlEscape(name)}</title>
  <link>${xmlEscape(`${origin}/${lang}/`)}</link>
  <description>${xmlEscape(own.description || ui.description)}</description>
  <language>${LANG_META[lang].hreflang}</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  <atom:link href="${xmlEscape(self)}" rel="self" type="application/rss+xml"/>
${items}
</channel>
</rss>
`
  return xml(env, body)
}

export async function llmsTxt(env: Env, full: boolean): Promise<Response> {
  const origin = originOf(env)
  const rows = await listLlms(env.DB)
  const settings = await loadConfig(env.DB)
  const lines = [
    `# ${siteName(env)}`,
    '',
    `> ${ownCopy('en', settings).description || COPY.en.description}`,
    '',
    'Posts are written in one source language and published in Chinese (zh-CN), English, Japanese, Spanish, and Arabic.',
    'Arabic pages are right-to-left. Each article has a summary and, when present, a FAQ block.',
    full ? '' : `Full text: ${origin}/llms-full.txt`,
    '',
    '## Languages',
    '',
    ...LANGS.map((lang) => `- [${LANG_META[lang].label}](${origin}/${lang}/): ${ownCopy(lang, settings).tagline || COPY[lang].tagline}`),
    '',
  ]
  for (const lang of LANGS) {
    const group = rows.filter((row) => row.lang === lang)
    lines.push(`## ${LANG_META[lang].label}`, '')
    if (group.length === 0) {
      lines.push('No published posts.', '')
      continue
    }
    for (const row of group) {
      const url = `${origin}/${lang}/posts/${row.slug}`
      if (!full) {
        lines.push(`- [${row.title}](${url}): ${row.description || row.summary}`)
        continue
      }
      const faq = parseFaq(row.faqJson)
      lines.push(
        `### ${row.title}`,
        '',
        url,
        '',
        `Language: ${LANG_META[lang].hreflang}`,
        '',
        row.summary || row.description,
        '',
        row.body.trim(),
        '',
      )
      if (faq.length) {
        lines.push('FAQ:', '')
        for (const item of faq) lines.push(`Q: ${item.q}`, `A: ${item.a}`, '')
      }
    }
    lines.push('')
  }
  lines.push(`Site: ${origin}`, `X: https://x.com/${siteHandle(env)}`, '')
  return cachedText(env, `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`, 'text/plain; charset=utf-8')
}
