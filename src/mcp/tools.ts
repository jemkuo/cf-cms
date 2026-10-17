import {
  cleanPath,
  deleteChannel,
  deleteTag,
  listChannels,
  listTagsAdmin,
  loadConfig,
  namesFromRow,
  parseBrand,
  parseChannelInput,
  parseLayout,
  parsePostMeta,
  parseShare,
  parseSiteMeta,
  parseTemplate,
  saveSettings,
  upsertChannel,
  upsertTag,
} from '../config'
import { applyLogoAsset, applyVisualKit, clearBrandSlot, paintKitBrand } from '../kit'
import { PRESETS, TEMPLATE_IDS, presetById } from '../templates'
import {
  adminList,
  deletePost,
  getAdminPost,
  publicCover,
  savePost,
  saveTranslations,
  setPostStatus,
  slugOwner,
} from '../db'
import { enqueueTranslations, translationStatus } from '../jobs'
import { allLanguagesOption, publishBlockers, refusalText } from '../publish-gate.mjs'
import { assertTimeZone, matchesListStatus, parsePublishAt, visibilityOf } from '../schedule.mjs'
import { parseHeadMeta } from '../head-meta.mjs'
import { imageKey, sniffImage } from '../media'
import { originOf, siteName } from '../site'
import type { AdminTranslation, Env, Lang, SaveTranslation } from '../types'
import { LANGS } from '../types'
import { clip, isLang, nowIso, slugOk } from '../text'
import onboarding from '../../onboarding.json'

type JsonSchema = Record<string, unknown>

const langSchema = { type: 'string', enum: [...LANGS] }

const postMetaSchema: JsonSchema = {
  type: 'object',
  properties: {
    noindex: { type: 'boolean' },
    canonical: { type: 'string' },
    keywords: { type: 'string' },
    ogImage: { type: 'string', description: 'Site path such as /og.png or /media/images/…' },
  },
}

export type Tool = {
  name: string
  description: string
  inputSchema: JsonSchema
  run: (env: Env, args: Record<string, unknown>) => Promise<unknown>
}

