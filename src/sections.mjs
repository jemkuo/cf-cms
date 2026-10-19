// Portal landing sections, stored as the `sections` settings key. No pages table.
// harbor uses schema `saas`. forge uses schema `industrial`.
// About stays in site_copy. Insights and news are posts.
// An empty store falls back to the built-in demo copy. "" or null clears a field.

export const SECTION_LANGS = ['zh', 'en', 'ja', 'es', 'ar']

export const SAAS_FIELDS = ['hero', 'trust', 'capabilities', 'stats', 'cta', 'team', 'why', 'contact']
export const INDUSTRIAL_FIELDS = ['hero', 'trust', 'productLines', 'stats', 'cta', 'capabilities', 'contact']

const FIELDS = { saas: SAAS_FIELDS, industrial: INDUSTRIAL_FIELDS }

const HERO_FIELDS = {
  eyebrow: 80,
  title: 160,
  lede: 400,
  primaryLabel: 40,
  primaryHref: 240,
  secondaryLabel: 40,
  secondaryHref: 240,
  badgeTitle: 40,
  badgeText: 160,
  image: 240,
}
const CARD_FIELDS = {
  icon: 8,
  tag: 40,
  title: 120,
  body: 400,
  href: 240,
  more: 40,
  image: 240,
}
const CTA_FIELDS = { eyebrow: 80, title: 160, body: 400, label: 40, href: 240 }
const WHY_FIELDS = { eyebrow: 80, title: 160, body: 400, label: 40, href: 240, image: 240 }
const CONTACT_FIELDS = { eyebrow: 80, title: 160, lede: 400, email: 120, address: 200, note: 400 }
const HREF_KEYS = new Set(['primaryHref', 'secondaryHref', 'href'])
const IMAGE_KEYS = new Set(['image'])

export function emptySections() {
  return {}
}

export function sectionSchemaOf(preset) {
  return preset && (preset.sectionSchema === 'saas' || preset.sectionSchema === 'industrial') ? preset.sectionSchema : ''
}

export function sectionsResetNeeded(previous, next) {
  return sectionSchemaOf(previous) !== sectionSchemaOf(next)
}

function oneLine(value, max) {
  const text = String(value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (text.length > max) return { ok: false, error: `Section text is longer than ${max} characters` }
  return { ok: true, value: text }
}

function cleanHref(value, max) {
  const parsed = oneLine(value, max)
  if (!parsed.ok || !parsed.value) return parsed
  if (/^\/[a-z0-9/_-]*$/i.test(parsed.value) || /^#[a-z0-9_-]+$/i.test(parsed.value)) return parsed
  return { ok: false, error: 'Section links must be site paths' }
}

function cleanImage(value, max) {
  const parsed = oneLine(value, max)
  if (!parsed.ok || !parsed.value) return parsed
  if (/^\/(?:themes|media)\/[a-z0-9._/-]+$/i.test(parsed.value)) return parsed
  return { ok: false, error: 'Section images must be /themes/ or /media/ paths' }
}

function cleanEmail(value, max) {
  const parsed = oneLine(value, max)
  if (!parsed.ok || !parsed.value) return parsed
  if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(parsed.value)) return parsed
  return { ok: false, error: 'Section contact email is not an email address' }
}

function assignFields(spec, input, base, label) {
  if (input === undefined) return { ok: true, value: base && Object.keys(base).length ? { ...base } : undefined }
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: `${label} must be an object` }
  }
  const out = { ...(base || {}) }
  for (const key of Object.keys(input)) {
    if (!Object.prototype.hasOwnProperty.call(spec, key)) return { ok: false, error: `Unknown ${label} field: ${key}` }
    if (input[key] === '' || input[key] === null) {
      delete out[key]
      continue
    }
    if (typeof input[key] !== 'string') return { ok: false, error: `${label}.${key} must be a string` }
    const parsed = HREF_KEYS.has(key)
      ? cleanHref(input[key], spec[key])
      : IMAGE_KEYS.has(key)
        ? cleanImage(input[key], spec[key])
        : key === 'email'
          ? cleanEmail(input[key], spec[key])
          : oneLine(input[key], spec[key])
    if (!parsed.ok) return parsed
    if (parsed.value) out[key] = parsed.value
    else delete out[key]
  }
  return { ok: true, value: Object.keys(out).length ? out : undefined }
}

