import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { publishBlockers, refusalText } from '../src/publish-gate.mjs'
import {
  PUBLIC_SURFACES,
  formatWall,
  isLive,
  matchesListStatus,
  parsePublishAt,
  parseTimeZone,
  publicCacheControl,
  visibilityOf,
  visibleOn,
  wallToUtc,
  zoneLabel,
} from '../src/schedule.mjs'

const root = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

const goLive = '2026-10-18T01:30:00.000Z'
const minuteBefore = '2026-10-18T01:29:00.000Z'
const post = { status: 'published', publishedAt: goLive }

test('a scheduled post stays off every public surface until the go-live instant', () => {
  assert.deepEqual(PUBLIC_SURFACES, ['post', 'list', 'channel', 'tag', 'rss', 'sitemap', 'jsonld', 'llms', 'og', 'search'])
  for (const surface of PUBLIC_SURFACES) {
    assert.equal(visibleOn(surface, post, minuteBefore), false, surface)
    assert.equal(visibleOn(surface, post, '2026-10-18T01:29:59.000Z'), false, surface)
    assert.equal(visibleOn(surface, post, goLive), true, surface)
    assert.equal(visibleOn(surface, post, '2026-10-18T01:31:00.000Z'), true, surface)
  }
  assert.equal(visibleOn('preview', post, goLive), false)
  assert.equal(visibilityOf('published', goLive, minuteBefore), 'scheduled')
  assert.equal(visibilityOf('published', goLive, goLive), 'live')
})

test('legacy published posts with no timestamp stay live, and drafts never do', () => {
  const now = '2026-10-18T01:30:00.000Z'
  assert.equal(isLive('published', null, now), true)
  assert.equal(isLive('published', '', now), true)
  assert.equal(isLive('published', '   ', now), true)
  assert.equal(visibilityOf('published', null, now), 'live')
  assert.equal(isLive('draft', null, now), false)
  assert.equal(isLive('draft', goLive, '2027-01-01T00:00:00.000Z'), false)
  assert.equal(visibilityOf('draft', goLive, now), 'draft')
  assert.equal(isLive('published', 'not-a-date', now), false)
})

test('list filters keep scheduled posts inside published and add a scheduled filter', () => {
  const now = minuteBefore
  assert.equal(matchesListStatus('published', 'published', goLive, now), true)
  assert.equal(matchesListStatus('scheduled', 'published', goLive, now), true)
  assert.equal(matchesListStatus('draft', 'published', goLive, now), false)
  assert.equal(matchesListStatus('scheduled', 'published', goLive, goLive), false)
  assert.equal(matchesListStatus('published', 'published', null, now), true)
  assert.equal(matchesListStatus('any', 'draft', null, now), true)
  assert.equal(matchesListStatus('nope', 'published', goLive, now), false)
})

test('publish_at requires an offset and is stored as UTC', () => {
  const now = '2026-10-18T00:00:00.000Z'
  assert.equal(parsePublishAt('2026-10-18T09:30:00+08:00', now), '2026-10-18T01:30:00.000Z')
  assert.equal(parsePublishAt('2026-10-18T01:30:00Z', now), '2026-10-18T01:30:00.000Z')
  assert.throws(() => parsePublishAt('2026-10-18T09:30:00', now), /offset or Z/)
  assert.throws(() => parsePublishAt('2026-10-18T09:30:00+0800', now), /offset or Z/)
  assert.throws(() => parsePublishAt('2020-01-01T00:00:00Z', '2026-01-01T00:00:00.000Z'), /future/)
  assert.throws(() => parsePublishAt('2026-10-18T00:00:00Z', now), /future/)
})