function bytesFromBase64(value: string): Uint8Array {
  const raw = value.replace(/^data:[^,]*,/, '')
  const binary = atob(raw)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function langOf(value: unknown, fallback: Lang = 'zh'): Lang {
  return isLang(str(value)) ? (value as Lang) : fallback
}

async function requirePost(env: Env, args: Record<string, unknown>) {
  const id = str(args.id)
  if (id) {
    const post = await getAdminPost(env.DB, id)
    if (!post) throw new Error('Post not found')
    return post
  }
  const slug = str(args.slug).trim().toLowerCase()
  if (!slug) throw new Error('Provide id or slug')
  const owner = await slugOwner(env.DB, slug)
  if (!owner) throw new Error('Post not found')
  const post = await getAdminPost(env.DB, owner)
  if (!post) throw new Error('Post not found')
  return post
}

function publicPost(post: NonNullable<Awaited<ReturnType<typeof getAdminPost>>>) {
  const visibility = visibilityOf(post.status, post.publishedAt, nowIso())
  return {
    id: post.id,
    slug: post.slug,
    status: post.status,
    visibility,
    scheduled: visibility === 'scheduled',
    channel: post.category,
    coverKey: post.coverKey,
    cover: publicCover(post.coverKey),
    authorName: post.authorName,
    authorX: post.authorX,
    sourceLang: post.sourceLang,
    publishedAt: post.publishedAt,
    publishAt: post.publishedAt,
    updatedAt: post.updatedAt,
    meta: post.meta,
    tags: post.tags,
    translationJobs: post.translationJobs,
    translations: post.translations.map((item) => ({
      lang: item.lang,
      title: item.title,
      description: item.description,
      summary: item.summary,
      body: item.body,
      faq: item.faq,
      shareText: item.shareText,
      keywords: item.keywords,
      ogImage: item.ogImage,
      error: item.error,
      engine: item.engine,
      ready: item.ready,
      locked: item.locked,
    })),
  }
}

const translationSchema: JsonSchema = {
  type: 'object',
  description: 'One language. excerpt is an alias of description. og_image is optional and falls back to the post image.',
  properties: {
    title: { type: 'string' },
    body: { type: 'string' },
    excerpt: { type: 'string' },
    description: { type: 'string' },
    summary: { type: 'string' },
    share_text: { type: 'string' },
    shareText: { type: 'string' },
    keywords: { type: 'string' },
    og_image: { type: 'string' },
    ogImage: { type: 'string' },
    ready: { type: 'boolean' },
    locked: { type: 'boolean' },
  },
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function oneTranslation(lang: Lang, raw: Record<string, unknown>, prev: AdminTranslation | undefined, source: boolean): SaveTranslation {
  const title = clip(raw.title === undefined ? prev?.title || '' : str(raw.title), 180)
  const body = (raw.body === undefined ? prev?.body || '' : str(raw.body)).replace(/\r\n/g, '\n')
  const description = clip(
    raw.description !== undefined ? str(raw.description) : raw.excerpt !== undefined ? str(raw.excerpt) : prev?.description || '',
    280,
  )
  const summary = clip(raw.summary === undefined ? prev?.summary || '' : str(raw.summary), 400)
  const shareText = clip(
    raw.share_text !== undefined ? str(raw.share_text) : raw.shareText !== undefined ? str(raw.shareText) : prev?.shareText || '',
    220,
  )
  const keywords = clip(raw.keywords === undefined ? prev?.keywords || '' : str(raw.keywords), 180)
  const ogRaw = raw.og_image !== undefined ? raw.og_image : raw.ogImage !== undefined ? raw.ogImage : prev?.ogImage || ''
  const ogImage = cleanPath(ogRaw)
  if (String(ogRaw || '').trim() && !ogImage) throw new Error(`Open Graph image for ${lang} must be /og.png or /media/images/…`)
  if ([...body].length > 80000) throw new Error('Body is too long')
  return {
    lang,
    title,
    description,
    summary,
    body,
    faq: prev?.faq || [],
    shareText,
    keywords,
    ogImage,
    error: '',
    engine: 'human',
    ready: source ? true : raw.ready === undefined ? (prev ? prev.ready : Boolean(title.trim() && body.trim())) : Boolean(raw.ready),
    locked: source ? true : raw.locked === undefined ? (prev ? prev.locked : false) : Boolean(raw.locked),
  }
}

function translationsFromArgs(
  args: Record<string, unknown>,
  existing: Awaited<ReturnType<typeof getAdminPost>>,
  sourceLang: Lang,
): SaveTranslation[] {
  const map = record(args.translations)
  const items: SaveTranslation[] = []
  const seen = new Set<Lang>()
  if (map) {
    for (const [key, value] of Object.entries(map)) {
      if (!isLang(key)) throw new Error(`Unknown language: ${key}`)
      const row = record(value)
      if (!row) throw new Error(`Translation for ${key} must be an object`)
      const prev = existing?.translations.find((item) => item.lang === key)
      const item = oneTranslation(key, row, prev, key === sourceLang)
      if (!item.title.trim() && !item.body.trim()) continue
      items.push(item)
      seen.add(key)
    }
  }
  const singleLang = isLang(str(args.lang)) ? (args.lang as Lang) : sourceLang
  const hasSingle = args.title !== undefined || args.body !== undefined || args.description !== undefined || args.summary !== undefined
  if (hasSingle && !seen.has(singleLang)) {
    const prev = existing?.translations.find((item) => item.lang === singleLang)
    items.push(
      oneTranslation(
        singleLang,
        {
          title: args.title,
          body: args.body,
          description: args.description,
          summary: args.summary,
          share_text: args.shareText,
          keywords: args.keywords,
          og_image: args.ogImage,
          ready: args.ready,
          locked: args.locked,
        },
        prev,
        singleLang === sourceLang,
      ),
    )
  }
  return items
}

function gateRows(existing: Awaited<ReturnType<typeof getAdminPost>>, incoming: SaveTranslation[]) {
  const map = new Map((existing?.translations || []).map((item) => [item.lang, item]))
  for (const item of incoming) map.set(item.lang, { ...item, updatedAt: '' })
  return [...map.values()]
}

function tagsFrom(args: Record<string, unknown>, lang: Lang): { slug: string; name?: string }[] {
  const raw = args.tags
  if (!Array.isArray(raw)) return []
  const tags: { slug: string; name?: string }[] = []
  for (const item of raw) {
    if (typeof item === 'string' && slugOk(item.trim().toLowerCase())) {
      tags.push({ slug: item.trim().toLowerCase() })
    } else if (item && typeof item === 'object') {
      const row = item as { slug?: string; name?: string }
      const slug = str(row.slug).trim().toLowerCase()
      if (!slugOk(slug)) continue
      const name = clip(str(row.name), 40)
      tags.push(name ? { slug, name } : { slug })
    }
    if (tags.length === 8) break
  }
  void lang
  return tags
}

async function writeFromArgs(env: Env, existing: Awaited<ReturnType<typeof getAdminPost>>, args: Record<string, unknown>) {
  const post = existing
  if (!post && !str(args.slug)) throw new Error('Missing slug')
  const sourceLang = post?.sourceLang || (isLang(str(args.sourceLang)) ? (args.sourceLang as Lang) : langOf(args.lang, 'zh'))
  const slug = (str(args.slug) || post?.slug || '').trim().toLowerCase()
  if (!slugOk(slug)) throw new Error('Slug must be lowercase letters, numbers, and hyphens')
  const id = post?.id ?? crypto.randomUUID()
  const owner = await slugOwner(env.DB, slug)
  if (owner && owner !== id) throw new Error('Slug is already used')
  let status = args.status === 'published' || args.status === 'draft' ? args.status : post?.status || 'draft'
  const channel = slugOk(str(args.channel).trim().toLowerCase())
    ? str(args.channel).trim().toLowerCase()
    : post?.category || 'notes'
  const now = nowIso()
  const meta = args.meta ? parsePostMeta({ ...(post?.meta || {}), ...(args.meta as object) }) : post?.meta || parsePostMeta({})
  let publishedAt = post?.publishedAt ?? null
  const rawAt = args.publish_at !== undefined ? args.publish_at : args.publishAt
  if (rawAt !== undefined && String(rawAt).trim() !== '') {
    if (args.status === 'draft') throw new Error('publish_at schedules a post. Omit it for a draft, or set status to published.')
    publishedAt = parsePublishAt(rawAt, now)
    status = 'published'
  } else if (status === 'published' && !publishedAt) publishedAt = now
  const tags = args.tags ? tagsFrom(args, sourceLang) : (post?.tags || []).map((tag) => ({ slug: tag.slug }))
  const incoming = translationsFromArgs(args, post, post?.sourceLang || sourceLang)
  if (!incoming.length && !post) throw new Error('Title and body are required for the source language')
  const sourceItem = incoming.find((item) => item.lang === (post?.sourceLang || sourceLang)) || post?.translations.find((item) => item.lang === (post?.sourceLang || sourceLang))
  if (!sourceItem?.title.trim() || !sourceItem.body.trim()) throw new Error('Title and body are required for the source language')
  const config = await loadConfig(env.DB)
  if (status === 'published' && allLanguagesOption(args.all_languages, config.require_all_languages)) {
    const blockers = publishBlockers(gateRows(post, incoming.length ? incoming : []))
    if (blockers.length) throw new Error(refusalText(blockers))
  }
  await savePost(env.DB, {
    id,
    slug,
    status,
    category: channel,
    coverKey: args.coverKey === undefined ? post?.coverKey ?? null : str(args.coverKey) || null,
    authorName: clip(str(args.authorName) || post?.authorName || env.DEFAULT_AUTHOR || 'Field Notes', 80),
    authorX: (str(args.authorX) || post?.authorX || '').replace(/^@/, ''),
    sourceLang: post?.sourceLang || sourceLang,
    publishedAt,
    createdAt: post?.createdAt ?? now,
    updatedAt: now,
    meta,
    tags,
    translations: incoming,
    deleteLangs: [],
  })
  if (args.translate === true) await enqueueTranslations(env, id, undefined, 'missing')
  const saved = await getAdminPost(env.DB, id)
  if (!saved) throw new Error('Save failed')
  return publicPost(saved)
}

export const TOOLS: Tool[] = [
  {
    name: 'project_info',
    description: 'Describe CF CMS, its Cloudflare architecture, languages, and the copy-paste onboarding sentence.',
    inputSchema: { type: 'object', properties: {} },
    async run(env) {
      const [posts, channels, tags] = await Promise.all([
        adminList(env.DB),
        listChannels(env.DB),
        listTagsAdmin(env.DB),
      ])
      return {
        name: 'CF CMS',
        package: 'cf-cms',
        onboarding: onboarding,
        origin: originOf(env),
        siteName: siteName(env),
        architecture: {
          pages: 'Cloudflare Pages Functions serve SSR HTML',
          d1: 'Posts, translations, tags, channels, and settings',
          r2: 'Image uploads under images/',
          workersAi: 'Optional translation on publish into zh, en, ja, es, ar',
        },
        languages: LANGS,
        arabic: 'dir=rtl',
        adminPath: '/<ADMIN_SAFEPATH>/admin/',
        adminNote: 'Plain /admin returns 404. The login session is still required after the safepath.',
        templates: TEMPLATE_IDS.map((id) => ({
          id,
          label: PRESETS[id].label,
          niche: PRESETS[id].nicheLabel,
          reference: PRESETS[id].reference,
        })),
        counts: {
          posts: posts.length,
          drafts: posts.filter((item) => item.status === 'draft').length,
          scheduled: posts.filter((item) => item.visibility === 'scheduled').length,
          channels: channels.length,
          tags: tags.length,
        },
      }
    },
  },
  {
    name: 'list_posts',
    description: 'List posts. Filter with status draft, published, scheduled, or any. published includes posts that are already live and posts waiting for a future publishAt. scheduled is published with publishAt still in the future. Each row includes visibility, scheduled, and publishAt.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft', 'published', 'scheduled', 'any'] },
        limit: { type: 'number' },
      },
    },
    async run(env, args) {
      const status = str(args.status) || 'any'
      const limit = Math.max(1, Math.min(100, Number(args.limit) || 50))
      const now = nowIso()
      const rows = await adminList(env.DB)
      return {
        posts: rows
          .filter((item) => matchesListStatus(status, item.status, item.publishedAt, now))
          .slice(0, limit)
          .map((item) => ({
            id: item.id,
            slug: item.slug,
            title: item.title,
            status: item.status,
            visibility: item.visibility,
            scheduled: item.visibility === 'scheduled',
            publishAt: item.publishedAt,
            sourceLang: item.sourceLang,
            updatedAt: item.updatedAt,
            langs: item.langs,
          })),
      }
    },
  },
  {
    name: 'get_post',
    description: 'Read one post, including cover, translations, per-language keywords and errors, tags, translation job status, visibility, and publishAt. visibility is draft, scheduled, or live.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, slug: { type: 'string' } },
    },
    async run(env, args) {
      return publicPost(await requirePost(env, args))
    },
  },
  {
    name: 'create_post',
    description: 'Create a draft or published post. Pass translations for zh, en, ja, es, and ar to save every language in one write. Tags are attached by slug and never renamed. Set translate true to queue Workers AI for languages that are still empty. Optional publish_at is ISO 8601 with an offset or Z and schedules the post; omitting it with status published goes live now.',
    inputSchema: {
      type: 'object',
      required: ['slug'],
      properties: {
        slug: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string', description: 'Markdown for lang, used when translations does not include that language' },
        lang: langSchema,
        sourceLang: langSchema,
        status: { type: 'string', enum: ['draft', 'published'] },
        channel: { type: 'string' },
        description: { type: 'string' },
        summary: { type: 'string' },
        shareText: { type: 'string' },
        authorName: { type: 'string' },
        authorX: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        meta: postMetaSchema,
        translations: { type: 'object', additionalProperties: translationSchema },
        translate: { type: 'boolean' },
        all_languages: { type: 'boolean', description: 'When status is published or publish_at is set, require every language. Defaults to the require_all_languages setting.' },
        publish_at: { type: 'string', description: 'ISO 8601 with a timezone offset or Z, for example 2026-10-18T09:30:00+08:00. Must be in the future. Schedules the post; all languages go live together.' },
      },
    },
    async run(env, args) {
      return writeFromArgs(env, null, args)
    },
  },
  {
    name: 'update_post',
    description: 'Update a post by id or slug. translations saves every included language in one write and does not rename tags. Omit fields you want to keep. meta is merged. publish_at reschedules (ISO 8601 with an offset or Z). Omitting publish_at keeps an existing go-live time. publish_post without publish_at is what makes a scheduled post live now.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        slug: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        lang: langSchema,
        status: { type: 'string', enum: ['draft', 'published'] },
        channel: { type: 'string' },
        description: { type: 'string' },
        summary: { type: 'string' },
        shareText: { type: 'string' },
        authorName: { type: 'string' },
        authorX: { type: 'string' },
        coverKey: { type: 'string' },
        tags: { type: 'array' },
        meta: postMetaSchema,
        translations: { type: 'object', additionalProperties: translationSchema },
        ready: { type: 'boolean' },
        locked: { type: 'boolean' },
        translate: { type: 'boolean' },
        all_languages: { type: 'boolean' },
        publish_at: { type: 'string', description: 'ISO 8601 with a timezone offset or Z. Future only. Sets status to published and keeps the post private until that time.' },
      },
    },
    async run(env, args) {
      return writeFromArgs(env, await requirePost(env, args), args)
    },
  },
  {
    name: 'publish_post',
    description: 'Publish a post so every ready language goes live together. Omit publish_at to go live now, which also releases a scheduled post. Pass publish_at (ISO 8601 with an offset or Z) to schedule one shared go-live time. Refuses when all_languages is true and any of zh, en, ja, es, ar is missing or not ready. all_languages defaults to the require_all_languages setting (missing means true).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        slug: { type: 'string' },
        all_languages: { type: 'boolean' },
        publish_at: { type: 'string', description: 'Optional ISO 8601 with a timezone offset or Z. Future only. Schedules instead of publishing now.' },
      },
    },
    async run(env, args) {
      const post = await requirePost(env, args)
      const rawAt = args.publish_at !== undefined ? args.publish_at : args.publishAt
      const when = rawAt !== undefined && String(rawAt).trim() !== '' ? parsePublishAt(rawAt, nowIso()) : ''
      const config = await loadConfig(env.DB)
      if (allLanguagesOption(args.all_languages, config.require_all_languages)) {
        const blockers = publishBlockers(post.translations)
        if (blockers.length) throw new Error(refusalText(blockers))
      }
      await setPostStatus(env.DB, post.id, 'published', when || undefined)
      const saved = await getAdminPost(env.DB, post.id)
      if (!saved) throw new Error('Publish failed')
      return {
        ...publicPost(saved),
        languages: saved.translations.filter((item) => item.ready).map((item) => item.lang),
      }
    },
  },
  {
    name: 'upsert_translations',
    description: 'Save many language versions of one post in a single write. Does not rename tags or change publish status.',
    inputSchema: {
      type: 'object',
      required: ['translations'],
      properties: {
        id: { type: 'string' },
        slug: { type: 'string' },
        translations: { type: 'object', additionalProperties: translationSchema },
      },
    },
    async run(env, args) {
      const post = await requirePost(env, args)
      const incoming = translationsFromArgs({ ...args, lang: post.sourceLang }, post, post.sourceLang)
      if (!incoming.length) throw new Error('No translations to save')
      await saveTranslations(env.DB, post.id, incoming)
      const saved = await getAdminPost(env.DB, post.id)
      if (!saved) throw new Error('Save failed')
      return publicPost(saved)
    },
  },
  {
    name: 'translate_post',
    description: 'Queue chunked Workers AI translation for a post. langs defaults to every language except the source. Long posts are split by section. Failures store an error and never copy the source text. The job continues in the background and on later requests.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        slug: { type: 'string' },
        langs: { type: 'array', items: langSchema },
        mode: { type: 'string', enum: ['missing', 'unlocked'] },
      },
    },
    async run(env, args) {
      const post = await requirePost(env, args)
      const langs = Array.isArray(args.langs) ? args.langs.filter((item): item is Lang => isLang(str(item))) : undefined
      const mode = args.mode === 'unlocked' ? 'unlocked' : 'missing'
      const queued = await enqueueTranslations(env, post.id, langs, mode)
      const status = await translationStatus(env, post.id)
      return { ...queued, status }
    },
  },
  {
    name: 'translation_status',
    description: 'Read per-language readiness, background translation jobs, and whether the post is draft, scheduled, or live.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, slug: { type: 'string' } } },
    async run(env, args) {
      const post = await requirePost(env, args)
      const status = await translationStatus(env, post.id)
      if (!status) throw new Error('Post not found')
      return status
    },
  },
  {
    name: 'unpublish_post',
    description: 'Return a post to draft. It disappears from public pages, the sitemap, and RSS.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, slug: { type: 'string' } } },
    async run(env, args) {
      const post = await requirePost(env, args)
      await setPostStatus(env.DB, post.id, 'draft')
      return { id: post.id, slug: post.slug, status: 'draft' }
    },
  },
  {
    name: 'delete_post',
    description: 'Delete a post and its translations. Tag rows that are no longer used are removed.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, slug: { type: 'string' } } },
    async run(env, args) {
      const post = await requirePost(env, args)
      await deletePost(env.DB, post.id)
      return { deleted: post.id, slug: post.slug }
    },
  },
  {
    name: 'list_tags',
    description: 'List tags, per-language names, and how many posts use each tag.',
    inputSchema: { type: 'object', properties: {} },
    async run(env) {
      return { tags: await listTagsAdmin(env.DB) }
    },
  },
  {
    name: 'upsert_tag',
    description: 'Create or rename a tag. names is a map of language code to label.',
    inputSchema: {
      type: 'object',
      required: ['slug'],
      properties: { slug: { type: 'string' }, names: { type: 'object' } },
    },
    async run(env, args) {
      const slug = str(args.slug).trim().toLowerCase()
      const ok = await upsertTag(env.DB, slug, namesFromRow(args))
      if (!ok) throw new Error('Invalid tag slug')
      return { slug, names: namesFromRow(args) }
    },
  },
  {
    name: 'delete_tag',
    description: 'Delete a tag and detach it from posts.',
    inputSchema: { type: 'object', required: ['slug'], properties: { slug: { type: 'string' } } },
    async run(env, args) {
      const slug = str(args.slug).trim().toLowerCase()
      if (!slugOk(slug)) throw new Error('Invalid tag slug')
      await deleteTag(env.DB, slug)
      return { deleted: slug }
    },
  },
  {
    name: 'list_channels',
    description: 'List channels (sections), visibility, order, and translated names.',
    inputSchema: { type: 'object', properties: {} },
    async run(env) {
      return { channels: await listChannels(env.DB) }
    },
  },
  {
    name: 'upsert_channel',
    description: 'Create or update a channel. Posts use the slug as their section.',
    inputSchema: {
      type: 'object',
      required: ['slug'],
      properties: {
        slug: { type: 'string' },
        sortOrder: { type: 'number' },
        visible: { type: 'boolean' },
        names: { type: 'object' },
        descriptions: { type: 'object' },
      },
    },
    async run(env, args) {
      const parsed = parseChannelInput(args)
      if (!parsed) throw new Error('Invalid channel slug')
      await upsertChannel(env.DB, parsed)
      return parsed
    },
  },
  {
    name: 'delete_channel',
    description: 'Delete a channel that no post still uses.',
    inputSchema: { type: 'object', required: ['slug'], properties: { slug: { type: 'string' } } },
    async run(env, args) {
      const error = await deleteChannel(env.DB, str(args.slug).trim().toLowerCase())
      if (error === 'in-use') throw new Error('Channel still has posts')
      if (error) throw new Error('Invalid channel slug')
      return { deleted: str(args.slug).trim().toLowerCase() }
    },
  },
  {
    name: 'get_settings',
    description: 'Read template, layout, brand, site meta, share links, require_all_languages, head_meta, and timezone. Missing require_all_languages means true. Missing head_meta means no extra tags. Missing timezone means UTC.',
    inputSchema: {
      type: 'object',
      properties: {
        section: { type: 'string', enum: ['template', 'layout', 'meta', 'share', 'brand', 'head_meta', 'timezone', 'all'] },
      },
    },
    async run(env, args) {
      const config = await loadConfig(env.DB)
      const section = str(args.section) || 'all'
      if (section === 'all') return config
      if (section === 'timezone') return { timezone: config.timezone }
      if (section === 'head_meta') return { head_meta: config.head_meta, require_all_languages: config.require_all_languages }
      if (section === 'meta') return { meta: config.meta, timezone: config.timezone }
      if (section === 'template' || section === 'layout' || section === 'share' || section === 'brand') {
        return { [section]: config[section] }
      }
      throw new Error('Unknown settings section')
    },
  },
  {
    name: 'update_head_meta',
    description: 'Set site-verification and custom meta tags injected into every public page. entries are {kind: name|property, key, attr: content|value, value}. impact-site-verification is stored with the value attribute. raw allows only meta and link tags. Rejects charset, viewport, description, robots, canonical, and og.',
    inputSchema: {
      type: 'object',
      properties: {
        entries: { type: 'array' },
        raw: { type: 'string' },
      },
    },
    async run(env, args) {
      const current = await loadConfig(env.DB)
      const parsed = parseHeadMeta({
        entries: args.entries === undefined ? current.head_meta.entries : args.entries,
        raw: args.raw === undefined ? current.head_meta.raw : args.raw,
      })
      if (!parsed.ok) throw new Error(parsed.error)
      await saveSettings(env.DB, 'head_meta', parsed.value)
      return parsed.value
    },
  },
  {
    name: 'update_template',
    description: 'Set the public template. A new id also applies that prefab’s accent, type, and layout. Ids: paper, ink, terminal, dispatch, signal, atelier, hearth, practice, civic, launch, orbit.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', enum: [...TEMPLATE_IDS] },
        accent: { type: 'string', enum: ['vermilion', 'blue', 'green', 'gold', 'slate'] },
        radius: { type: 'string', enum: ['sharp', 'soft'] },
        font: { type: 'string', enum: ['serif', 'sans', 'mono'] },
      },
    },
    async run(env, args) {
      const current = await loadConfig(env.DB)
      const nextId = typeof args.id === 'string' ? args.id : current.template.id
      const preset = nextId !== current.template.id ? presetById(nextId) : null
      const base = preset
        ? { id: preset.id, accent: preset.accent, radius: preset.radius, font: preset.font }
        : current.template
      const template = parseTemplate({ ...base, ...args, id: nextId })
      await saveSettings(env.DB, 'template', template)
      if (preset) {
        await saveSettings(
          env.DB,
          'layout',
          parseLayout({
            width: preset.width,
            header: preset.header,
            home: preset.home,
            showAuthor: preset.showAuthor,
            showTags: preset.showTags,
            showShare: preset.showShare,
            showKicker: preset.showKicker,
            show_powered_by: current.layout.show_powered_by,
          }),
        )
      }
      return loadConfig(env.DB)
    },
  },
  {
    name: 'update_brand',
    description: 'Set the site mark text and theme color (#rrggbb). clearLogo or clearFavicon removes that asset.',
    inputSchema: {
      type: 'object',
      properties: {
        mark: { type: 'string' },
        themeColor: { type: 'string' },
        clearLogo: { type: 'boolean' },
        clearFavicon: { type: 'boolean' },
      },
    },
    async run(env, args) {
      const current = await loadConfig(env.DB)
      const brand = paintKitBrand(
        parseBrand({
          ...current.brand,
          ...(args.mark !== undefined ? { mark: args.mark } : {}),
          ...(args.themeColor !== undefined ? { themeColor: args.themeColor } : {}),
        }),
        current.template.id,
      )
      await saveSettings(env.DB, 'brand', brand)
      if (args.clearLogo === true) await clearBrandSlot(env, 'logo')
      if (args.clearFavicon === true) await clearBrandSlot(env, 'favicon')
      return (await loadConfig(env.DB)).brand
    },
  },
  {
    name: 'upload_logo',
    description: 'Replace the logo or favicon. SVG is preferred and stored in settings. PNG is stored in R2. dataBase64 is the raw file.',
    inputSchema: {
      type: 'object',
      required: ['dataBase64'],
      properties: {
        dataBase64: { type: 'string' },
        slot: { type: 'string', enum: ['logo', 'favicon'] },
      },
    },
    async run(env, args) {
      let bytes: Uint8Array
      try {
        bytes = bytesFromBase64(str(args.dataBase64))
      } catch {
        throw new Error('dataBase64 is not valid base64')
      }
      const current = await loadConfig(env.DB)
      const slot = args.slot === 'favicon' ? 'favicon' : 'logo'
      const saved = await applyLogoAsset(env, current.brand, slot, bytes)
      if ('error' in saved) throw new Error('Logo must be an SVG or PNG under 1MB')
      return { slot, brand: saved.brand }
    },
  },
  {
    name: 'generate_visual_kit',
    description: 'Generate a logo SVG, favicon, theme color, and layout for a template. Does not replace a saved site description or title suffix. Defaults to the active template. Pass id to switch template first.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', enum: [...TEMPLATE_IDS] },
        mark: { type: 'string' },
      },
    },
    async run(env, args) {
      const current = await loadConfig(env.DB)
      const id = presetById(str(args.id))?.id || current.template.id
      return applyVisualKit(env, id, str(args.mark))
    },
  },
  {
    name: 'update_layout',
    description: 'Set width, header, home list style, and whether author, tags, share, kicker, and the public Powered by CF CMS line show. show_powered_by defaults to true when the saved layout has no such field.',
    inputSchema: {
      type: 'object',
      properties: {
        width: { type: 'string', enum: ['narrow', 'wide'] },
        header: { type: 'string', enum: ['bar', 'stacked'] },
        home: { type: 'string', enum: ['list', 'compact'] },
        showAuthor: { type: 'boolean' },
        showTags: { type: 'boolean' },
        showShare: { type: 'boolean' },
        showKicker: { type: 'boolean' },
        show_powered_by: { type: 'boolean' },
      },
    },
    async run(env, args) {
      const current = await loadConfig(env.DB)
      const layout = parseLayout({ ...current.layout, ...args })
      await saveSettings(env.DB, 'layout', layout)
      return layout
    },
  },
  {
    name: 'update_meta',
    description: 'Set site-wide description, title suffix, default Open Graph image, Twitter card, robots, and timezone. timezone is an IANA name such as UTC or Asia/Shanghai. Missing timezone stays UTC.',
    inputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string' },
        titleSuffix: { type: 'string' },
        ogImage: { type: 'string' },
        twitterCard: { type: 'string', enum: ['summary', 'summary_large_image'] },
        robots: { type: 'string' },
        timezone: { type: 'string', description: 'IANA timezone. Default UTC. Scheduled post times in the admin are entered in this zone.' },
      },
    },
    async run(env, args) {
      const current = await loadConfig(env.DB)
      const meta = parseSiteMeta({ ...current.meta, ...args })
      await saveSettings(env.DB, 'meta', meta)
      if (args.timezone !== undefined) await saveSettings(env.DB, 'timezone', assertTimeZone(args.timezone))
      return { ...meta, timezone: (await loadConfig(env.DB)).timezone }
    },
  },
  {
    name: 'update_share',
    description: 'Set public share links for X, GitHub, Mastodon, LinkedIn, and a website. X is a handle. Other fields are https URLs.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'string' },
        github: { type: 'string' },
        mastodon: { type: 'string' },
        linkedin: { type: 'string' },
        website: { type: 'string' },
        showRss: { type: 'boolean' },
      },
    },
    async run(env, args) {
      const current = await loadConfig(env.DB)
      const share = parseShare({ ...current.share, ...args })
      await saveSettings(env.DB, 'share', share)
      return share
    },
  },
  {
    name: 'list_media',
    description: 'List recent images stored in R2.',
    inputSchema: { type: 'object', properties: { limit: { type: 'number' } } },
    async run(env, args) {
      const limit = Math.max(1, Math.min(100, Number(args.limit) || 40))
      const listed = await env.MEDIA.list({ prefix: 'images/', limit })
      return {
        objects: listed.objects.map((object) => ({
          key: object.key,
          url: `/media/${object.key}`,
          uploaded: object.uploaded.toISOString(),
          size: object.size,
        })),
      }
    },
  },
  {
    name: 'upload_media',
    description: 'Upload an image to R2. dataBase64 is the raw file, not a data URL. Max about 2MB.',
    inputSchema: {
      type: 'object',
      required: ['dataBase64'],
      properties: { dataBase64: { type: 'string' }, filename: { type: 'string' } },
    },
    async run(env, args) {
      const raw = str(args.dataBase64).replace(/^data:[^,]*,/, '')
      let bytes: Uint8Array
      try {
        const binary = atob(raw)
        bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
      } catch {
        throw new Error('dataBase64 is not valid base64')
      }
      if (bytes.byteLength > 2 * 1024 * 1024) throw new Error('Image must be under 2MB for MCP upload')
      const sniffed = sniffImage(bytes)
      if (!sniffed) throw new Error('Only JPEG, PNG, GIF, WebP, and AVIF are accepted')
      const key = imageKey(sniffed.ext)
      await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: sniffed.type } })
      return { key, url: `/media/${key}`, contentType: sniffed.type }
    },
  },
  {
    name: 'delete_media',
    description: 'Delete an R2 object. key is the bucket key, for example images/2026/10/….png.',
    inputSchema: { type: 'object', required: ['key'], properties: { key: { type: 'string' } } },
    async run(env, args) {
      const key = str(args.key).replace(/^\/media\//, '')
      if (!key.startsWith('images/') || key.includes('..')) throw new Error('Refusing to delete that key')
      await env.MEDIA.delete(key)
      return { deleted: key }
    },
  },
]

export async function callTool(env: Env, name: string, args: Record<string, unknown>): Promise<unknown> {
  const tool = TOOLS.find((item) => item.name === name)
  if (!tool) throw new Error(`Unknown tool: ${name}`)
  return tool.run(env, args)
}
