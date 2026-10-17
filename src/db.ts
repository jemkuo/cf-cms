import { EMPTY_POST_META, cleanPath, parsePostMeta, type PostMeta } from './config'
import { TAG_NAME_INSERT_SQL } from './tag-attach.mjs'
import { renderMarkdown } from './md'
import { copy } from './i18n'
import type {
  AdminListItem,
  AdminPost,
  AdminTranslation,
  Article,
  Engine,
  Lang,
  PostCard,
  SavePostInput,
  SaveTranslation,
  TranslationJob,
} from './types'
import {
  coverPublicPath,
  faqJson,
  isLang,
  isStatus,
  minutesFromLength,
  nowIso,
  parseFaq,
  readingMinutes,
  slugOk,
  sortLangs,
} from './text'

type CardRow = {
  id: string
  slug: string
  category: string
  cover_key: string | null
  author_name: string
  author_x: string | null
  published_at: string
  updated_at: string
  source_lang: string
  title: string
  description: string
  summary: string
  lang: string
  body_len: number
}

const CARD_COLUMNS = `
  p.id, p.slug, p.category, p.cover_key, p.author_name, p.author_x,
  p.published_at, p.updated_at, p.source_lang,
  t.title, t.description, t.summary, t.lang, length(t.body_md) AS body_len
`

function asChannel(value: string): string {
  return slugOk(value) ? value : 'notes'
}

function readMeta(raw: string | null | undefined): PostMeta {
  if (!raw) return EMPTY_POST_META
  try {
    return parsePostMeta(JSON.parse(raw) as unknown)
  } catch {
    return EMPTY_POST_META
  }
}

function mapCard(row: CardRow, tags: Map<string, PostCard['tags']>, langs: Map<string, Lang[]>): PostCard {
  const lang = isLang(row.lang) ? row.lang : 'zh'
  const sourceLang = isLang(row.source_lang) ? row.source_lang : 'zh'
  return {
    id: row.id,
    slug: row.slug,
    category: asChannel(row.category),
    coverKey: row.cover_key,
    authorName: row.author_name,
    authorX: (row.author_x || '').replace(/^@/, ''),
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    sourceLang,
    title: row.title,
    description: row.description,
    summary: row.summary || row.description,
    lang,
    minutes: minutesFromLength(row.body_len || 0, lang),
    tags: tags.get(row.id) ?? [],
    langs: langs.get(row.id) ?? [lang],
  }
}

async function tagsFor(db: D1Database, ids: string[], lang: Lang): Promise<Map<string, PostCard['tags']>> {
  const map = new Map<string, PostCard['tags']>()
  if (ids.length === 0) return map
  const marks = ids.map(() => '?').join(', ')
  const { results } = await db
    .prepare(
      `SELECT pt.post_id, tg.slug, COALESCE(tt.name, tg.slug) AS name
       FROM post_tags pt
       JOIN tags tg ON tg.slug = pt.tag_slug
       LEFT JOIN tag_translations tt ON tt.tag_slug = tg.slug AND tt.lang = ?
       WHERE pt.post_id IN (${marks})
       ORDER BY tg.slug`,
    )
    .bind(lang, ...ids)
    .all<{ post_id: string; slug: string; name: string }>()
  for (const row of results) {
    const list = map.get(row.post_id) ?? []
    list.push({ slug: row.slug, name: row.name })
    map.set(row.post_id, list)
  }
  return map
}

async function langsFor(db: D1Database, ids: string[], readyOnly: boolean): Promise<Map<string, Lang[]>> {
  const map = new Map<string, Lang[]>()
  if (ids.length === 0) return map
  const marks = ids.map(() => '?').join(', ')
  const ready = readyOnly ? 'AND ready = 1' : ''
  const { results } = await db
    .prepare(`SELECT post_id, lang FROM translations WHERE post_id IN (${marks}) ${ready}`)
    .bind(...ids)
    .all<{ post_id: string; lang: string }>()
  for (const row of results) {
    if (!isLang(row.lang)) continue
    const list = map.get(row.post_id) ?? []
    list.push(row.lang)
    map.set(row.post_id, sortLangs(list))
  }
  return map
}