function parseStringList(input, label, itemMax) {
  if (!Array.isArray(input)) return { ok: false, error: `${label} must be an array of strings` }
  if (input.length > 12) return { ok: false, error: `${label} has more than 12 items` }
  const items = []
  for (const item of input) {
    if (typeof item !== 'string') return { ok: false, error: `${label} items must be strings` }
    const parsed = oneLine(item, itemMax)
    if (!parsed.ok) return parsed
    if (parsed.value) items.push(parsed.value)
  }
  return { ok: true, value: items }
}

function parseTrust(input, base) {
  if (Array.isArray(input)) {
    const items = parseStringList(input, 'trust', 80)
    if (!items.ok) return items
    const out = { ...(base || {}) }
    if (items.value.length) out.items = items.value
    else delete out.items
    return { ok: true, value: Object.keys(out).length ? out : undefined }
  }
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'trust must be an object or an array of strings' }
  for (const key of Object.keys(input)) {
    if (key !== 'label' && key !== 'items') return { ok: false, error: `Unknown trust field: ${key}` }
  }
  const out = { ...(base || {}) }
  if (input.label === '' || input.label === null) delete out.label
  else if (input.label !== undefined) {
    if (typeof input.label !== 'string') return { ok: false, error: 'trust.label must be a string' }
    const label = oneLine(input.label, 80)
    if (!label.ok) return label
    if (label.value) out.label = label.value
    else delete out.label
  }
  if (input.items === null) delete out.items
  else if (input.items !== undefined) {
    const items = parseStringList(input.items, 'trust.items', 80)
    if (!items.ok) return items
    if (items.value.length) out.items = items.value
    else delete out.items
  }
  return { ok: true, value: Object.keys(out).length ? out : undefined }
}

function parseCards(input, label) {
  if (!Array.isArray(input)) return { ok: false, error: `${label} must be an array` }
  if (input.length > 12) return { ok: false, error: `${label} has more than 12 items` }
  const cards = []
  for (const item of input) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return { ok: false, error: `${label} items must be objects` }
    const rest = { ...item }
    const rawPoints = rest.points
    delete rest.points
    const parsed = assignFields(CARD_FIELDS, rest, {}, label)
    if (!parsed.ok) return parsed
    let points
    if (rawPoints !== undefined && rawPoints !== null) {
      const list = parseStringList(rawPoints, `${label}.points`, 160)
      if (!list.ok) return list
      if (list.value.length > 8) return { ok: false, error: `${label}.points has more than 8 items` }
      if (list.value.length) points = list.value
    }
    if (!parsed.value && !points) continue
    cards.push({ ...(parsed.value || {}), ...(points ? { points } : {}) })
  }
  return { ok: true, value: cards.length ? cards : undefined }
}

function parseStats(input) {
  if (!Array.isArray(input)) return { ok: false, error: 'stats must be an array' }
  if (input.length > 8) return { ok: false, error: 'stats has more than 8 items' }
  const stats = []
  for (const item of input) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return { ok: false, error: 'stats items must be objects' }
    for (const key of Object.keys(item)) {
      if (key !== 'value' && key !== 'label') return { ok: false, error: `Unknown stats field: ${key}` }
    }
    const value = item.value === undefined || item.value === null ? { ok: true, value: '' } : oneLine(item.value, 24)
    const label = item.label === undefined || item.label === null ? { ok: true, value: '' } : oneLine(item.label, 80)
    if (!value.ok) return value
    if (!label.ok) return label
    if (value.value || label.value) stats.push({ value: value.value, label: label.value })
  }
  return { ok: true, value: stats.length ? stats : undefined }
}

function parseTeam(input) {
  if (!Array.isArray(input)) return { ok: false, error: 'team must be an array' }
  if (input.length > 12) return { ok: false, error: 'team has more than 12 items' }
  const team = []
  for (const item of input) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return { ok: false, error: 'team items must be objects' }
    for (const key of Object.keys(item)) {
      if (key !== 'name' && key !== 'role') return { ok: false, error: `Unknown team field: ${key}` }
    }
    const name = item.name ? oneLine(item.name, 80) : { ok: true, value: '' }
    const role = item.role ? oneLine(item.role, 80) : { ok: true, value: '' }
    if (!name.ok) return name
    if (!role.ok) return role
    if (name.value || role.value) team.push({ name: name.value, role: role.value })
  }
  return { ok: true, value: team.length ? team : undefined }
}

