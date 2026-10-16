import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bucketNames,
  checklistBlocks,
  classifyDns,
  classifyFailure,
  evaluatePreflight,
  explainChecklistItem,
  findDatabase,
  formatChecklist,
  formatSetupError,
  freshDatabase,
  mapSetupError,
  nextProgress,
  pickAccount,
  readProgress,
  renderDevVars,
  rerunCommand,
  setupPlan,
  shouldSeed,
  stripAnsi,
  zoneCandidates,
} from '../bin/setup-lib.mjs'

const accountId = '0123456789abcdef0123456789abcdef'
const token = 'cfut_example_token_value_0123456789'
const project = 'cf-cms'
const domain = 'blog.example.com'

test('stripAnsi removes color codes', () => {
  const raw = '\u001b[31mPlease enable R2\u001b[0m [code: 10042]'
  assert.equal(stripAnsi(raw), 'Please enable R2 [code: 10042]')
  assert.equal(stripAnsi(raw).includes('\u001b'), false)
})

test('setup errors are bilingual, redacted, and free of stack traces', () => {
  const cases = [
    ['\u001b[31mPlease enable R2 through the Cloudflare Dashboard.\u001b[0m [code: 10042]', 'r2', 'r2-disabled', '/r2/overview'],
    ['Authentication error [code: 10000]', 'token', 'auth', 'api-tokens'],
    ['{"errors":[{"code":9109,"message":"Unauthorized to access requested resource"}]}', 'd1', 'permission', 'api-tokens'],
    ['A database with that name already exists', 'd1', 'exists', 'pages/view/cf-cms'],
    ['You have exceeded the limit of D1 databases you can create', 'd1', 'd1-limit', '/workers/d1'],
    ['Project name already taken', 'pages', 'pages-taken', '/pages'],
    ['fetch failed: getaddrinfo ENOTFOUND api.cloudflare.com', 'd1', 'network', 'cloudflarestatus.com'],
    ['custom domain validation failed', 'domain', 'domain', '/dns'],
  ]
  for (const [raw, step, kind, linkPart] of cases) {
    const mapped = mapSetupError({
      step,
      raw: `${raw}\n    at create (bin/create-cf-cms.mjs:1)\nAuthorization: Bearer ${token}`,
      accountId,
      project,
      domain,
      zoneId: 'zone123',
      secrets: [token],
    })
    const text = formatSetupError(mapped)
    assert.equal(mapped.kind, kind, raw)
    assert.match(text, /中文：/)
    assert.match(text, /English:/)
    assert.match(text, /下一步：/)
    assert.match(text, /Next:/)
    assert.match(text, new RegExp(linkPart.replaceAll('/', '\\/')))
    assert.match(text, new RegExp(accountId))
    assert.match(text, /CLOUDFLARE_API_TOKEN/)
    assert.equal(text.includes(token), false)
    assert.equal(text.includes('\u001b'), false)
    assert.equal(text.includes('at create'), false)
    assert.equal(text.includes('--token'), false)
    assert.match(text, /scripts\/setup\.sh/)
  }
})

test('permission guidance names the missing token permission', () => {
  const text = formatSetupError(mapSetupError({
    step: 'r2',
    kind: 'permission',
    permission: 'r2',
    raw: '[code: 9109]',
    accountId,
    project,
    domain,
  }))
  assert.match(text, /Workers R2 Storage/)
  assert.match(text, /D1/)
  assert.match(text, /Zone · DNS · Edit/)
  assert.match(text, /9109/)
})

test('rerun command omits the token', () => {
  const command = rerunCommand({ project, domain, accountId, replaceDns: true, forceSeed: true })
  assert.match(command, /--project cf-cms/)
  assert.match(command, /--domain blog\.example\.com/)
  assert.match(command, /--account-id 0123456789abcdef0123456789abcdef/)
  assert.match(command, /--replace-dns/)
  assert.match(command, /--seed/)
  assert.equal(command.includes(token), false)
  assert.equal(command.includes('--token'), false)
  assert.equal(command.includes('CLOUDFLARE_API_TOKEN='), false)
})

