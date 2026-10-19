import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { homeKind, publicRoutes, routeAllowed } from '../src/portal.mjs'
import { mergeSections, resolveSections, sectionsResetNeeded } from '../src/sections.mjs'
import { buildArgv, callSetupTool, parseDeployOutput, tokenArgError } from '../src/mcp/setup-tools.mjs'

const harbor = { mode: 'portal', id: 'harbor', sectionSchema: 'saas' }
const forge = { mode: 'portal', id: 'forge', sectionSchema: 'industrial' }
const paper = { mode: 'blog', id: 'paper', sectionSchema: '' }

test('portal routes follow the template and blog routes stay put', () => {
  assert.equal(homeKind(paper), 'posts')
  assert.equal(homeKind(harbor), 'landing')
  assert.equal(homeKind(forge), 'landing')
  assert.equal(homeKind(null), 'posts')
  assert.deepEqual(publicRoutes(harbor), ['home', 'about', 'posts', 'tags', 'topics', 'contact', 'services', 'insights'])
  assert.deepEqual(publicRoutes(forge), ['home', 'about', 'posts', 'tags', 'topics', 'contact', 'products', 'news'])
  assert.equal(routeAllowed(harbor, 'services'), true)
  assert.equal(routeAllowed(harbor, 'products'), false)
  assert.equal(routeAllowed(harbor, 'news'), false)
  assert.equal(routeAllowed(forge, 'products'), true)
  assert.equal(routeAllowed(forge, 'services'), false)
  assert.equal(routeAllowed(forge, 'insights'), false)
  assert.equal(routeAllowed(paper, 'services'), false)
  assert.equal(routeAllowed(paper, 'contact'), false)
  assert.equal(routeAllowed(paper, 'posts'), true)
})

test('template ids and portal fields are declared', () => {
  const source = readFileSync(new URL('../src/templates.ts', import.meta.url), 'utf8')
  assert.match(source, /'harbor'/)
  assert.match(source, /'forge'/)
  assert.match(source, /sectionSchema: 'saas'/)
  assert.match(source, /sectionSchema: 'industrial'/)
  assert.match(source, /niche: 'manufacturing'/)
  assert.match(source, /mode: 'blog'/)
  const layout = readFileSync(new URL('../src/view/layout.ts', import.meta.url), 'utf8')
  assert.match(layout, /data-mode="portal"/)
  assert.match(layout, /\/themes\/\$\{preset\.cssPack\}\.css/)
  assert.equal(readFileSync(new URL('../public/themes/harbor.css', import.meta.url), 'utf8').includes('--accent: #22d3ee'), true)
  assert.equal(readFileSync(new URL('../public/themes/forge.css', import.meta.url), 'utf8').includes('--accent: #1d4ed8'), true)
})

test('sections schemas reject the other template and clear empty strings', () => {
  const saas = mergeSections({}, { locales: { en: { hero: { title: 'Hello', lede: '' } } } }, 'saas', false)
  assert.equal(saas.ok, true)
  assert.equal(saas.value.locales.en.hero.title, 'Hello')
  assert.equal(saas.value.locales.en.hero.lede, undefined)
  const foreign = mergeSections({}, { locales: { en: { productLines: [{ title: 'Gear' }] } } }, 'saas', false)
  assert.equal(foreign.ok, false)
  assert.match(foreign.error, /productLines/)
  const team = mergeSections({}, { locales: { en: { team: [{ name: 'Platform', role: 'Edge' }] } } }, 'industrial', false)
  assert.equal(team.ok, false)
  assert.match(team.error, /team/)
  const blog = mergeSections({}, { locales: { en: { hero: { title: 'No' } } } }, '', false)
  assert.equal(blog.ok, false)
  assert.match(blog.error, /harbor and forge/)
  assert.equal(blog.error.includes('secret-token'), false)
  const resolved = resolveSections('saas', {}, 'en')
  assert.match(resolved.hero.title, /Weave/)
  const zh = resolveSections('industrial', {}, 'zh')
  assert.match(zh.hero.title, /箱体/)
  const fallback = resolveSections('saas', {}, 'ja')
  assert.equal(fallback.hero.title, resolved.hero.title)
  assert.equal(sectionsResetNeeded(paper, harbor), true)
  assert.equal(sectionsResetNeeded(harbor, forge), true)
  assert.equal(sectionsResetNeeded(harbor, harbor), false)
  assert.equal(sectionsResetNeeded(paper, { sectionSchema: '' }), false)
})