function parseWhy(input, base) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'why must be an object' }
  }
  const rest = { ...input }
  const rawPoints = rest.points
  delete rest.points
  const parsed = assignFields(WHY_FIELDS, rest, base, 'why')
  if (!parsed.ok) return parsed
  const out = parsed.value ? { ...parsed.value } : {}
  if (rawPoints === null || rawPoints === '') delete out.points
  else if (rawPoints !== undefined) {
    const points = parseStringList(rawPoints, 'why.points', 160)
    if (!points.ok) return points
    if (points.value.length > 8) return { ok: false, error: 'why.points has more than 8 items' }
    if (points.value.length) out.points = points.value
    else delete out.points
  }
  return { ok: true, value: Object.keys(out).length ? out : undefined }
}

function parseKey(key, input, base) {
  if (key === 'hero') return assignFields(HERO_FIELDS, input, base, 'hero')
  if (key === 'trust') return parseTrust(input, base)
  if (key === 'capabilities' || key === 'productLines') return parseCards(input, key)
  if (key === 'stats') return parseStats(input)
  if (key === 'cta') return assignFields(CTA_FIELDS, input, base, 'cta')
  if (key === 'team') return parseTeam(input)
  if (key === 'why') return parseWhy(input, base)
  if (key === 'contact') return assignFields(CONTACT_FIELDS, input, base, 'contact')
  return { ok: false, error: `Unknown sections field: ${key}` }
}

function parseLocale(schema, input, base) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'sections locale must be an object' }
  }
  const allowed = FIELDS[schema]
  const out = { ...(base || {}) }
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) return { ok: false, error: `Unknown sections field: ${key}` }
    if (input[key] === null) {
      delete out[key]
      continue
    }
    const parsed = parseKey(key, input[key], out[key])
    if (!parsed.ok) return parsed
    if (parsed.value === undefined) delete out[key]
    else out[key] = parsed.value
  }
  return { ok: true, value: out }
}

export function parseSections(input) {
  if (input === undefined || input === null) return { ok: true, value: {} }
  if (typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'sections must be an object' }
  const keys = Object.keys(input)
  if (!keys.length) return { ok: true, value: {} }
  for (const key of keys) {
    if (key !== 'schema' && key !== 'locales') return { ok: false, error: `Unknown sections field: ${key}` }
  }
  if (input.schema !== 'saas' && input.schema !== 'industrial') {
    return { ok: false, error: 'sections.schema must be saas or industrial' }
  }
  const locales = {}
  const raw = input.locales === undefined || input.locales === null ? {} : input.locales
  if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'sections.locales must be an object' }
  for (const lang of Object.keys(raw)) {
    if (!SECTION_LANGS.includes(lang)) return { ok: false, error: `Unknown sections language: ${lang}` }
    if (raw[lang] === null) continue
    const parsed = parseLocale(input.schema, raw[lang], {})
    if (!parsed.ok) return parsed
    if (Object.keys(parsed.value).length) locales[lang] = parsed.value
  }
  return { ok: true, value: { schema: input.schema, locales } }
}

export function readSections(input) {
  const parsed = parseSections(input)
  return parsed.ok ? parsed.value : emptySections()
}

export function mergeSections(current, patch, schema, replace) {
  if (schema !== 'saas' && schema !== 'industrial') {
    return { ok: false, error: 'Sections are available on portal templates harbor and forge.' }
  }
  const stored = readSections(current)
  const base = !replace && stored.schema === schema ? { ...(stored.locales || {}) } : {}
  if (patch === undefined) return { ok: true, value: { schema, locales: base } }
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    return { ok: false, error: 'sections patch must be an object' }
  }
  const bag = patch.locales && typeof patch.locales === 'object' && !Array.isArray(patch.locales) ? patch.locales : patch
  if (bag.schema !== undefined || bag.locales !== undefined) {
    return { ok: false, error: 'Pass locales keyed by language. The schema comes from the active template.' }
  }
  const locales = { ...base }
  for (const lang of Object.keys(bag)) {
    if (!SECTION_LANGS.includes(lang)) return { ok: false, error: `Unknown sections language: ${lang}` }
    if (bag[lang] === null) {
      delete locales[lang]
      continue
    }
    const parsed = parseLocale(schema, bag[lang], locales[lang] || {})
    if (!parsed.ok) return parsed
    if (Object.keys(parsed.value).length) locales[lang] = parsed.value
    else delete locales[lang]
  }
  return { ok: true, value: { schema, locales } }
}