export async function schemaReady(db: D1Database): Promise<boolean> {
  const row = await db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'posts'`)
    .first<{ name: string }>()
  return Boolean(row)
}

export async function listPublished(
  db: D1Database,
  lang: Lang,
  options: { limit: number; offset: number; tag?: string; category?: string },
): Promise<{ posts: PostCard[]; total: number }> {
  const where = [`p.status = 'published'`, `t.lang = ?`, `t.ready = 1`]
  const binds: (string | number)[] = [lang]
  let join = ''
  if (options.tag) {
    join = 'JOIN post_tags filter_tag ON filter_tag.post_id = p.id AND filter_tag.tag_slug = ?'
    binds.push(options.tag)
  }
  if (options.category) {
    where.push('p.category = ?')
    binds.push(options.category)
  }
  const whereSql = where.join(' AND ')
  const totalRow = await db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM posts p
       JOIN translations t ON t.post_id = p.id
       ${join}
       WHERE ${whereSql}`,
    )
    .bind(...binds)
    .first<{ n: number }>()
  const { results } = await db
    .prepare(
      `SELECT ${CARD_COLUMNS}
       FROM posts p
       JOIN translations t ON t.post_id = p.id
       ${join}
       WHERE ${whereSql}
       ORDER BY p.published_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...binds, options.limit, options.offset)
    .all<CardRow>()
  const ids = results.map((row) => row.id)
  const [tags, langs] = await Promise.all([tagsFor(db, ids, lang), langsFor(db, ids, true)])
  return {
    total: totalRow?.n ?? 0,
    posts: results.map((row) => mapCard(row, tags, langs)),
  }
}

export async function listTagCloud(
  db: D1Database,
  lang: Lang,
): Promise<{ slug: string; name: string; count: number }[]> {
  const { results } = await db
    .prepare(
      `SELECT tg.slug, COALESCE(tt.name, tg.slug) AS name, COUNT(*) AS n
       FROM post_tags pt
       JOIN posts p ON p.id = pt.post_id AND p.status = 'published'
       JOIN translations tr ON tr.post_id = p.id AND tr.lang = ? AND tr.ready = 1
       JOIN tags tg ON tg.slug = pt.tag_slug
       LEFT JOIN tag_translations tt ON tt.tag_slug = tg.slug AND tt.lang = ?
       GROUP BY tg.slug, name
       ORDER BY n DESC, tg.slug
       LIMIT 24`,
    )
    .bind(lang, lang)
    .all<{ slug: string; name: string; n: number }>()
  return results.map((row) => ({ slug: row.slug, name: row.name, count: row.n }))
}

export async function tagExists(db: D1Database, slug: string): Promise<boolean> {
  const row = await db.prepare(`SELECT slug FROM tags WHERE slug = ?`).bind(slug).first()
  return Boolean(row)
}

export async function tagName(db: D1Database, slug: string, lang: Lang): Promise<string> {
  const row = await db
    .prepare(`SELECT name FROM tag_translations WHERE tag_slug = ? AND lang = ?`)
    .bind(slug, lang)
    .first<{ name: string }>()
  return row?.name || slug
}

type ArticleRow = CardRow & {
  body_md: string
  faq_json: string
  share_text: string
  keywords?: string | null
  og_image?: string | null
  meta_json?: string | null
}

function articleMeta(row: ArticleRow): PostMeta {
  const meta = readMeta(row.meta_json)
  const keywords = (row.keywords || '').trim() || meta.keywords
  const ogImage = cleanPath(row.og_image || '') || meta.ogImage
  return { ...meta, keywords, ogImage }
}

export async function getArticle(
  db: D1Database,
  slug: string,
  lang: Lang,
  preview: boolean,
): Promise<Article | null> {
  const ready = preview ? '' : 'AND t.ready = 1'
  const status = preview ? '' : `AND p.status = 'published'`
  const row = await db
    .prepare(
      `SELECT ${CARD_COLUMNS}, t.body_md, t.faq_json, t.share_text, t.keywords, t.og_image, p.meta_json
       FROM posts p
       JOIN translations t ON t.post_id = p.id AND t.lang = ? ${ready}
       WHERE p.slug = ? ${status}`,
    )
    .bind(lang, slug)
    .first<ArticleRow>()
  if (!row) return null
  const [tags, langs] = await Promise.all([
    tagsFor(db, [row.id], lang),
    langsFor(db, [row.id], !preview),
  ])
  const card = mapCard(row, tags, langs)
  const rendered = renderMarkdown(row.body_md, copy(lang).viewOnX)
  const faq = parseFaq(row.faq_json)
  return {
    ...card,
    minutes: readingMinutes(row.body_md, lang),
    bodyHtml: rendered.html,
    hasXEmbed: rendered.hasXEmbed,
    faq,
    shareText: row.share_text || row.title,
    publishedAt: row.published_at || row.updated_at,
    meta: articleMeta(row),
  }
}

export async function publishedSource(db: D1Database, slug: string): Promise<Lang | null> {
  const row = await db
    .prepare(
      `SELECT p.source_lang
       FROM posts p
       WHERE p.slug = ? AND p.status = 'published'`,
    )
    .bind(slug)
    .first<{ source_lang: string }>()
  if (!row || !isLang(row.source_lang)) return null
  return row.source_lang
}

export async function listFeed(db: D1Database, lang: Lang): Promise<Article[]> {
  const { results } = await db
    .prepare(
      `SELECT ${CARD_COLUMNS}, t.body_md, t.faq_json, t.share_text, t.keywords, t.og_image, p.meta_json
       FROM posts p
       JOIN translations t ON t.post_id = p.id AND t.lang = ? AND t.ready = 1
       WHERE p.status = 'published'
       ORDER BY p.published_at DESC
       LIMIT 40`,
    )
    .bind(lang)
    .all<ArticleRow>()
  const ids = results.map((row) => row.id)
  const [tags, langs] = await Promise.all([tagsFor(db, ids, lang), langsFor(db, ids, true)])
  return results.map((row) => {
    const card = mapCard(row, tags, langs)
    const rendered = renderMarkdown(row.body_md, copy(lang).viewOnX)
    return {
      ...card,
      minutes: readingMinutes(row.body_md, lang),
      bodyHtml: rendered.html,
      hasXEmbed: rendered.hasXEmbed,
      faq: parseFaq(row.faq_json),
      shareText: row.share_text || row.title,
      meta: articleMeta(row),
    }
  })
}

export type LlmsRow = {
  slug: string
  lang: Lang
  title: string
  description: string
  summary: string
  body: string
  faqJson: string
  updatedAt: string
  category: string
}

export async function listLlms(db: D1Database): Promise<LlmsRow[]> {
  const { results } = await db
    .prepare(
      `SELECT p.slug, p.category, p.updated_at, t.lang, t.title, t.description, t.summary, t.body_md, t.faq_json
       FROM posts p
       JOIN translations t ON t.post_id = p.id AND t.ready = 1
       WHERE p.status = 'published'
       ORDER BY p.published_at DESC, t.lang`,
    )
    .all<{
      slug: string
      category: string
      updated_at: string
      lang: string
      title: string
      description: string
      summary: string
      body_md: string
      faq_json: string
    }>()
  return results.flatMap((row) => {
    if (!isLang(row.lang)) return []
    return [
      {
        slug: row.slug,
        lang: row.lang,
        title: row.title,
        description: row.description,
        summary: row.summary || row.description,
        body: row.body_md,
        faqJson: row.faq_json,
        updatedAt: row.updated_at,
        category: asChannel(row.category),
      },
    ]
  })
}

export type SitemapPost = {
  slug: string
  updatedAt: string
  category: string
  langs: Lang[]
}

export async function sitemapPosts(db: D1Database): Promise<SitemapPost[]> {
  const { results } = await db
    .prepare(
      `SELECT p.slug, p.category, p.updated_at, t.lang
       FROM posts p
       JOIN translations t ON t.post_id = p.id AND t.ready = 1
       WHERE p.status = 'published'
       ORDER BY p.published_at DESC`,
    )
    .all<{ slug: string; category: string; updated_at: string; lang: string }>()
  const map = new Map<string, SitemapPost>()
  for (const row of results) {
    if (!isLang(row.lang)) continue
    const current = map.get(row.slug) ?? {
      slug: row.slug,
      updatedAt: row.updated_at,
      category: asChannel(row.category),
      langs: [],
    }
    current.langs.push(row.lang)
    if (row.updated_at > current.updatedAt) current.updatedAt = row.updated_at
    map.set(row.slug, current)
  }
  return [...map.values()].map((item) => ({ ...item, langs: sortLangs(item.langs) }))
}

export async function sitemapTags(db: D1Database, lang: Lang): Promise<string[]> {
  const cloud = await listTagCloud(db, lang)
  return cloud.map((tag) => tag.slug)
}

function mapAdminTranslation(row: {
  lang: string
  title: string
  description: string
  summary: string
  body_md: string
  faq_json: string
  share_text: string
  keywords?: string | null
  og_image?: string | null
  error?: string | null
  engine: string
  ready: number
  locked: number
  updated_at: string
}): AdminTranslation | null {
  if (!isLang(row.lang)) return null
  const engine: Engine = row.engine === 'workers-ai' || row.engine === 'fallback' ? row.engine : 'human'
  return {
    lang: row.lang,
    title: row.title,
    description: row.description,
    summary: row.summary,
    body: row.body_md,
    faq: parseFaq(row.faq_json),
    shareText: row.share_text,
    keywords: row.keywords || '',
    ogImage: row.og_image || '',
    error: row.error || '',
    engine,
    ready: row.ready === 1,
    locked: row.locked === 1,
    updatedAt: row.updated_at,
  }
}

export async function adminList(db: D1Database): Promise<AdminListItem[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.slug, p.status, p.source_lang, p.updated_at, p.published_at, p.translate_note,
              t.lang, t.ready, t.engine, t.title
       FROM posts p
       LEFT JOIN translations t ON t.post_id = p.id
       ORDER BY p.updated_at DESC`,
    )
    .all<{
      id: string
      slug: string
      status: string
      source_lang: string
      updated_at: string
      published_at: string | null
      translate_note: string | null
      lang: string | null
      ready: number | null
      engine: string | null
      title: string | null
    }>()
  const map = new Map<string, AdminListItem>()
  for (const row of results) {
    let item = map.get(row.id)
    if (!item) {
      const sourceLang = isLang(row.source_lang) ? row.source_lang : 'zh'
      item = {
        id: row.id,
        slug: row.slug,
        status: isStatus(row.status) ? row.status : 'draft',
        sourceLang,
        updatedAt: row.updated_at,
        publishedAt: row.published_at,
        title: row.slug,
        translateNote: row.translate_note || '',
        langs: [],
      }
      map.set(row.id, item)
    }
    if (row.lang && isLang(row.lang)) {
      const engine: Engine = row.engine === 'workers-ai' || row.engine === 'fallback' ? row.engine : 'human'
      item.langs.push({ lang: row.lang, ready: row.ready === 1, engine })
      if (row.lang === item.sourceLang && row.title) item.title = row.title
    }
  }
  return [...map.values()]
}

