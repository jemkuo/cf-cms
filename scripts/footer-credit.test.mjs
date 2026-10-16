import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { poweredByMarkup, showPoweredBy, POWERED_BY_URL } from '../src/footer-credit.mjs'

const root = new URL('..', import.meta.url)

test('show_powered_by defaults on when the saved layout omits it', () => {
  assert.equal(showPoweredBy(undefined), true)
  assert.equal(showPoweredBy(null), true)
  assert.equal(showPoweredBy(true), true)
  assert.equal(showPoweredBy('on'), true)
  assert.equal(showPoweredBy(false), false)
  assert.equal(showPoweredBy('off'), false)
  assert.equal(showPoweredBy('false'), false)
  assert.equal(showPoweredBy(0), false)
})

test('footer credit is the English product line with a same-tab link', () => {
  const html = poweredByMarkup()
  assert.match(html, /^<p class="powered-by" lang="en">Powered by <a href="https:\/\/github\.com\/jemkuo\/cf-cms" rel="noopener">CF CMS<\/a><\/p>$/)
  assert.equal(html.includes('target='), false)
  assert.equal(html.includes(POWERED_BY_URL), true)
  assert.equal(html.includes('Powered by'), true)
})

test('public shell prints the credit after the copyright and admin pages skip the footer', () => {
  const layout = readFileSync(new URL('src/view/layout.ts', root), 'utf8')
  const creditAt = layout.indexOf('poweredByMarkup()')
  const copyAt = layout.indexOf('class="copy"')
  assert.equal(copyAt > 0 && creditAt > copyAt, true)
  assert.match(layout, /input\.admin \? '' : footer/)
  assert.match(layout, /show_powered_by \? raw\(poweredByMarkup\(\)\)/)
  assert.match(layout, /'5'/)
})

test('Article JSON-LD does not include the footer credit', () => {
  const publicView = readFileSync(new URL('src/view/public.ts', root), 'utf8')
  assert.equal(publicView.includes('Powered by'), false)
  assert.equal(publicView.includes(POWERED_BY_URL), false)
  assert.equal(publicView.includes('show_powered_by'), false)
})

test('the credit is small and mixed from each template ink color', () => {
  const css = readFileSync(new URL('public/styles.css', root), 'utf8')
  assert.match(css, /\.powered-by \{[^}]*font-size: 0\.75rem;/s)
  assert.match(css, /color: color-mix\(in srgb, var\(--ink\) 62%, var\(--bg\)\)/)
  assert.match(css, /text-align: start/)
})

test('layout settings and MCP expose show_powered_by', () => {
  const config = readFileSync(new URL('src/config.ts', root), 'utf8')
  const tools = readFileSync(new URL('src/mcp/tools.ts', root), 'utf8')
  const screen = readFileSync(new URL('src/view/settings.ts', root), 'utf8')
  assert.match(config, /show_powered_by: showPoweredBy\(row\.show_powered_by\)/)
  assert.match(tools, /show_powered_by: \{ type: 'boolean' \}/)
  assert.match(screen, /name="\$\{name\}"|show_powered_by/)
  assert.match(screen, /check\('show_powered_by'/)
})
