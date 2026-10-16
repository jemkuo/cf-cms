export const TEMPLATE_IDS = [
  'paper',
  'ink',
  'terminal',
  'dispatch',
  'signal',
  'atelier',
  'hearth',
  'practice',
  'civic',
  'launch',
  'orbit',
] as const

export type TemplateId = (typeof TEMPLATE_IDS)[number]
export type Niche = 'kit' | 'tech-blog' | 'lifestyle' | 'business' | 'tech-company'
export type MarkShape = 'square' | 'rounded' | 'bars' | 'circle' | 'ring' | 'shield' | 'pill' | 'slash'

export type TemplatePreset = {
  id: TemplateId
  label: string
  niche: Niche
  nicheLabel: string
  reference: string
  blurb: string
  accent: 'vermilion' | 'blue' | 'green' | 'gold' | 'slate'
  radius: 'sharp' | 'soft'
  font: 'serif' | 'sans' | 'mono'
  width: 'narrow' | 'wide'
  header: 'bar' | 'stacked'
  home: 'list' | 'compact'
  showAuthor: boolean
  showTags: boolean
  showShare: boolean
  showKicker: boolean
  themeColor: string
  shape: MarkShape
  description: string
  titleSuffix: string
}

const kit = {
  showAuthor: true,
  showTags: true,
  showShare: true,
  showKicker: true,
} as const

