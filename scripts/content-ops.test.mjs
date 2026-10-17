import assert from 'node:assert/strict'
import test from 'node:test'
import { splitMarkdown } from '../src/chunks.mjs'
import { parseHeadMeta, renderHeadMeta, sanitizeHeadSnippet } from '../src/head-meta.mjs'
import { publishBlockers, publishRefusal, requireAllLanguages } from '../src/publish-gate.mjs'
import { TAG_NAME_INSERT_SQL, shouldRenameTagOnSave, tagNameAfterSave } from '../src/tag-attach.mjs'

test('saving a post does not rename an existing tag', () => {
  assert.equal(shouldRenameTagOnSave(), false)
  assert.match(TAG_NAME_INSERT_SQL, /DO NOTHING/)
  assert.doesNotMatch(TAG_NAME_INSERT_SQL, /DO UPDATE/)
  assert.equal(tagNameAfterSave('English', '中文'), 'English')
  assert.equal(tagNameAfterSave('日本語', '中文'), '日本語')
  assert.equal(tagNameAfterSave('', '中文'), '中文')
  assert.equal(tagNameAfterSave(undefined, '中文'), '中文')
})

test('publish gate lists languages that are missing or not ready', () => {
  assert.equal(requireAllLanguages(undefined), true)
  assert.equal(requireAllLanguages(null), true)
  assert.equal(requireAllLanguages(true), true)
  assert.equal(requireAllLanguages(false), false)
  assert.equal(requireAllLanguages('off'), false)
  const blockers = publishBlockers([
    { lang: 'zh', title: '标题', body: '正文', ready: true, engine: 'human', error: '' },
    { lang: 'en', title: 'Title', body: 'Body', ready: false, engine: 'human', error: '' },
    { lang: 'ja', title: '題', body: '本文', ready: true, engine: 'fallback', error: '' },
    { lang: 'es', title: '', body: '', ready: false, engine: 'fallback', error: 'empty translation' },
  ])
  assert.deepEqual(
    blockers.map((item) => item.lang),
    ['en', 'ja', 'es', 'ar'],
  )
  assert.equal(blockers.find((item) => item.lang === 'en').state, 'not-ready')
  assert.equal(blockers.find((item) => item.lang === 'ja').state, 'not-ready')
  assert.equal(blockers.find((item) => item.lang === 'es').state, 'missing')
  assert.equal(blockers.find((item) => item.lang === 'ar').state, 'missing')
  const message = publishRefusal(blockers)
  assert.match(message.zh, /拒绝发布/)
  assert.match(message.en, /Publish refused/)
  assert.match(message.en, /en \(not-ready\)/)
  assert.match(message.zh, /ar \(missing\)/)
  assert.equal(publishBlockers([
    { lang: 'zh', title: 'a', body: 'b', ready: true, engine: 'human' },
    { lang: 'en', title: 'a', body: 'b', ready: true, engine: 'human' },
    { lang: 'ja', title: 'a', body: 'b', ready: true, engine: 'workers-ai' },
    { lang: 'es', title: 'a', body: 'b', ready: true, engine: 'human' },
    { lang: 'ar', title: 'a', body: 'b', ready: true, engine: 'human' },
  ]).length, 0)
})

test('chunk splitter keeps code, tables, images, and commands intact', () => {
  const source = [
    '# Title',
    '',
    'A paragraph about the edge that should be translated.',
    '',
    '```bash',
    'echo keep-me',
    '```',
    '',
    '| col | val |',
    '| --- | --- |',
    '| a | b |',
    '',
    '![diagram](https://cdn.example.com/diagram.png)',
    '',
    '$ npm run check',
    '',
    'Closing notes that are long enough to sit in their own section after the command.',
  ].join('\n')
  const chunks = splitMarkdown(source, 80)
  assert.equal(chunks.map((chunk) => chunk.text).join(''), source)
  const kept = chunks.filter((chunk) => chunk.kind === 'keep').map((chunk) => chunk.text).join('\n')
  assert.match(kept, /echo keep-me/)
  assert.match(kept, /\| col \| val \|/)
  assert.match(kept, /diagram\.png/)
  assert.match(kept, /\$ npm run check/)
  for (const chunk of chunks) {
    if (chunk.kind !== 'prose') continue
    assert.doesNotMatch(chunk.text, /echo keep-me/)
    assert.doesNotMatch(chunk.text, /\| col \| val \|/)
    assert.doesNotMatch(chunk.text, /diagram\.png/)
    assert.doesNotMatch(chunk.text, /\$ npm run check/)
  }
  assert.ok(chunks.some((chunk) => chunk.kind === 'prose' && chunk.text.includes('A paragraph')))
})

test('head meta renders the impact value attribute and rejects reserved tags', () => {
  const parsed = parseHeadMeta({
    entries: [{ kind: 'name', key: 'impact-site-verification', attr: 'content', value: "abc'def" }],
    raw: '',
  })
  assert.equal(parsed.ok, true)
  assert.equal(parsed.value.entries[0].attr, 'value')
  const html = renderHeadMeta(parsed.value)
  assert.match(html, /<meta name="impact-site-verification" value="abc'def">/)
  assert.doesNotMatch(html, /content=/)
  const reserved = parseHeadMeta({
    entries: [{ kind: 'name', key: 'description', attr: 'content', value: 'nope' }],
    raw: '',
  })
  assert.equal(reserved.ok, false)
  const og = parseHeadMeta({
    entries: [{ kind: 'property', key: 'og:title', attr: 'content', value: 'nope' }],
    raw: '',
  })
  assert.equal(og.ok, false)
  const snippet = sanitizeHeadSnippet(`<meta name='impact-site-verification' value='ok'><script>alert(1)</script>`)
  assert.equal(snippet.ok, true)
  assert.match(snippet.html, /<meta name="impact-site-verification" value="ok">/)
  assert.doesNotMatch(snippet.html, /script/i)
  const handler = sanitizeHeadSnippet(`<meta name="example-site" content="y" onclick="alert(1)">`)
  assert.equal(handler.ok, true)
  assert.match(handler.html, /<meta name="example-site" content="y">/)
  assert.doesNotMatch(handler.html, /onclick/)
  assert.equal(sanitizeHeadSnippet('<div>nope</div>').ok, false)
  assert.equal(sanitizeHeadSnippet('<link rel="preconnect" href="javascript:alert(1)">').ok, false)
  assert.equal(parseHeadMeta(undefined).ok, true)
  assert.deepEqual(parseHeadMeta(undefined).value, { entries: [], raw: '' })
})