function hero(partial) {
  return {
    eyebrow: '',
    title: '',
    lede: '',
    primaryLabel: '',
    primaryHref: '',
    secondaryLabel: '',
    secondaryHref: '',
    badgeTitle: '',
    badgeText: '',
    image: '',
    ...partial,
  }
}

function cta(partial) {
  return { eyebrow: '', title: '', body: '', label: '', href: '/contact', ...partial }
}

function why(partial) {
  return { eyebrow: '', title: '', body: '', label: '', href: '/about', image: '', points: [], ...partial }
}

function contact(partial) {
  return { eyebrow: '', title: '', lede: '', email: '', address: '', note: '', ...partial }
}

const SAAS_EN = {
  hero: hero({
    eyebrow: 'Cloud · automation · data',
    title: 'Weave infrastructure into a product you can ship',
    lede: 'Weaveshore is a fictional studio. This harbor portal shows a dark SaaS landing: services, insights, and a contact page that does not send mail.',
    primaryLabel: 'Book a diagnostic',
    primaryHref: '/contact',
    secondaryLabel: 'View services',
    secondaryHref: '/services',
    badgeTitle: 'Edge first',
    badgeText: 'Pages, D1, R2, and Workers AI as one delivery',
    image: '/themes/harbor/hero.jpg',
  }),
  trust: { label: 'Teams shipping on the edge', items: ['Product', 'Platform', 'Data', 'Support', 'Studios'] },
  capabilities: [
    { icon: '☁', tag: 'Cloud', title: 'Cloud launch', body: 'Account, Pages, D1, R2, and a public URL. Secrets stay in the environment.', href: '/services', more: 'Cloud launch' },
    { icon: '⚡', tag: 'AI', title: 'Automation', body: 'Publishing, translation, and brand copy through MCP, with a human review step.', href: '/services', more: 'Automation' },
    { icon: '◎', tag: 'Data', title: 'Dashboards', body: 'Traffic, publishes, and translation cost gathered into a weekly note.', href: '/services', more: 'Dashboards' },
  ],
  stats: [
    { value: '99.9%', label: 'Edge availability target' },
    { value: '5', label: 'Languages published together' },
    { value: '0', label: 'Servers to rent' },
  ],
  cta: cta({ eyebrow: 'Next', title: 'Start with a short diagnostic', body: 'Tell us which surface should go live first.', label: 'Contact', href: '/contact' }),
  team: [
    { name: 'Platform', role: 'Edge delivery' },
    { name: 'Content', role: 'Five-language publishing' },
  ],
  why: why({
    eyebrow: 'Why a portal',
    title: 'A landing page is not a post list',
    body: 'Services, about, insights, and contact are routes. Insights are posts. About stays in site copy.',
    points: ['Fixed routes, no pages table', 'Sections JSON per language', 'Posts stay on the publish gate'],
    label: 'About the team',
    href: '/about',
    image: '/themes/harbor/office.jpg',
  }),
  contact: contact({
    eyebrow: 'Contact',
    title: 'Book a conversation',
    lede: 'This demo form does not send mail or store what you type.',
    email: 'hello@weaveshore.example',
    address: 'Harbor district, demo only',
    note: 'Use an address on the .example domain in sample recipes.',
  }),
}