export const PRESETS: Record<TemplateId, TemplatePreset> = {
  paper: {
    id: 'paper',
    label: 'Paper',
    niche: 'kit',
    nicheLabel: 'CF CMS kit',
    reference: 'Original CF CMS paper layout.',
    blurb: 'Warm paper, a small accent square, and a reading column.',
    accent: 'vermilion',
    radius: 'sharp',
    font: 'sans',
    width: 'narrow',
    header: 'bar',
    home: 'list',
    ...kit,
    themeColor: '#b8431f',
    shape: 'square',
    description: 'Notes on building software at the edge.',
    titleSuffix: 'Notes',
  },
  ink: {
    id: 'ink',
    label: 'Ink',
    niche: 'kit',
    nicheLabel: 'CF CMS kit',
    reference: 'Original CF CMS ink layout.',
    blurb: 'Higher contrast ink on a warm ground, with a softer mark.',
    accent: 'vermilion',
    radius: 'soft',
    font: 'serif',
    width: 'narrow',
    header: 'stacked',
    home: 'list',
    ...kit,
    themeColor: '#12110e',
    shape: 'rounded',
    description: 'Longer essays set like ink on paper.',
    titleSuffix: 'Ink',
  },
  terminal: {
    id: 'terminal',
    label: 'Terminal',
    niche: 'kit',
    nicheLabel: 'CF CMS kit',
    reference: 'Original CF CMS terminal layout.',
    blurb: 'Monospace throughout, for notes that read like a log.',
    accent: 'slate',
    radius: 'sharp',
    font: 'mono',
    width: 'narrow',
    header: 'bar',
    home: 'compact',
    ...kit,
    themeColor: '#3d4c5c',
    shape: 'bars',
    description: 'A compact log of technical notes.',
    titleSuffix: 'Log',
  },
  dispatch: {
    id: 'dispatch',
    label: 'Dispatch',
    niche: 'tech-blog',
    nicheLabel: 'Personal tech blog',
    reference: 'GeneratePress reading column, used widely for personal technical blogs.',
    blurb: 'A quiet single column, serif headlines, and a small circular mark.',
    accent: 'vermilion',
    radius: 'sharp',
    font: 'serif',
    width: 'narrow',
    header: 'bar',
    home: 'list',
    ...kit,
    themeColor: '#9a3412',
    shape: 'circle',
    description: 'A personal technical dispatch: one essay at a time.',
    titleSuffix: 'Dispatch',
  },
  signal: {
    id: 'signal',
    label: 'Signal',
    niche: 'tech-blog',
    nicheLabel: 'Personal tech blog',
    reference: 'Color Blog Dark and other developer-journal starters from 2026 theme roundups.',
    blurb: 'A dark header band, monospace kickers, and a compact index.',
    accent: 'slate',
    radius: 'sharp',
    font: 'mono',
    width: 'narrow',
    header: 'bar',
    home: 'compact',
    ...kit,
    themeColor: '#1c2836',
    shape: 'bars',
    description: 'Short technical signals from one person.',
    titleSuffix: 'Signal',
  },
  atelier: {
    id: 'atelier',
    label: 'Atelier',
    niche: 'lifestyle',
    nicheLabel: 'Personal lifestyle blog',
    reference: 'Blocksy lifestyle starters and magazine-like Soledad layouts.',
    blurb: 'A wide, warm magazine: stacked header, serif titles, soft corners.',
    accent: 'gold',
    radius: 'soft',
    font: 'serif',
    width: 'wide',
    header: 'stacked',
    home: 'list',
    ...kit,
    themeColor: '#8a5a12',
    shape: 'rounded',
    description: 'A personal magazine of days, rooms, and meals.',
    titleSuffix: 'Atelier',
  },
  hearth: {
    id: 'hearth',
    label: 'Hearth',
    niche: 'lifestyle',
    nicheLabel: 'Personal lifestyle blog',
    reference: 'Ashe and other airy personal-journal themes common on WordPress.org.',
    blurb: 'An airy journal with a soft pill mark and a green accent.',
    accent: 'green',
    radius: 'soft',
    font: 'serif',
    width: 'narrow',
    header: 'stacked',
    home: 'list',
    ...kit,
    themeColor: '#2f6b4f',
    shape: 'pill',
    description: 'A slow personal journal.',
    titleSuffix: 'Journal',
  },
  practice: {
    id: 'practice',
    label: 'Practice',
    niche: 'business',
    nicheLabel: 'Traditional business homepage',
    reference: 'Astra and Sydney business homepages, both still on popular-theme lists.',
    blurb: 'A wide services page: sans wordmark, blue accent, compact index.',
    accent: 'blue',
    radius: 'sharp',
    font: 'sans',
    width: 'wide',
    header: 'bar',
    home: 'compact',
    showAuthor: false,
    showTags: true,
    showShare: true,
    showKicker: false,
    themeColor: '#1d4e89',
    shape: 'shield',
    description: 'A small practice: what we do, and how to reach us.',
    titleSuffix: 'Practice',
  },
  civic: {
    id: 'civic',
    label: 'Civic',
    niche: 'business',
    nicheLabel: 'Traditional business homepage',
    reference: 'OceanWP and Kadence business starter sites.',
    blurb: 'A formal stacked header, letter-spaced name, and slate accent.',
    accent: 'slate',
    radius: 'soft',
    font: 'sans',
    width: 'wide',
    header: 'stacked',
    home: 'list',
    showAuthor: false,
    showTags: true,
    showShare: false,
    showKicker: true,
    themeColor: '#243044',
    shape: 'slash',
    description: 'An established firm, stated plainly.',
    titleSuffix: 'Company',
  },
  launch: {
    id: 'launch',
    label: 'Launch',
    niche: 'tech-company',
    nicheLabel: 'Tech company homepage',
    reference: 'Kadence SaaS starter sites and Saasland product homepages.',
    blurb: 'A product homepage: bright blue, a dark header, and bordered entries.',
    accent: 'blue',
    radius: 'sharp',
    font: 'sans',
    width: 'wide',
    header: 'bar',
    home: 'compact',
    showAuthor: false,
    showTags: true,
    showShare: true,
    showKicker: true,
    themeColor: '#1d4ed8',
    shape: 'ring',
    description: 'Product notes from a small software company.',
    titleSuffix: 'Product',
  },
  orbit: {
    id: 'orbit',
    label: 'Orbit',
    niche: 'tech-company',
    nicheLabel: 'Tech company homepage',
    reference: 'Astra SaaS starters and Blocksy technology layouts.',
    blurb: 'A green product grid with soft cards and a ring mark.',
    accent: 'green',
    radius: 'soft',
    font: 'sans',
    width: 'wide',
    header: 'stacked',
    home: 'compact',
    showAuthor: false,
    showTags: true,
    showShare: true,
    showKicker: true,
    themeColor: '#0f766e',
    shape: 'ring',
    description: 'Updates from a technology company.',
    titleSuffix: 'Company',
  },
}

export const NICHE_ORDER: Niche[] = ['tech-blog', 'lifestyle', 'business', 'tech-company', 'kit']

export function presetById(id: string): TemplatePreset | null {
  return (TEMPLATE_IDS as readonly string[]).includes(id) ? PRESETS[id as TemplateId] : null
}

export function presetsInNiche(niche: Niche): TemplatePreset[] {
  return TEMPLATE_IDS.map((id) => PRESETS[id]).filter((preset) => preset.niche === niche)
}