export async function getAdminPost(db: D1Database, id: string): Promise<AdminPost | null> {
  const post = await db
    .prepare(`SELECT * FROM posts WHERE id = ?`)
    .bind(id)
    .first<{
      id: string
      slug: string
      status: string
      category: string
      cover_key: string | null
      author_name: string
      author_x: string | null
      source_lang: string
      translate_note: string | null
      published_at: string | null
      created_at: string
      updated_at: string
      meta_json: string | null
    }>()
  if (!post || !isLang(post.source_lang) || !isStatus(post.status)) return null
  const { results: translations } = await db
    .prepare(`SELECT * FROM translations WHERE post_id = ?`)
    .bind(id)
    .all<{
      lang: string
      title: string
      description: string
      summary: string
      body_md: string
      faq_json: string
      share_text: string
      keywords?: string | null
      og_image?: string | null
      error?: string | null
      engine: string
      ready: number
      locked: number
      updated_at: string
    }>()
  const { results: tagRows } = await db
    .prepare(
      `SELECT pt.tag_slug AS slug, tt.lang, tt.name
       FROM post_tags pt
       LEFT JOIN tag_translations tt ON tt.tag_slug = pt.tag_slug
       WHERE pt.post_id = ?
       ORDER BY pt.tag_slug`,
    )
    .bind(id)
    .all<{ slug: string; lang: string | null; name: string | null }>()
  const tags = new Map<string, { slug: string; names: Partial<Record<Lang, string>> }>()
  for (const row of tagRows) {
    const tag = tags.get(row.slug) ?? { slug: row.slug, names: {} }
    if (row.lang && isLang(row.lang) && row.name) tag.names[row.lang] = row.name
    tags.set(row.slug, tag)
  }
  return {
    id: post.id,
    slug: post.slug,
    status: post.status,
    category: asChannel(post.category),
    coverKey: post.cover_key,
    authorName: post.author_name,
    authorX: (post.author_x || '').replace(/^@/, ''),
    sourceLang: post.source_lang,
    translateNote: post.translate_note || '',
    publishedAt: post.published_at,
    createdAt: post.created_at,
    updatedAt: post.updated_at,
    meta: readMeta(post.meta_json),
    tags: [...tags.values()],
    translations: translations.flatMap((row) => {
      const mapped = mapAdminTranslation(row)
      return mapped ? [mapped] : []
    }),
    translationJobs: await listTranslationJobs(db, id),
  }
}