const SAAS_ZH = {
  hero: hero({
    eyebrow: '科技服务 · 云与 AI',
    title: '把复杂基础设施织成可上线的产品',
    lede: '织岸科技是虚构工作室。harbor 门户用来演示深色 SaaS 落地页：服务、洞察，以及一个不会发信的联系页。',
    primaryLabel: '预约诊断',
    primaryHref: '/contact',
    secondaryLabel: '查看服务',
    secondaryHref: '/services',
    badgeTitle: '边缘优先',
    badgeText: 'Pages、D1、R2、Workers AI 一起交付',
    image: '/themes/harbor/hero.jpg',
  }),
  trust: { label: '在边缘上线的团队', items: ['产品', '平台', '数据', '支持', '工作室'] },
  capabilities: [
    { icon: '☁', tag: '云', title: '云上线', body: '账号、Pages、D1、R2 和公开地址。密钥只留在环境变量里。', href: '/services', more: '了解云上线' },
    { icon: '⚡', tag: 'AI', title: '自动化', body: '发布、翻译和品牌文案走 MCP，人审步骤可以留下。', href: '/services', more: '了解自动化' },
    { icon: '◎', tag: '数据', title: '看板', body: '把流量、发布次数和翻译成本收成一张周报。', href: '/services', more: '了解看板' },
  ],
  stats: [
    { value: '99.9%', label: '边缘可用性目标' },
    { value: '5', label: '种语言一起发布' },
    { value: '0', label: '台需要自备的服务器' },
  ],
  cta: cta({ eyebrow: '下一步', title: '从一次短诊断开始', body: '先说哪一块表面应该先上线。', label: '联系', href: '/contact' }),
  team: [
    { name: '平台', role: '边缘交付' },
    { name: '内容', role: '五种语言发布' },
  ],
  why: why({
    eyebrow: '为什么用门户',
    title: '落地页不是文章列表',
    body: '服务、关于、洞察和联系是固定路由。洞察是文章。关于留在站点文案里。',
    points: ['固定路由，没有页面表', '每种语言一份区块 JSON', '文章仍走发布门禁'],
    label: '关于团队',
    href: '/about',
    image: '/themes/harbor/office.jpg',
  }),
  contact: contact({
    eyebrow: '联系',
    title: '预约一次谈话',
    lede: '这个演示表单不会发信，也不会保存你输入的内容。',
    email: 'hello@weaveshore.example',
    address: '港区，仅作演示',
    note: '示例配方里的邮箱请用 .example 域名。',
  }),
}

const INDUSTRIAL_EN = {
  hero: hero({
    eyebrow: 'Precision drive · industrial supply',
    title: 'Housings, shafts, and short-run machining',
    lede: 'Ridgport is a fictional machinery works. This forge portal shows a light industrial landing: products, news, and a contact page that does not send mail.',
    primaryLabel: 'Browse products',
    primaryHref: '/products',
    secondaryLabel: 'Request a sample',
    secondaryHref: '/contact',
    badgeTitle: 'Shop floor',
    badgeText: 'CNC, inspection, and flexible short runs',
    image: '/themes/forge/hero-cnc.jpg',
  }),
  trust: { label: 'Lines we supply', items: ['OEM', 'Packaging', 'Logistics', 'Energy', 'Fixtures'] },
  productLines: [
    { tag: 'Drive', title: 'Gearbox housings', body: 'Cast and machined housings with a documented datum scheme.', href: '/products', more: 'Specifications', image: '/themes/forge/product-gearbox.svg' },
    { tag: 'Shafts', title: 'Shaft assemblies', body: 'Turned shafts, keys, and matched bearings for OEM lines.', href: '/products', more: 'Specifications', image: '/themes/forge/product-shafts.svg' },
    { tag: 'Machining', title: 'Short-run parts', body: 'Fixtures and one-off metal parts when the drawing is ready.', href: '/products', more: 'Process', image: '/themes/forge/product-metal.jpg' },
  ],
  stats: [
    { value: '15d', label: 'Short-run window' },
    { value: '3', label: 'Product lines' },
    { value: '1', label: 'Inspection pack' },
  ],
  cta: cta({ eyebrow: 'Samples', title: 'Ask for a sample pack', body: 'Drawings stay in your hands. This form does not upload files.', label: 'Contact', href: '/contact' }),
  capabilities: [
    { icon: '▣', tag: 'CNC', title: 'Machining', body: 'Boring, turning, and in-process probing.', href: '/products', more: 'Process' },
    { icon: '✓', tag: 'QA', title: 'Inspection', body: 'A short report set that travels with the lot.', href: '/products', more: 'Quality' },
  ],
  contact: contact({
    eyebrow: 'Contact',
    title: 'Request a sample',
    lede: 'This demo form does not send mail or store what you type.',
    email: 'sales@ridgport.example',
    address: 'Ridge plant, demo only',
    note: 'Use an address on the .example domain in sample recipes.',
  }),
}

