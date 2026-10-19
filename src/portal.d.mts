export type PortalRoute =
  | 'home'
  | 'about'
  | 'posts'
  | 'tags'
  | 'topics'
  | 'services'
  | 'products'
  | 'insights'
  | 'news'
  | 'contact'

export type PortalNav = {
  home: string
  services: string
  products: string
  about: string
  insights: string
  news: string
  contact: string
}

export type PortalPreset = {
  mode?: string
  id?: string
  sectionSchema?: string
} | null | undefined

export const PORTAL_NAV: Record<'zh' | 'en' | 'ja' | 'es' | 'ar', PortalNav>
export function templateMode(preset: PortalPreset): 'blog' | 'portal'
export function publicRoutes(preset: PortalPreset): PortalRoute[]
export function routeAllowed(preset: PortalPreset, route: string): boolean
export function homeKind(preset: PortalPreset): 'landing' | 'posts'
