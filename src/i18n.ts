import type { Category, Lang } from './types'

export type LangMeta = {
  code: Lang
  hreflang: string
  htmlLang: string
  dir: 'ltr' | 'rtl'
  label: string
  short: string
  ogLocale: string
}

export const LANG_META: Record<Lang, LangMeta> = {
  zh: { code: 'zh', hreflang: 'zh-CN', htmlLang: 'zh-CN', dir: 'ltr', label: '中文', short: '中文', ogLocale: 'zh_CN' },
  en: { code: 'en', hreflang: 'en', htmlLang: 'en', dir: 'ltr', label: 'English', short: 'EN', ogLocale: 'en_US' },
  ja: { code: 'ja', hreflang: 'ja', htmlLang: 'ja', dir: 'ltr', label: '日本語', short: 'JA', ogLocale: 'ja_JP' },
  es: { code: 'es', hreflang: 'es', htmlLang: 'es', dir: 'ltr', label: 'Español', short: 'ES', ogLocale: 'es_ES' },
  ar: { code: 'ar', hreflang: 'ar', htmlLang: 'ar', dir: 'rtl', label: 'العربية', short: 'ع', ogLocale: 'ar_AR' },
}

const DATE_LOCALE: Record<Lang, string> = {
  zh: 'zh-CN',
  en: 'en',
  ja: 'ja',
  es: 'es',
  ar: 'ar-u-nu-latn',
}

