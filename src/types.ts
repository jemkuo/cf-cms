import type { Channel, SiteConfig } from './config'

export const LANGS = ['zh', 'en', 'ja', 'es', 'ar'] as const
export type Lang = (typeof LANGS)[number]

export const CATEGORIES = ['engineering', 'notes', 'research'] as const
export type Category = (typeof CATEGORIES)[number]

export type Engine = 'human' | 'workers-ai' | 'fallback'
export type PostStatus = 'draft' | 'published'
export type PostVisibility = 'draft' | 'scheduled' | 'live'

export type Env = {
  DB: D1Database
  MEDIA: R2Bucket
  AI?: Ai
  SITE_URL?: string
  SITE_NAME?: string
  SITE_X?: string
  DEFAULT_AUTHOR?: string
  ADMIN_PASSWORD?: string
  ADMIN_API_TOKEN?: string
  ADMIN_SAFEPATH?: string
  SESSION_SECRET?: string
  CF_ACCESS_TEAM_DOMAIN?: string
  CF_ACCESS_AUD?: string
  AI_MODEL?: string
  AI_MT_MODEL?: string
}

export type AppEnv = {
  Bindings: Env
  Variables: {
    nonce: string
    settings: SiteConfig
    channels: Channel[]
  }
}

export type PostMeta = {
  noindex: boolean
  canonical: string
  keywords: string
  ogImage: string
}

export type Faq = { q: string; a: string }
export type Tag = { slug: string; name: string }

export type PostCard = {
  id: string
  slug: string
  category: string
  coverKey: string | null
  authorName: string
  authorX: string
  publishedAt: string
  updatedAt: string
  sourceLang: Lang
  title: string
  description: string
  summary: string
  lang: Lang
  minutes: number
  tags: Tag[]
  langs: Lang[]
}

export type Article = PostCard & {
  bodyHtml: string
  faq: Faq[]
  shareText: string
  hasXEmbed: boolean
  meta: PostMeta
}

export type AdminTranslation = {
  lang: Lang
  title: string
  description: string
  summary: string
  body: string
  faq: Faq[]
  shareText: string
  keywords: string
  ogImage: string
  error: string
  engine: Engine
  ready: boolean
  locked: boolean
  updatedAt: string
}

export type TranslationJob = {
  id: string
  postId: string
  lang: Lang
  status: string
  error: string
  cursor: number
  attempts: number
  updatedAt: string
}

export type AdminPost = {
  id: string
  slug: string
  status: PostStatus
  category: string
  coverKey: string | null
  authorName: string
  authorX: string
  sourceLang: Lang
  translateNote: string
  meta: PostMeta
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  tags: { slug: string; names: Partial<Record<Lang, string>> }[]
  translations: AdminTranslation[]
  translationJobs: TranslationJob[]
}

export type AdminListItem = {
  id: string
  slug: string
  status: PostStatus
  sourceLang: Lang
  updatedAt: string
  publishedAt: string | null
  visibility: PostVisibility
  title: string
  translateNote: string
  langs: { lang: Lang; ready: boolean; engine: Engine }[]
}

export type SaveTranslation = {
  lang: Lang
  title: string
  description: string
  summary: string
  body: string
  faq: Faq[]
  shareText: string
  keywords: string
  ogImage: string
  error: string
  engine: Engine
  ready: boolean
  locked: boolean
}

export type SavePostInput = {
  id: string
  slug: string
  status: PostStatus
  category: string
  coverKey: string | null
  authorName: string
  authorX: string
  sourceLang: Lang
  publishedAt: string | null
  meta: PostMeta
  createdAt: string
  updatedAt: string
  tags: { slug: string; name?: string }[]
  translations: SaveTranslation[]
  deleteLangs: Lang[]
}
