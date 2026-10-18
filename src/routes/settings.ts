import type { Context, Hono } from 'hono'
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
  parseShare,
  parseSiteMeta,
  parseTemplate,
  saveSettings,
  upsertChannel,
  upsertTag,
} from '../config'
import { applyLogoAsset, applyVisualKit, clearBrandSlot, paintKitBrand } from '../kit'
import { presetById } from '../templates'
import type { AppEnv } from '../types'
import { bagFromBody } from '../form'
import { HEAD_PRESETS, parseHeadMeta } from '../head-meta.mjs'
import { canonicalTimeZone } from '../schedule.mjs'
import { SITE_COPY_FIELDS, SITE_COPY_LANGS, parseSiteCopy } from '../site-copy.mjs'
import {
  brandView,
  channelsView,
  copyView,
  headView,
  layoutView,
  metaView,
  shareView,
  tagsView,
  templateView,
} from '../view/settings'

function page(c: Context<AppEnv>, body: ReturnType<typeof templateView>, status = 200) {
  return c.html(body, status as 200, { 'cache-control': 'private, no-store' })
}

function baseOf(c: Context<AppEnv>) {
  return { env: c.env, nonce: c.get('nonce'), settings: c.get('settings'), channels: c.get('channels') }
}

async function refresh(c: Context<AppEnv>) {
  c.set('settings', await loadConfig(c.env.DB))
}

