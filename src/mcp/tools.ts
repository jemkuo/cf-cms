import { fillTranslations } from '../ai'
import {
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
  savePost,
  setPostStatus,
  slugOwner,
} from '../db'
import { imageKey, sniffImage } from '../media'
import { originOf, siteName } from '../site'
import type { Env, Lang, SaveTranslation } from '../types'
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
  return {
    id: post.id,
    slug: post.slug,
    status: post.status,
    channel: post.category,
    authorName: post.authorName,
    authorX: post.authorX,
    sourceLang: post.sourceLang,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    meta: post.meta,
    tags: post.tags,
    translations: post.translations.map((item) => ({
      lang: item.lang,
      title: item.title,
      description: item.description,
      summary: item.summary,
      body: item.body,
      faq: item.faq,
      shareText: item.shareText,
      engine: item.engine,
      ready: item.ready,
      locked: item.locked,
    })),
  }
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
  if (!post && !str(args.title) && !str(args.slug)) throw new Error('Missing post')
  const sourceLang = langOf(args.lang, post?.sourceLang || 'zh')
  const slug = (str(args.slug) || post?.slug || '').trim().toLowerCase()
  if (!slugOk(slug)) throw new Error('Slug must be lowercase letters, numbers, and hyphens')
  const id = post?.id ?? crypto.randomUUID()
  const owner = await slugOwner(env.DB, slug)
  if (owner && owner !== id) throw new Error('Slug is already used')
  const status = args.status === 'published' || args.status === 'draft' ? args.status : post?.status || 'draft'
  const channel = slugOk(str(args.channel).trim().toLowerCase())
    ? str(args.channel).trim().toLowerCase()
    : post?.category || 'notes'
  const now = nowIso()
  const lang = langOf(args.lang, sourceLang)
  const prev = post?.translations.find((item) => item.lang === lang)
  const title = clip(str(args.title) || prev?.title || '', 180)
  const body = (str(args.body) || prev?.body || '').replace(/\r\n/g, '\n')
  if (!title || !body.trim()) throw new Error('Title and body are required for the source language')
  if ([...body].length > 80000) throw new Error('Body is too long')
  const translation: SaveTranslation = {
    lang,
    title,
    description: clip(str(args.description) || prev?.description || '', 280),
    summary: clip(str(args.summary) || prev?.summary || '', 400),
    body,
    faq: prev?.faq || [],
    shareText: clip(str(args.shareText) || prev?.shareText || '', 220),
    engine: 'human',
    ready: args.ready === undefined ? (prev ? prev.ready : lang === sourceLang) : Boolean(args.ready),
    locked: args.locked === undefined ? (prev ? prev.locked : lang === sourceLang) : Boolean(args.locked),
  }
  if (lang === sourceLang) {
    translation.ready = true
    translation.locked = true
  }
  const meta = args.meta ? parsePostMeta({ ...(post?.meta || {}), ...(args.meta as object) }) : post?.meta || parsePostMeta({})
  let publishedAt = post?.publishedAt ?? null
  if (status === 'published' && !publishedAt) publishedAt = now
  const tags = args.tags ? tagsFrom(args, lang) : (post?.tags || []).map((tag) => ({ slug: tag.slug, name: tag.names[sourceLang] }))
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
    translations: [translation],
    deleteLangs: [],
  })
  if (args.translate === true) await fillTranslations(env, id, 'missing')
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
          channels: channels.length,
          tags: tags.length,
        },
      }
    },
  },
  {
    name: 'list_posts',
    description: 'List posts. Filter with status draft, published, or any.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft', 'published', 'any'] },
        limit: { type: 'number' },
      },
    },
    async run(env, args) {
      const status = str(args.status) || 'any'
      const limit = Math.max(1, Math.min(100, Number(args.limit) || 50))
      const rows = await adminList(env.DB)
      return {
        posts: rows
          .filter((item) => status === 'any' || item.status === status)
          .slice(0, limit)
          .map((item) => ({
            id: item.id,
            slug: item.slug,
            title: item.title,
            status: item.status,
            sourceLang: item.sourceLang,
            updatedAt: item.updatedAt,
            langs: item.langs,
          })),
      }
    },
  },
  {
    name: 'get_post',
    description: 'Read one post, including translations, tags, channel, and per-post meta.',
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
    description: 'Create a draft or published post in one language. Set translate true to fill the other languages with Workers AI.',
    inputSchema: {
      type: 'object',
      required: ['slug', 'title', 'body'],
      properties: {
        slug: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string', description: 'Markdown' },
        lang: langSchema,
        status: { type: 'string', enum: ['draft', 'published'] },
        channel: { type: 'string' },
        description: { type: 'string' },
        summary: { type: 'string' },
        shareText: { type: 'string' },
        authorName: { type: 'string' },
        authorX: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        meta: postMetaSchema,
        translate: { type: 'boolean' },
      },
    },
    async run(env, args) {
      return writeFromArgs(env, null, args)
    },
  },
  {
    name: 'update_post',
    description: 'Update a post by id or slug. Omit fields you want to keep. meta is merged.',
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
        ready: { type: 'boolean' },
        locked: { type: 'boolean' },
        translate: { type: 'boolean' },
      },
    },
    async run(env, args) {
      return writeFromArgs(env, await requirePost(env, args), args)
    },
  },
  {
    name: 'publish_post',
    description: 'Mark a post published so public routes, the sitemap, and RSS can include ready translations.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, slug: { type: 'string' } } },
    async run(env, args) {
      const post = await requirePost(env, args)
      await setPostStatus(env.DB, post.id, 'published')
      return { id: post.id, slug: post.slug, status: 'published' }
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
    description: 'Read template, layout, brand, site meta, and share link settings.',
    inputSchema: {
      type: 'object',
      properties: { section: { type: 'string', enum: ['template', 'layout', 'meta', 'share', 'brand', 'all'] } },
    },
    async run(env, args) {
      const config = await loadConfig(env.DB)
      const section = str(args.section) || 'all'
      if (section === 'all') return config
      if (section === 'template' || section === 'layout' || section === 'meta' || section === 'share' || section === 'brand') {
        return { [section]: config[section] }
      }
      throw new Error('Unknown settings section')
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
    description: 'Set width, header, home list style, and whether author, tags, share, and kicker show.',
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
    description: 'Set site-wide description, title suffix, default Open Graph image, Twitter card, and robots.',
    inputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string' },
        titleSuffix: { type: 'string' },
        ogImage: { type: 'string' },
        twitterCard: { type: 'string', enum: ['summary', 'summary_large_image'] },
        robots: { type: 'string' },
      },
    },
    async run(env, args) {
      const current = await loadConfig(env.DB)
      const meta = parseSiteMeta({ ...current.meta, ...args })
      await saveSettings(env.DB, 'meta', meta)
      return meta
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