test('wall times use the site timezone and round-trip', () => {
  assert.equal(wallToUtc('2026-10-18T09:30', 'Asia/Shanghai'), '2026-10-18T01:30:00.000Z')
  assert.equal(formatWall('2026-10-18T01:30:00.000Z', 'Asia/Shanghai'), '2026-10-18T09:30')
  assert.equal(wallToUtc('2026-10-18T09:30', 'America/New_York'), '2026-10-18T13:30:00.000Z')
  assert.match(zoneLabel('Asia/Shanghai', new Date('2026-10-18T01:30:00.000Z')), /Asia\/Shanghai \(GMT\+8/)
  assert.equal(parseTimeZone(undefined), 'UTC')
  assert.equal(parseTimeZone(''), 'UTC')
  assert.equal(parseTimeZone('Not/AZone'), 'UTC')
  assert.equal(parseTimeZone('asia/shanghai'), 'Asia/Shanghai')
  assert.throws(() => wallToUtc('2026-03-08T02:30', 'America/New_York'), /does not exist/)
  assert.throws(() => wallToUtc('', 'UTC'), /date and time/)
  assert.throws(() => wallToUtc('2026-10-18T09:30', 'Not/AZone'), /IANA/)
})

test('cached list and sitemap lifetimes stop at the next go-live and do not stay stale', () => {
  const now = '2026-10-18T01:00:00.000Z'
  assert.equal(publicCacheControl(now, '2026-10-18T01:00:45.000Z', 60, 600), 'public, max-age=45, must-revalidate')
  assert.equal(publicCacheControl(now, '2026-10-18T02:00:00.000Z', 60, 600), 'public, max-age=60, must-revalidate')
  assert.equal(publicCacheControl(now, null, 60, 600), 'public, max-age=60, stale-while-revalidate=600')
  assert.equal(publicCacheControl(now, null, 300, 0), 'public, max-age=300')
  assert.equal(publicCacheControl(now, now, 60, 600), 'no-store')
  assert.equal(publicCacheControl(now, '2026-10-18T01:00:00.400Z', 60, 600), 'no-store')
  assert.equal(publicCacheControl(now, '2026-10-18T01:00:45.000Z', 300, 0).includes('stale-while-revalidate'), false)
})

test('scheduling uses the same five-language refusal as publishing', () => {
  const blockers = publishBlockers([
    { lang: 'zh', title: '标题', body: '正文', ready: true, engine: 'human', error: '' },
  ])
  assert.equal(blockers.length > 0, true)
  const message = refusalText(blockers)
  assert.match(message, /拒绝发布/)
  assert.match(message, /Publish refused/)
})

test('every public read uses the live predicate and preview does not', () => {
  const db = read('src/db.ts')
  const uses = db.match(/liveSql\(/g) || []
  assert.equal(uses.length >= 7, true)
  assert.match(db, /preview \? '' : `AND \$\{liveSql\('p'\)\}`/)
  assert.match(db, /nextScheduledAt/)
  assert.equal(read('src/feeds.ts').includes("status = 'published'"), false)
  assert.match(read('src/feeds.ts'), /responseCacheControl/)
  const routes = read('src/routes/public.ts')
  assert.match(routes, /responseCacheControl/)
  assert.match(routes, /getArticle\(c\.env\.DB, c\.req\.param\('slug'\), lang, false\)/)
  assert.match(routes, /function missing[\s\S]*no-store/)
  assert.equal(routes.includes("status = 'published'"), false)
})

test('admin, settings, and MCP schedule through the shared helpers', () => {
  const form = read('src/form.ts')
  assert.match(form, /action === 'schedule'/)
  assert.match(form, /status = 'published'/)
  const admin = read('src/routes/admin.ts')
  const store = admin.slice(admin.indexOf('async function storePost'))
  assert.match(store, /wallToUtc/)
  assert.match(store, /status === 'published' && c\.get\('settings'\)\.require_all_languages/)
  assert.equal(store.indexOf('wallToUtc') < store.indexOf('publishBlockers'), true)
  const tools = read('src/mcp/tools.ts')
  const write = tools.slice(tools.indexOf('async function writeFromArgs'))
  assert.equal(write.indexOf('parsePublishAt') > 0, true)
  assert.equal(write.indexOf('publishBlockers') > write.indexOf('parsePublishAt'), true)
  assert.match(tools, /publish_at/)
  assert.match(tools, /matchesListStatus/)
  assert.match(tools, /visibility/)
  const config = read('src/config.ts')
  assert.match(config, /parseTimeZone/)
  assert.match(config, /'timezone'/)
  assert.match(read('src/view/admin.ts'), /Schedule/)
  assert.match(read('src/view/settings.ts'), /name="timezone"/)
})
