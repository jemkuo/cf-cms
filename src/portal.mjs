// Public route set for blog presets vs the harbor and forge portals.
// Blog home is a post list. Portal home is a landing page filled by sections.

export const PORTAL_NAV = {
  zh: { home: '首页', services: '服务', products: '产品', about: '关于', insights: '洞察', news: '新闻', contact: '联系' },
  en: { home: 'Home', services: 'Services', products: 'Products', about: 'About', insights: 'Insights', news: 'News', contact: 'Contact' },
  ja: { home: 'ホーム', services: 'サービス', products: '製品', about: '概要', insights: '洞察', news: 'ニュース', contact: '連絡' },
  es: { home: 'Inicio', services: 'Servicios', products: 'Productos', about: 'Acerca de', insights: 'Ideas', news: 'Noticias', contact: 'Contacto' },
  ar: { home: 'الرئيسية', services: 'الخدمات', products: 'المنتجات', about: 'حول', insights: 'رؤى', news: 'الأخبار', contact: 'اتصال' },
}

const BLOG_ROUTES = ['home', 'about', 'posts', 'tags', 'topics']

export function templateMode(preset) {
  return preset && preset.mode === 'portal' ? 'portal' : 'blog'
}

export function publicRoutes(preset) {
  if (templateMode(preset) !== 'portal') return [...BLOG_ROUTES]
  const shared = ['home', 'about', 'posts', 'tags', 'topics', 'contact']
  if (preset.sectionSchema === 'industrial' || preset.id === 'forge') return [...shared, 'products', 'news']
  return [...shared, 'services', 'insights']
}

export function routeAllowed(preset, route) {
  return publicRoutes(preset).includes(route)
}

export function homeKind(preset) {
  return templateMode(preset) === 'portal' ? 'landing' : 'posts'
}