export async function slugOwner(db: D1Database, slug: string): Promise<string | null> {
  const row = await db.prepare(`SELECT id FROM posts WHERE slug = ?`).bind(slug).first<{ id: string }>()
  return row?.id ?? null
}

export async function savePost(db: D1Database, input: SavePostInput): Promise<void> {
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO posts (
           id, slug, status, category, cover_key, author_name, author_x, source_lang,
           meta_json, published_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           slug = excluded.slug,
           status = excluded.status,
           category = excluded.category,
           cover_key = excluded.cover_key,
           author_name = excluded.author_name,
           author_x = excluded.author_x,
           source_lang = excluded.source_lang,
           meta_json = excluded.meta_json,
           published_at = excluded.published_at,
           updated_at = excluded.updated_at`,
      )
      .bind(
        input.id,
        input.slug,
        input.status,
        input.category,
        input.coverKey,
        input.authorName,
        input.authorX,
        input.sourceLang,
        JSON.stringify(input.meta),
        input.publishedAt,
        input.createdAt,
        input.updatedAt,
      ),
  ]
  for (const item of input.translations) statements.push(translationStatement(db, input.id, item))
  for (const lang of input.deleteLangs) {
    statements.push(db.prepare(`DELETE FROM translations WHERE post_id = ? AND lang = ?`).bind(input.id, lang))
  }
  statements.push(db.prepare(`DELETE FROM post_tags WHERE post_id = ?`).bind(input.id))
  for (const tag of input.tags) {
    statements.push(
      db
        .prepare(`INSERT INTO tags (slug, created_at) VALUES (?, ?) ON CONFLICT(slug) DO NOTHING`)
        .bind(tag.slug, input.updatedAt),
    )
    statements.push(
      db.prepare(`INSERT INTO post_tags (post_id, tag_slug) VALUES (?, ?)`).bind(input.id, tag.slug),
    )
    statements.push(db.prepare(TAG_NAME_INSERT_SQL).bind(tag.slug, input.sourceLang, tag.name || tag.slug))
  }
  await db.batch(statements)
}

function translationStatement(db: D1Database, postId: string, item: SaveTranslation): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO translations (
         post_id, lang, title, description, summary, body_md, faq_json, share_text,
         keywords, og_image, error, engine, ready, locked, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(post_id, lang) DO UPDATE SET
         title = excluded.title,
         description = excluded.description,
         summary = excluded.summary,
         body_md = excluded.body_md,
         faq_json = excluded.faq_json,
         share_text = excluded.share_text,
         keywords = excluded.keywords,
         og_image = excluded.og_image,
         error = excluded.error,
         engine = excluded.engine,
         ready = excluded.ready,
         locked = excluded.locked,
         updated_at = excluded.updated_at`,
    )
    .bind(
      postId,
      item.lang,
      item.title,
      item.description,
      item.summary,
      item.body,
      faqJson(item.faq),
      item.shareText,
      item.keywords,
      item.ogImage,
      item.error,
      item.engine,
      item.ready ? 1 : 0,
      item.locked ? 1 : 0,
      nowIso(),
    )
}