test('default plan creates D1 and does not leak a token', () => {
  const plan = setupPlan({ project, domain })
  assert.equal(plan.commands.some((line) => line.includes('d1 create')), true)
  assert.equal(plan.commands.some((line) => /CLOUDFLARE_API_TOKEN=|--api-token/.test(line)), false)
  assert.equal(plan.seed, true)
  assert.match(plan.commands.join('\n'), /seed\.sql/)
  assert.match(plan.commands.join('\n'), /replace A\/AAAA\/CNAME only with --replace-dns/)
})

test('existing resources are reused and sample posts stay put', () => {
  const plan = setupPlan({
    project,
    domain,
    databaseId: '00000000-0000-0000-0000-0000000000b1',
    bucketExists: true,
    pagesExists: true,
    freshDatabase: false,
  })
  assert.match(plan.commands.join('\n'), /reuse d1 cf-cms-db/)
  assert.match(plan.commands.join('\n'), /reuse r2 bucket cf-cms-media/)
  assert.match(plan.commands.join('\n'), /reuse pages project cf-cms/)
  assert.equal(plan.commands.some((line) => line.includes('d1 create')), false)
  assert.equal(plan.commands.some((line) => line.includes('seed.sql')), false)
  assert.match(plan.commands.join('\n'), /pass --seed/)
})

test('seed matrix', () => {
  assert.equal(shouldSeed({}), true)
  assert.equal(shouldSeed({ freshDatabase: false }), false)
  assert.equal(shouldSeed({ freshDatabase: false, forceSeed: true }), true)
  assert.equal(shouldSeed({ freshDatabase: true, skipSeed: true }), false)
  assert.equal(shouldSeed({ freshDatabase: true, skipSeed: true, forceSeed: true }), false)
  assert.equal(shouldSeed({ databaseId: '00000000-0000-0000-0000-0000000000b1' }), false)
})

test('preflight blocks before R2 is enabled and keeps a passing token', () => {
  const report = evaluatePreflight({
    tokenSupplied: true,
    tokenActive: true,
    accounts: [{ id: accountId, name: 'Example' }],
    domain,
    zone: { id: 'zone123', name: 'example.com', account: { id: accountId } },
    dns: classifyDns([{ id: '1', type: 'A', name: domain, content: '203.0.113.10', proxied: true }], domain, 'cf-cms.pages.dev'),
    probes: {
      pages: { ok: true },
      d1: { ok: true },
      r2: { ok: false, code: 10042, raw: 'Please enable R2 [code: 10042]' },
      dns: { ok: true },
    },
  })
  const text = formatChecklist(report.items)
  assert.equal(report.blocks, true)
  assert.match(text, /✓ API token is active/)
  assert.match(text, /✗ R2 is not enabled/)
  assert.match(text, /203\.0\.113\.10/)
  assert.equal(checklistBlocks(report.items), true)
  const guidance = explainChecklistItem(report.items.find((item) => item.id === 'r2'), { accountId, project, domain })
  assert.match(guidance, /10042/)
  assert.match(guidance, /r2\/overview/)
  assert.match(guidance, /中文：/)
})

test('one account is selected and several accounts ask for an id', () => {
  assert.equal(pickAccount([{ id: 'a', name: 'Only' }], '').account.id, 'a')
  const choice = evaluatePreflight({
    tokenSupplied: true,
    tokenActive: true,
    accounts: [{ id: 'a', name: 'One' }, { id: 'b', name: 'Two' }],
  })
  assert.equal(choice.blocks, true)
  const text = explainChecklistItem(choice.items.find((item) => item.id === 'account'), { project })
  assert.match(text, /--account-id/)
  assert.match(text, /One {2}a/)
  assert.equal(pickAccount([{ id: 'a', name: 'Only' }], 'missing').error, 'missing')
})

test('dry-run without a token does not block', () => {
  const report = evaluatePreflight({ tokenSupplied: false, allowMissingToken: true })
  assert.equal(report.blocks, false)
  assert.equal(report.items[0].level, 'warn')
})