export function mountSettings(app: Hono<AppEnv>) {
  app.get('/admin/template', (c) => page(c, templateView(baseOf(c), c.req.query('ok'), c.req.query('error'))))
  app.post('/admin/template', async (c) => {
    const bag = bagFromBody(await c.req.parseBody())
    const current = c.get('settings')
    if (bag.intent === 'generate') {
      const id = presetById(String(bag.id || ''))?.id || current.template.id
      await applyVisualKit(c.env, id, current.brand.mark)
      await refresh(c)
      return page(c, templateView(baseOf(c), 'Visual kit applied.'))
    }
    const posted = parseTemplate(bag)
    if (posted.id !== current.template.id) {
      const preset = presetById(posted.id)
      if (preset) {
        await saveSettings(c.env.DB, 'template', parseTemplate(preset))
        await saveSettings(
          c.env.DB,
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
        await refresh(c)
        return page(c, templateView(baseOf(c), 'Template applied.'))
      }
    }
    await saveSettings(c.env.DB, 'template', posted)
    await refresh(c)
    return page(c, templateView(baseOf(c), 'Template saved.'))
  })

  app.get('/admin/brand', (c) => page(c, brandView(baseOf(c), c.req.query('ok'), c.req.query('error'))))
  app.post('/admin/brand', async (c) => {
    const body = await c.req.parseBody()
    const bag = bagFromBody(body)
    let brand = paintKitBrand(
      parseBrand({ ...c.get('settings').brand, mark: bag.mark, themeColor: bag.themeColor }),
      c.get('settings').template.id,
    )
    await saveSettings(c.env.DB, 'brand', brand)
    if (bag.clearLogo === 'on') brand = await clearBrandSlot(c.env, 'logo')
    if (bag.clearFavicon === 'on') brand = await clearBrandSlot(c.env, 'favicon')
    const logo = body.logo
    const favicon = body.favicon
    if (logo instanceof File && logo.size > 0) {
      const saved = await applyLogoAsset(c.env, brand, 'logo', new Uint8Array(await logo.arrayBuffer()))
      if ('error' in saved) {
        await refresh(c)
        return page(c, brandView(baseOf(c), undefined, 'Logo must be an SVG or PNG under 1MB.'), 400)
      }
      brand = saved.brand
    }
    if (favicon instanceof File && favicon.size > 0) {
      const saved = await applyLogoAsset(c.env, brand, 'favicon', new Uint8Array(await favicon.arrayBuffer()))
      if ('error' in saved) {
        await refresh(c)
        return page(c, brandView(baseOf(c), undefined, 'Favicon must be an SVG or PNG under 1MB.'), 400)
      }
    }
    await refresh(c)
    return page(c, brandView(baseOf(c), 'Brand saved.'))
  })
  app.post('/admin/brand/generate', async (c) => {
    await applyVisualKit(c.env, c.get('settings').template.id, c.get('settings').brand.mark)
    await refresh(c)
    return page(c, brandView(baseOf(c), 'Visual kit applied. Tweak the mark, color, or logo below.'))
  })

  app.get('/admin/layout', (c) => page(c, layoutView(baseOf(c), c.req.query('ok'), c.req.query('error'))))
  app.post('/admin/layout', async (c) => {
    const bag = bagFromBody(await c.req.parseBody())
    const layout = parseLayout({
      ...bag,
      showAuthor: bag.showAuthor === 'on',
      showTags: bag.showTags === 'on',
      showShare: bag.showShare === 'on',
      showKicker: bag.showKicker === 'on',
      show_powered_by: bag.show_powered_by === 'on',
    })
    await saveSettings(c.env.DB, 'layout', layout)
    await refresh(c)
    return page(c, layoutView(baseOf(c), 'Layout saved.'))
  })

  app.get('/admin/meta', (c) => page(c, metaView(baseOf(c), c.req.query('ok'), c.req.query('error'))))
  app.post('/admin/meta', async (c) => {
    const bag = bagFromBody(await c.req.parseBody())
    const meta = parseSiteMeta(bag)
    const zoneInput = (bag.timezone || '').trim()
    const zone = zoneInput ? canonicalTimeZone(zoneInput) : 'UTC'
    if (!zone) return page(c, metaView(baseOf(c), undefined, 'Timezone must be an IANA name such as UTC or Asia/Shanghai.'), 400)
    await saveSettings(c.env.DB, 'meta', meta)
    await saveSettings(c.env.DB, 'require_all_languages', bag.require_all_languages === 'on')
    await saveSettings(c.env.DB, 'timezone', zone)
    await refresh(c)
    return page(c, metaView(baseOf(c), 'Metadata saved.'))
  })

  app.get('/admin/head', (c) => page(c, headView(baseOf(c), c.req.query('ok'), c.req.query('error'))))
  app.post('/admin/head', async (c) => {
    const bag = bagFromBody(await c.req.parseBody())
    const entries = HEAD_PRESETS.flatMap((preset, index) => {
      const value = (bag[`preset_${index}`] || '').trim()
      if (!value) return []
      return [{ kind: preset.kind, key: preset.key, attr: preset.attr, value }]
    })
    for (let index = 0; index < 4; index += 1) {
      const key = (bag[`custom_key_${index}`] || '').trim()
      const value = (bag[`custom_value_${index}`] || '').trim()
      if (!key && !value) continue
      entries.push({
        kind: bag[`custom_kind_${index}`] === 'property' ? 'property' : 'name',
        key,
        attr: bag[`custom_attr_${index}`] === 'value' ? 'value' : 'content',
        value,
      })
    }
    const parsed = parseHeadMeta({ entries, raw: bag.head_raw || '' })
    if (!parsed.ok) return page(c, headView(baseOf(c), undefined, parsed.error), 400)
    try {
      await saveSettings(c.env.DB, 'head_meta', parsed.value)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save head tags'
      return page(c, headView(baseOf(c), undefined, message), 400)
    }
    await refresh(c)
    return page(c, headView(baseOf(c), 'Head tags saved.'))
  })

  app.get('/admin/copy', (c) => page(c, copyView(baseOf(c), c.req.query('ok'), c.req.query('error'))))
  app.post('/admin/copy', async (c) => {
    const bag = bagFromBody(await c.req.parseBody())
    const input: Record<string, Record<string, string>> = {}
    for (const lang of SITE_COPY_LANGS) {
      input[lang] = {}
      for (const field of SITE_COPY_FIELDS) input[lang][field] = String(bag[`${lang}_${field}`] || '')
    }
    const parsed = parseSiteCopy(input)
    if (!parsed.ok) return page(c, copyView(baseOf(c), undefined, parsed.error), 400)
    try {
      await saveSettings(c.env.DB, 'site_copy', parsed.value)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save site copy'
      return page(c, copyView(baseOf(c), undefined, message), 400)
    }
    await refresh(c)
    return page(c, copyView(baseOf(c), 'Site copy saved.'))
  })

  app.get('/admin/share', (c) => page(c, shareView(baseOf(c), c.req.query('ok'), c.req.query('error'))))
  app.post('/admin/share', async (c) => {
    const bag = bagFromBody(await c.req.parseBody())
    const share = parseShare({ ...bag, showRss: bag.showRss === 'on' })
    await saveSettings(c.env.DB, 'share', share)
    await refresh(c)
    return page(c, shareView(baseOf(c), 'Share links saved.'))
  })

  app.get('/admin/channels', (c) => page(c, channelsView(baseOf(c), c.req.query('ok'), c.req.query('error'))))
  app.post('/admin/channels', async (c) => {
    const bag = bagFromBody(await c.req.parseBody())
    const parsed = parseChannelInput({ ...bag, visible: bag.visible === 'on' })
    if (!parsed) return page(c, channelsView(baseOf(c), undefined, 'Use a lowercase slug.'), 400)
    if (!parsed.names?.en && !Object.keys(parsed.names || {}).length) {
      return page(c, channelsView(baseOf(c), undefined, 'Add at least one name.'), 400)
    }
    await upsertChannel(c.env.DB, parsed)
    c.set('channels', await listChannels(c.env.DB))
    return page(c, channelsView(baseOf(c), 'Channel saved.'))
  })
  app.post('/admin/channels/delete', async (c) => {
    const slug = bagFromBody(await c.req.parseBody()).slug || ''
    const error = await deleteChannel(c.env.DB, slug)
    c.set('channels', await listChannels(c.env.DB))
    if (error === 'in-use') return page(c, channelsView(baseOf(c), undefined, 'That channel still has posts.'), 400)
    if (error) return page(c, channelsView(baseOf(c), undefined, 'Could not delete that channel.'), 400)
    return page(c, channelsView(baseOf(c), 'Channel deleted.'))
  })

  app.get('/admin/tags', async (c) => page(c, tagsView(baseOf(c), await listTagsAdmin(c.env.DB), c.req.query('ok'), c.req.query('error'))))
  app.post('/admin/tags', async (c) => {
    const bag = bagFromBody(await c.req.parseBody())
    const ok = await upsertTag(c.env.DB, (bag.slug || '').trim().toLowerCase(), namesFromRow(bag))
    const tags = await listTagsAdmin(c.env.DB)
    if (!ok) return page(c, tagsView(baseOf(c), tags, undefined, 'Use a lowercase slug.'), 400)
    return page(c, tagsView(baseOf(c), tags, 'Tag saved.'))
  })
  app.post('/admin/tags/delete', async (c) => {
    const slug = bagFromBody(await c.req.parseBody()).slug || ''
    await deleteTag(c.env.DB, slug)
    return page(c, tagsView(baseOf(c), await listTagsAdmin(c.env.DB), 'Tag deleted.'))
  })
}