export async function saveTranslations(db: D1Database, postId: string, items: SaveTranslation[]): Promise<void> {
  if (!items.length) return
  const updated = nowIso()
  await db.batch([
    ...items.map((item) => translationStatement(db, postId, item)),
    db.prepare(`UPDATE posts SET updated_at = ? WHERE id = ?`).bind(updated, postId),
  ])
}

export async function writeTranslation(db: D1Database, postId: string, item: SaveTranslation): Promise<void> {
  await saveTranslations(db, postId, [item])
}

export async function markTranslationError(db: D1Database, postId: string, lang: Lang, message: string, keepBody: boolean): Promise<void> {
  const updated = nowIso()
  if (keepBody) {
    await db
      .prepare(`UPDATE translations SET error = ?, updated_at = ? WHERE post_id = ? AND lang = ?`)
      .bind(message, updated, postId, lang)
      .run()
    return
  }
  await db
    .prepare(
      `INSERT INTO translations (
         post_id, lang, title, description, summary, body_md, faq_json, share_text,
         keywords, og_image, error, engine, ready, locked, updated_at
       ) VALUES (?, ?, '', '', '', '', '[]', '', '', '', ?, 'fallback', 0, 0, ?)
       ON CONFLICT(post_id, lang) DO UPDATE SET
         title = '',
         description = '',
         summary = '',
         body_md = '',
         faq_json = '[]',
         share_text = '',
         error = excluded.error,
         engine = 'fallback',
         ready = 0,
         locked = translations.locked,
         updated_at = excluded.updated_at`,
    )
    .bind(postId, lang, message, updated)
    .run()
}