test('zone must belong to the same account', () => {
  const missing = evaluatePreflight({
    tokenSupplied: true,
    tokenActive: true,
    accounts: [{ id: accountId, name: 'Example' }],
    requestedAccountId: accountId,
    domain,
    probes: { pages: { ok: true }, d1: { ok: true }, r2: { ok: true }, zone: { ok: true } },
  })
  assert.equal(missing.items.find((item) => item.id === 'zone').kind, 'zone-missing')
  const other = evaluatePreflight({
    tokenSupplied: true,
    tokenActive: true,
    accounts: [{ id: accountId, name: 'Example' }],
    requestedAccountId: accountId,
    domain,
    zone: { id: 'z', name: 'example.com', account: { id: 'other' } },
    probes: { pages: { ok: true }, d1: { ok: true }, r2: { ok: true } },
  })
  assert.equal(other.items.find((item) => item.id === 'zone').kind, 'zone-account')
})

test('DNS conflicts are shown and a matching proxied CNAME is reused', () => {
  const target = 'cf-cms.pages.dev'
  assert.equal(classifyDns([], domain, target).action, 'create')
  assert.equal(classifyDns([
    { type: 'CNAME', name: domain, content: 'cf-cms.pages.dev.', proxied: true },
  ], domain, target).action, 'ok')
  const conflict = classifyDns([
    { id: 'a', type: 'A', name: domain, content: '203.0.113.10', proxied: true },
    { id: 'b', type: 'AAAA', name: domain, content: '2001:db8::10', proxied: true },
    { id: 'c', type: 'CNAME', name: `www.${domain}`, content: 'elsewhere.example', proxied: true },
    { id: 'd', type: 'TXT', name: domain, content: 'ignore', proxied: false },
  ], domain, target)
  assert.equal(conflict.action, 'conflict')
  assert.deepEqual(conflict.records.map((record) => record.type), ['A', 'AAAA'])
  const unproxied = classifyDns([
    { type: 'CNAME', name: domain, content: target, proxied: false },
  ], domain, target)
  assert.equal(unproxied.action, 'conflict')
})

test('zone candidates walk up to the registrable name', () => {
  assert.deepEqual(zoneCandidates('blog.example.com'), ['blog.example.com', 'example.com'])
})

test('database and bucket lookups', () => {
  assert.equal(findDatabase([{ name: 'cf-cms-db', uuid: '00000000-0000-0000-0000-0000000000b1' }], 'cf-cms-db').uuid, '00000000-0000-0000-0000-0000000000b1')
  assert.deepEqual(bucketNames({ buckets: [{ name: 'cf-cms-media' }] }), ['cf-cms-media'])
  assert.deepEqual(bucketNames([{ name: 'cf-cms-media' }]), ['cf-cms-media'])
})

test('progress keeps resume state and drops secrets', () => {
  const saved = nextProgress({ token, adminPassword: 'secret-value', steps: { d1: 'created' }, databaseFresh: true }, { steps: { r2: 'done' } })
  assert.equal(saved.token, undefined)
  assert.equal(saved.adminPassword, undefined)
  assert.equal(saved.steps.d1, 'created')
  assert.equal(saved.steps.r2, 'done')
  assert.equal(freshDatabase(saved, false), true)
  assert.equal(freshDatabase({ ...saved, steps: { seed: 'done' } }, false), false)
  const loaded = readProgress(JSON.stringify({ token, project, databaseFresh: true, steps: {} }))
  assert.equal(loaded.token, undefined)
  assert.equal(loaded.project, project)
})

test('dev vars render keeps unrelated keys', () => {
  const text = renderDevVars({ SITE_URL: 'https://blog.example.com', ADMIN_SAFEPATH: 'abc' }, 'CF_ACCESS_AUD=audience\n')
  assert.match(text, /SITE_URL=https:\/\/blog\.example\.com/)
  assert.match(text, /CF_ACCESS_AUD=audience/)
  assert.match(text, /ADMIN_SAFEPATH=abc/)
})

test('classifyFailure reads JSON codes and wrangler text', () => {
  assert.equal(classifyFailure({ raw: '{"errors":[{"code":10042,"message":"Please enable R2"}]}' }).kind, 'r2-disabled')
  assert.equal(classifyFailure({ raw: 'permission denied', status: 403 }).kind, 'permission')
  assert.equal(classifyFailure({ step: 'domain', raw: 'validation still pending' }).kind, 'domain')
})