const INDUSTRIAL_ZH = {
  hero: hero({
    eyebrow: '精密传动 · 工业配套',
    title: '箱体、轴系和小批量机加',
    lede: '砺港机械是虚构工厂。forge 门户用来演示浅色工业落地页：产品、新闻，以及一个不会发信的联系页。',
    primaryLabel: '浏览产品',
    primaryHref: '/products',
    secondaryLabel: '索取样本',
    secondaryHref: '/contact',
    badgeTitle: '车间',
    badgeText: '数控、检测、小批量柔性排产',
    image: '/themes/forge/hero-cnc.jpg',
  }),
  trust: { label: '配套的产线', items: ['装备 OEM', '包装', '物流', '能源', '工装'] },
  productLines: [
    { tag: '传动', title: '减速箱体', body: '铸造和加工箱体，基准方案写在工艺里。', href: '/products', more: '查看规格', image: '/themes/forge/product-gearbox.svg' },
    { tag: '轴系', title: '轴系组件', body: '车削轴、键和配套轴承，供 OEM 产线使用。', href: '/products', more: '查看规格', image: '/themes/forge/product-shafts.svg' },
    { tag: '机加', title: '小批量零件', body: '图纸齐了就可以做夹具和单件金属件。', href: '/products', more: '了解流程', image: '/themes/forge/product-metal.jpg' },
  ],
  stats: [
    { value: '15 日', label: '小批量窗口' },
    { value: '3', label: '条产品线' },
    { value: '1', label: '套检测交付' },
  ],
  cta: cta({ eyebrow: '样本', title: '索取一份样本说明', body: '图纸留在你手里。这个表单不上传文件。', label: '联系', href: '/contact' }),
  capabilities: [
    { icon: '▣', tag: '数控', title: '机加', body: '镗孔、车削和在机探针。', href: '/products', more: '流程' },
    { icon: '✓', tag: '质量', title: '检测', body: '随批次走的一页检测摘要。', href: '/products', more: '质量' },
  ],
  contact: contact({
    eyebrow: '联系',
    title: '索取样本',
    lede: '这个演示表单不会发信，也不会保存你输入的内容。',
    email: 'sales@ridgport.example',
    address: '岭厂，仅作演示',
    note: '示例配方里的邮箱请用 .example 域名。',
  }),
}

const DEFAULTS = {
  saas: { en: SAAS_EN, zh: SAAS_ZH },
  industrial: { en: INDUSTRIAL_EN, zh: INDUSTRIAL_ZH },
}

function overlay(base, saved) {
  if (!saved || typeof saved !== 'object') return base
  if (Array.isArray(base) || Array.isArray(saved)) return saved
  const out = { ...base }
  for (const [key, value] of Object.entries(saved)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
      out[key] = { ...out[key], ...value }
    } else {
      out[key] = value
    }
  }
  return out
}

function blank(schema) {
  return {
    schema: schema || '',
    hero: hero({}),
    trustLabel: '',
    trust: [],
    capabilities: [],
    productLines: [],
    stats: [],
    cta: cta({}),
    team: [],
    why: why({}),
    contact: contact({}),
  }
}

export function resolveSections(schema, stored, lang) {
  if (schema !== 'saas' && schema !== 'industrial') return blank(schema)
  const pack = DEFAULTS[schema]
  const fallback = pack[lang] || pack.en
  const row = readSections(stored)
  const saved = row.schema === schema && row.locales ? row.locales[lang] : null
  const merged = overlay(fallback, saved || {})
  return {
    schema,
    hero: hero(merged.hero || {}),
    trustLabel: merged.trust?.label || '',
    trust: Array.isArray(merged.trust?.items) ? merged.trust.items : [],
    capabilities: merged.capabilities || [],
    productLines: merged.productLines || [],
    stats: merged.stats || [],
    cta: cta(merged.cta || {}),
    team: merged.team || [],
    why: why(merged.why || {}),
    contact: contact(merged.contact || {}),
  }
}