export async function setTranslateNote(db: D1Database, id: string, note: string): Promise<void> {
  await db.prepare(`UPDATE posts SET translate_note = ? WHERE id = ?`).bind(note, id).run()
}

export async function setPostStatus(db: D1Database, id: string, status: 'draft' | 'published'): Promise<boolean> {
  const row = await db
    .prepare(`SELECT published_at FROM posts WHERE id = ?`)
    .bind(id)
    .first<{ published_at: string | null }>()
  if (!row) return false
  const now = nowIso()
  const publishedAt = status === 'published' ? row.published_at || now : row.published_at
  await db
    .prepare(`UPDATE posts SET status = ?, published_at = ?, updated_at = ? WHERE id = ?`)
    .bind(status, publishedAt, now, id)
    .run()
  return true
}

export async function deletePost(db: D1Database, id: string): Promise<void> {
  await db.batch([
    db.prepare(`DELETE FROM translation_jobs WHERE post_id = ?`).bind(id),
    db.prepare(`DELETE FROM post_tags WHERE post_id = ?`).bind(id),
    db.prepare(`DELETE FROM translations WHERE post_id = ?`).bind(id),
    db.prepare(`DELETE FROM posts WHERE id = ?`).bind(id),
    db.prepare(`DELETE FROM tags WHERE slug NOT IN (SELECT tag_slug FROM post_tags)`),
    db.prepare(`DELETE FROM tag_translations WHERE tag_slug NOT IN (SELECT slug FROM tags)`),
  ])
}