export function formatDate(iso: string, lang: Lang): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(DATE_LOCALE[lang], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

type Copy = {
  tagline: string
  description: string
  writing: string
  about: string
  menu: string
  faq: string
  share: string
  copyLink: string
  copied: string
  minRead: (n: number) => string
  translatedFrom: (name: string) => string
  emptyTitle: string
  emptyBody: string
  notFoundTitle: string
  notFoundBody: string
  backHome: string
  prev: string
  next: string
  page: (n: number) => string
  aboutTitle: string
  aboutBody: string[]
  footer: string
  langNames: Record<Lang, string>
  categories: Record<Category, string>
  rss: string
  skip: string
  breadcrumb: string
  theme: string
  pager: string
  viewOnX: string
  tagsLabel: string
  schemaTitle: string
  schemaBody: string
  kicker: string
}

export const COPY: Record<Lang, Copy> = {
  zh: {
    tagline: '写给把模型放到边缘的人',
    description: '一份关于边缘推理与小团队工程的技术博客。文章以一种语言写成，发布为中文、英文、日文、西班牙文和阿拉伯文。',
    writing: '文章',
    about: '关于',
    menu: '菜单',
    faq: '常见问题',
    share: '分享到 X',
    copyLink: '复制链接',
    copied: '已复制',
    minRead: (n) => `${n} 分钟阅读`,
    translatedFrom: (name) => `译自${name}`,
    emptyTitle: '这里还没有文章',
    emptyBody: '发布之后，这篇列表会出现译文。',
    notFoundTitle: '这篇不在架上',
    notFoundBody: '链接可能写错了，或者这篇文章还是草稿。',
    backHome: '回到首页',
    prev: '上一页',
    next: '下一页',
    page: (n) => `第 ${n} 页`,
    aboutTitle: '关于这个站点',
    aboutBody: [
      '这是一份技术笔记，写边缘上的推理、Cloudflare Workers，以及小团队如何把事情做完。',
      '文章默认用简体中文写。发布时，Workers AI 会生成英文、日文、西班牙文和阿拉伯文译文，并保存在数据库里。译文可以改；锁定之后，下一次生成不会覆盖它。',
      '阿拉伯文页面从右向左排版。导航、列表和引用线沿书写方向翻转，代码块始终从左向右。',
      '讨论可以发生在 X 上。每篇文章准备一句分享文案，正文里也可以嵌入一条公开帖。',
    ],
    footer: '写在边缘上的笔记。',
    langNames: { zh: '中文', en: '英语', ja: '日语', es: '西班牙语', ar: '阿拉伯语' },
    categories: { engineering: '工程', notes: '笔记', research: '研究' },
    rss: '订阅',
    skip: '跳到正文',
    breadcrumb: '面包屑',
    theme: '外观',
    pager: '翻页',
    viewOnX: '在 X 上查看这条帖',
    tagsLabel: '标签',
    schemaTitle: '数据库还没有准备好',
    schemaBody: '在项目目录运行 npm run db:setup，然后刷新。',
    kicker: 'AI · SYSTEMS · NOTES',
  },
  en: {
    tagline: 'Notes for people who put models at the edge',
    description: 'A technical blog about Workers, inference, and small-team engineering. Posts are written in one language and published in Chinese, English, Japanese, Spanish, and Arabic.',
    writing: 'Writing',
    about: 'About',
    menu: 'Menu',
    faq: 'Questions',
    share: 'Share on X',
    copyLink: 'Copy link',
    copied: 'Copied',
    minRead: (n) => `${n} min read`,
    translatedFrom: (name) => `Translated from ${name}`,
    emptyTitle: 'Nothing on this shelf yet',
    emptyBody: 'Published translations will show up here.',
    notFoundTitle: 'This page is not on the shelf',
    notFoundBody: 'The link may be wrong, or the post is still a draft.',
    backHome: 'Back home',
    prev: 'Newer',
    next: 'Older',
    page: (n) => `Page ${n}`,
    aboutTitle: 'About this site',
    aboutBody: [
      'This is a technical notebook about inference at the edge, Cloudflare Workers, and how small teams finish the work.',
      'A post is written in one language. On publish, Workers AI drafts English, Japanese, Spanish, and Arabic, and stores each draft in the database. You can edit a translation and lock it so the next run leaves it alone.',
      'Arabic pages run right to left. Navigation, lists, and quotation rules follow the inline direction. Code stays left to right.',
      'Conversation can happen on X. Each post keeps a short share line, and the body can embed a public post.',
    ],
    footer: 'Notes written at the edge.',
    langNames: { zh: 'Chinese', en: 'English', ja: 'Japanese', es: 'Spanish', ar: 'Arabic' },
    categories: { engineering: 'Engineering', notes: 'Notes', research: 'Research' },
    rss: 'RSS',
    skip: 'Skip to content',
    breadcrumb: 'Breadcrumb',
    theme: 'Theme',
    pager: 'Pagination',
    viewOnX: 'View this post on X',
    tagsLabel: 'Tags',
    schemaTitle: 'The database is not ready',
    schemaBody: 'Run npm run db:setup in the project directory, then reload.',
    kicker: 'AI · SYSTEMS · NOTES',
  },
  ja: {
    tagline: 'モデルをエッジに置く人のためのノート',
    description: 'Workers、推論、少人数のエンジニアリングについての技術ブログです。記事は一つの言語で書き、中国語・英語・日本語・スペイン語・アラビア語で公開します。',
    writing: '記事',
    about: 'このサイト',
    menu: 'メニュー',
    faq: '質問',
    share: 'X で共有',
    copyLink: 'リンクをコピー',
    copied: 'コピーしました',
    minRead: (n) => `${n} 分で読めます`,
    translatedFrom: (name) => `${name}からの翻訳`,
    emptyTitle: 'まだ文章がありません',
    emptyBody: '公開された翻訳がここに並びます。',
    notFoundTitle: 'このページはありません',
    notFoundBody: 'リンクが違うか、記事がまだ下書きです。',
    backHome: 'ホームへ戻る',
    prev: '新しいページ',
    next: '古いページ',
    page: (n) => `${n} ページ`,
    aboutTitle: 'このサイトについて',
    aboutBody: [
      'エッジ上の推論、Cloudflare Workers、少人数のチームが仕事を終える方法を書く技術ノートです。',
      '記事は一つの言語で書きます。公開時に Workers AI が英語、日本語、スペイン語、アラビア語の下書きを作り、データベースに保存します。訳文は編集でき、ロックした言語は次の生成で上書きされません。',
      'アラビア語のページは右から左へ組版します。ナビゲーション、リスト、引用線は行の方向に沿い、コードは左から右のままです。',
      '議論は X でも起きます。各記事には共有用の短文があり、本文に公開投稿を埋め込めます。',
    ],
    footer: 'エッジに書いたノート。',
    langNames: { zh: '中国語', en: '英語', ja: '日本語', es: 'スペイン語', ar: 'アラビア語' },
    categories: { engineering: 'エンジニアリング', notes: 'ノート', research: '研究' },
    rss: 'RSS',
    skip: '本文へ',
    breadcrumb: 'パンくず',
    theme: '表示',
    pager: 'ページ',
    viewOnX: 'X でこの投稿を見る',
    tagsLabel: 'タグ',
    schemaTitle: 'データベースの準備ができていません',
    schemaBody: 'プロジェクトで npm run db:setup を実行してから、再読み込みしてください。',
    kicker: 'AI · SYSTEMS · NOTES',
  },
  es: {
    tagline: 'Notas para quien pone los modelos en el borde',
    description: 'Un blog técnico sobre Workers, inferencia e ingeniería de equipos pequeños. Los textos se escriben en un idioma y se publican en chino, inglés, japonés, español y árabe.',
    writing: 'Textos',
    about: 'Acerca de',
    menu: 'Menú',
    faq: 'Preguntas',
    share: 'Compartir en X',
    copyLink: 'Copiar enlace',
    copied: 'Copiado',
    minRead: (n) => `${n} min de lectura`,
    translatedFrom: (name) => `Traducido del ${name}`,
    emptyTitle: 'Aquí todavía no hay textos',
    emptyBody: 'Las traducciones publicadas aparecerán en esta lista.',
    notFoundTitle: 'Esta página no está',
    notFoundBody: 'El enlace puede estar mal, o el texto sigue en borrador.',
    backHome: 'Volver al inicio',
    prev: 'Más nuevos',
    next: 'Más antiguos',
    page: (n) => `Página ${n}`,
    aboutTitle: 'Acerca de este sitio',
    aboutBody: [
      'Un cuaderno técnico sobre inferencia en el borde, Cloudflare Workers y cómo los equipos pequeños terminan el trabajo.',
      'Un texto se escribe en un idioma. Al publicarlo, Workers AI prepara borradores en inglés, japonés, español y árabe, y los guarda en la base de datos. La traducción se puede editar y bloquear para que la siguiente pasada no la pise.',
      'Las páginas en árabe se leen de derecha a izquierda. La navegación, las listas y las citas siguen esa dirección. El código permanece de izquierda a derecha.',
      'La conversación también puede ocurrir en X. Cada texto guarda una frase para compartir, y el cuerpo puede incrustar una publicación pública.',
    ],
    footer: 'Notas escritas en el borde.',
    langNames: { zh: 'chino', en: 'inglés', ja: 'japonés', es: 'español', ar: 'árabe' },
    categories: { engineering: 'Ingeniería', notes: 'Notas', research: 'Investigación' },
    rss: 'RSS',
    skip: 'Saltar al contenido',
    breadcrumb: 'Migas',
    theme: 'Tema',
    pager: 'Paginación',
    viewOnX: 'Ver esta publicación en X',
    tagsLabel: 'Etiquetas',
    schemaTitle: 'La base de datos no está lista',
    schemaBody: 'Ejecuta npm run db:setup en el proyecto y vuelve a cargar.',
    kicker: 'AI · SYSTEMS · NOTES',
  },
  ar: {
    tagline: 'ملاحظات لمن يضع النماذج على الحافة',
    description: 'مدونة تقنية عن Workers والاستدلال وهندسة الفرق الصغيرة. تُكتب المقالة بلغة واحدة وتُنشر بالصينية والإنجليزية واليابانية والإسبانية والعربية.',
    writing: 'الكتابة',
    about: 'حول',
    menu: 'القائمة',
    faq: 'أسئلة',
    share: 'شارك على X',
    copyLink: 'انسخ الرابط',
    copied: 'تم النسخ',
    minRead: (n) => `${n} دقائق قراءة`,
    translatedFrom: (name) => `مترجم من ${name}`,
    emptyTitle: 'لا مقالات هنا بعد',
    emptyBody: 'ستظهر الترجمات المنشورة في هذه القائمة.',
    notFoundTitle: 'هذه الصفحة غير موجودة',
    notFoundBody: 'قد يكون الرابط خاطئًا، أو أن المقالة ما زالت مسودة.',
    backHome: 'العودة إلى البداية',
    prev: 'الأحدث',
    next: 'الأقدم',
    page: (n) => `صفحة ${n}`,
    aboutTitle: 'حول هذا الموقع',
    aboutBody: [
      'دفتر تقني عن الاستدلال على الحافة، وCloudflare Workers، وكيف تنهي الفرق الصغيرة العمل.',
      'تُكتب المقالة بلغة واحدة. عند النشر، يجهّز Workers AI مسودات بالإنجليزية واليابانية والإسبانية والعربية ويحفظها في قاعدة البيانات. يمكن تعديل الترجمة وقفلتها حتى لا تستبدلها الجولة التالية.',
      'صفحات العربية من اليمين إلى اليسار. التنقل والقوائم وخطوط الاقتباس تتبع اتجاه السطر. تبقى الشيفرة من اليسار إلى اليمين.',
      'يمكن أن يجري النقاش على X. كل مقالة تحتفظ بجملة للمشاركة، ويمكن تضمين منشور علني داخل المتن.',
    ],
    footer: 'ملاحظات كُتبت على الحافة.',
    langNames: { zh: 'الصينية', en: 'الإنجليزية', ja: 'اليابانية', es: 'الإسبانية', ar: 'العربية' },
    categories: { engineering: 'هندسة', notes: 'ملاحظات', research: 'بحث' },
    rss: 'RSS',
    skip: 'تخطي إلى المحتوى',
    breadcrumb: 'مسار التنقل',
    theme: 'المظهر',
    pager: 'الصفحات',
    viewOnX: 'عرض هذه التغريدة على X',
    tagsLabel: 'الوسوم',
    schemaTitle: 'قاعدة البيانات غير جاهزة',
    schemaBody: 'شغّل npm run db:setup في مجلد المشروع ثم أعد التحميل.',
    kicker: 'AI · SYSTEMS · NOTES',
  },
}

export function copy(lang: Lang): Copy {
  return COPY[lang]
}
