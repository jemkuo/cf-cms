import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeSiteCopy, parseSiteCopy, readSiteCopy, resolveSiteCopy, splitParagraphs } from '../src/site-copy.mjs'

const defaults = {
  tagline: 'Default tagline',
  kicker: 'AI · SYSTEMS · NOTES',
  description: 'Default description',
  footer: 'Default footer.',
  aboutTitle: 'About this site',
  aboutBody: ['One.', 'Two.'],
}

test('no stored copy keeps every built-in default', () => {
  for (const stored of [undefined, null, {}, 'garbage', { xx: { tagline: 'x' } }]) {
    const out = resolveSiteCopy(defaults, stored, 'en')
    assert.deepEqual(out, defaults)
  }
})

test('description falls back to the site meta description before the built-in line', () => {
  assert.equal(resolveSiteCopy(defaults, {}, 'en', 'Meta line').description, 'Meta line')
  assert.equal(resolveSiteCopy(defaults, { en: { description: 'Own line' } }, 'en', 'Meta line').description, 'Own line')
})

test('overrides apply per language and per field', () => {
  const stored = { zh: { tagline: '织岸科技', aboutBody: ['第一段', '第二段'] }, ar: { footer: 'تذييل' } }
  const zh = resolveSiteCopy(defaults, stored, 'zh')
  assert.equal(zh.tagline, '织岸科技')
  assert.equal(zh.kicker, defaults.kicker)
  assert.deepEqual(zh.aboutBody, ['第一段', '第二段'])
  assert.equal(resolveSiteCopy(defaults, stored, 'ar').footer, 'تذييل')
  assert.equal(resolveSiteCopy(defaults, stored, 'en').tagline, defaults.tagline)
})

test('parse trims, drops empty fields, and splits About paragraphs on blank lines', () => {
  const parsed = parseSiteCopy({ en: { tagline: '  Hello\n world ', kicker: '', aboutBody: 'Para one\nstill one.\n\n  Para two  ' } })
  assert.equal(parsed.ok, true)
  assert.deepEqual(parsed.value, { en: { tagline: 'Hello world', aboutBody: ['Para one still one.', 'Para two'] } })
  assert.deepEqual(splitParagraphs(['a', '', ' b ']), ['a', 'b'])
})

test('parse rejects unknown languages, unknown fields, wrong types, and overlong text', () => {
  assert.equal(parseSiteCopy({ fr: { tagline: 'x' } }).ok, false)
  assert.equal(parseSiteCopy({ en: { heading: 'x' } }).ok, false)
  assert.equal(parseSiteCopy({ en: { tagline: 5 } }).ok, false)
  assert.equal(parseSiteCopy({ en: { tagline: 'x'.repeat(161) } }).ok, false)
  assert.equal(parseSiteCopy({ en: { aboutBody: Array.from({ length: 13 }, () => 'p') } }).ok, false)
  assert.equal(parseSiteCopy([]).ok, false)
  assert.deepEqual(readSiteCopy({ en: { heading: 'x' } }), {})
})

test('merge patches fields, clears with empty or null, and replace starts over', () => {
  const current = { zh: { tagline: '旧标题', footer: '旧页脚' }, en: { tagline: 'Old' } }
  let out = mergeSiteCopy(current, { zh: { tagline: '新标题', footer: '' } })
  assert.equal(out.ok, true)
  assert.deepEqual(out.value, { zh: { tagline: '新标题' }, en: { tagline: 'Old' } })
  out = mergeSiteCopy(current, { en: null })
  assert.deepEqual(out.value, { zh: { tagline: '旧标题', footer: '旧页脚' } })
  out = mergeSiteCopy(current, { ja: { kicker: 'テック' } }, true)
  assert.deepEqual(out.value, { ja: { kicker: 'テック' } })
  assert.equal(mergeSiteCopy(current, { en: { nope: 'x' } }).ok, false)
  assert.equal(mergeSiteCopy(current, 'x').ok, false)
})