export async function listTranslationJobs(db: D1Database, postId: string): Promise<TranslationJob[]> {
  try {
    const { results } = await db
      .prepare(
        `SELECT id, post_id, lang, status, error, cursor, attempts, updated_at
         FROM translation_jobs WHERE post_id = ? ORDER BY created_at`,
      )
      .bind(postId)
      .all<{
        id: string
        post_id: string
        lang: string
        status: string
        error: string
        cursor: number
        attempts: number
        updated_at: string
      }>()
    return results.flatMap((row) => {
      if (!isLang(row.lang)) return []
      return [
        {
          id: row.id,
          postId: row.post_id,
          lang: row.lang,
          status: row.status,
          error: row.error || '',
          cursor: row.cursor || 0,
          attempts: row.attempts || 0,
          updatedAt: row.updated_at,
        },
      ]
    })
  } catch {
    return []
  }
}

export async function replaceTranslationJobs(db: D1Database, postId: string, langs: Lang[]): Promise<void> {
  const now = nowIso()
  const statements: D1PreparedStatement[] = langs.map((lang) =>
    db.prepare(`DELETE FROM translation_jobs WHERE post_id = ? AND lang = ?`).bind(postId, lang),
  )
  for (const lang of langs) {
    statements.push(
      db
        .prepare(
          `INSERT INTO translation_jobs (
             id, post_id, lang, status, error, cursor, partial, attempts, created_at, updated_at
           ) VALUES (?, ?, ?, 'pending', '', 0, '', 0, ?, ?)`,
        )
        .bind(crypto.randomUUID(), postId, lang, now, now),
    )
  }
  if (statements.length) await db.batch(statements)
}

export async function nextTranslationJob(db: D1Database): Promise<{
  id: string
  post_id: string
  lang: string
  status: string
  error: string
  cursor: number
  partial: string
  attempts: number
} | null> {
  const row = await db
    .prepare(
      `SELECT id, post_id, lang, status, error, cursor, partial, attempts
       FROM translation_jobs
       WHERE status IN ('pending', 'running')
       ORDER BY updated_at
       LIMIT 1`,
    )
    .first<{
      id: string
      post_id: string
      lang: string
      status: string
      error: string
      cursor: number
      partial: string
      attempts: number
    }>()
  return row ?? null
}

export async function saveTranslationJob(
  db: D1Database,
  id: string,
  patch: { status: string; error?: string; cursor?: number; partial?: string; attempts?: number },
): Promise<void> {
  await db
    .prepare(
      `UPDATE translation_jobs
       SET status = ?, error = ?, cursor = ?, partial = ?, attempts = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(patch.status, patch.error || '', patch.cursor ?? 0, patch.partial || '', patch.attempts ?? 0, nowIso(), id)
    .run()
}

export async function listOpenTranslationJobs(db: D1Database): Promise<{ id: string; postId: string; lang: string }[]> {
  const { results } = await db
    .prepare(`SELECT id, post_id, lang FROM translation_jobs WHERE status IN ('pending', 'running')`)
    .all<{ id: string; post_id: string; lang: string }>()
  return results.map((row) => ({ id: row.id, postId: row.post_id, lang: row.lang }))
}

export async function failOpenTranslationJobs(db: D1Database, message: string): Promise<void> {
  await db
    .prepare(
      `UPDATE translation_jobs
       SET status = 'error', error = ?, updated_at = ?
       WHERE status IN ('pending', 'running')`,
    )
    .bind(message, nowIso())
    .run()
}

export function publicCover(key: string | null): string | null {
  return coverPublicPath(key)
}

export const PAGE_SIZE = 8