test('bootstrap tools reject a token argument and keep it off argv', async () => {
  const secret = 'cloudflare-token-should-not-leak-99'
  const rejected = tokenArgError({ project: 'cf-demo', token: secret }, secret)
  assert.equal(rejected.includes(secret), false)
  assert.match(rejected, /CLOUDFLARE_API_TOKEN/)
  const hidden = tokenArgError({ project: 'cf-demo', domain: secret }, secret)
  assert.equal(hidden.includes(secret), false)
  const built = buildArgv('deploy', { project: 'cf-demo', skip_domain: true, seed: true })
  assert.equal(built.ok, true)
  assert.deepEqual(built.argv, ['--yes', '--project', 'cf-demo', '--skip-domain', '--seed'])
  assert.equal(built.argv.some((part) => /token/i.test(part)), false)
  assert.equal(built.argv.includes(secret), false)
  const both = buildArgv('deploy', { project: 'cf-demo', domain: 'blog.example.com', skip_domain: true })
  assert.equal(both.ok, false)
  const open = buildArgv('deploy', { project: 'cf-demo' })
  assert.equal(open.ok, false)
  const dry = buildArgv('preflight', { project: 'cf-demo' })
  assert.equal(dry.ok, true)
  assert.equal(dry.argv.includes('--dry-run'), true)
  assert.equal(dry.argv.includes('--replace-dns'), false)
  let seen = null
  const deployed = await callSetupTool(
    'setup_deploy',
    { project: 'cf-demo', skip_domain: true },
    { CLOUDFLARE_API_TOKEN: secret },
    {
      async spawn(argv) {
        seen = argv
        return {
          code: 0,
          stdout: `reuse d1 cf-demo-db abc\nSite:       https://cf-demo.pages.dev\npages.dev:  https://cf-demo.pages.dev\nAdmin:      https://cf-demo.pages.dev/${secret}/admin/\n`,
          stderr: `debug ${secret}`,
        }
      },
    },
  )
  assert.equal(seen.includes(secret), false)
  assert.equal(seen.includes('--token'), false)
  assert.equal(JSON.stringify(deployed).includes(secret), false)
  assert.match(deployed.adminPathMasked, /<safepath>/)
  assert.equal(deployed.reused.d1, true)
  assert.equal(deployed.mcpUrl, 'https://cf-demo.pages.dev/mcp')
  await assert.rejects(
    () =>
      callSetupTool('setup_deploy', { project: 'cf-demo', apiToken: secret, skip_domain: true }, { CLOUDFLARE_API_TOKEN: secret }, {
        async spawn() {
          throw new Error('spawn should not run')
        },
      }),
    (error) => {
      assert.equal(String(error.message).includes(secret), false)
      return true
    },
  )
  await assert.rejects(
    () => callSetupTool('setup_preflight', { project: 'cf-demo' }, {}),
    /CLOUDFLARE_API_TOKEN is not set/,
  )
})

test('setup_health reads /health and does not send a token', async () => {
  let called = ''
  const report = await callSetupTool('setup_health', { baseUrl: 'https://cf-demo.pages.dev/' }, { CLOUDFLARE_API_TOKEN: 'should-stay-local' }, {
    async fetch(url) {
      called = url
      return { json: async () => ({ ok: true, d1: true, r2: false, schema: true }) }
    },
  })
  assert.equal(called, 'https://cf-demo.pages.dev/health')
  assert.deepEqual(report, { ok: true, d1: true, r2: false, schema: true })
  const masked = parseDeployOutput('Admin: https://demo.pages.dev/not-a-path\n')
  assert.equal(masked.adminPathMasked, '')
})

test('stdio setup_preflight is local and does not forward a token argument', async () => {
  const secret = 'stdio-secret-token-value-42'
  const seen = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      const message = JSON.parse(body)
      seen.push(message)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: [{ name: 'project_info', inputSchema: { type: 'object' } }] } }))
    })
  })
  const url = await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)))
  const proxy = fileURLToPath(new URL('../bin/mcp-stdio.mjs', import.meta.url))
  const child = spawn(process.execPath, [proxy], {
    env: { ...process.env, CF_CMS_URL: url, ADMIN_API_TOKEN: 'test-token-0123456789', CLOUDFLARE_API_TOKEN: secret },
  })
  let out = ''
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`timeout ${out}`))
    }, 5000)
    child.stdout.on('data', (chunk) => {
      out += chunk
      if (out.split('\n').filter(Boolean).length >= 2) {
        clearTimeout(timer)
        resolve()
      }
    })
  })
  child.stdin.write(
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) +
      '\n' +
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'setup_preflight', arguments: { project: 'cf-demo', token: secret } } }) +
      '\n',
  )
  try {
    await done
  } finally {
    child.kill()
    server.close()
  }
  const lines = out.split('\n').filter(Boolean).map((line) => JSON.parse(line))
  const listed = lines.find((line) => line.id === 1)
  assert.ok(listed.result.tools.some((tool) => tool.name === 'setup_preflight'))
  const called = lines.find((line) => line.id === 2)
  assert.equal(called.result.isError, true)
  assert.equal(JSON.stringify(called).includes(secret), false)
  assert.equal(seen.some((message) => message.method === 'tools/call'), false)
})
