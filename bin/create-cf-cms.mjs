#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  bucketNames,
  checklistBlocks,
  classifyDns,
  classifyFailure,
  dashboardUrl,
  describeAccounts,
  evaluatePreflight,
  explainChecklistItem,
  findDatabase,
  formatChecklist,
  formatDnsRecord,
  formatSetupError,
  freshDatabase,
  mapSetupError,
  nextProgress,
  parseDevVars,
  patchWrangler,
  pickAccount,
  publicDetail,
  redact,
  PROGRESS_FILE,
  readProgress,
  renderDevVars,
  rerunCommand,
  setupPlan,
  shouldSeed,
  validateDomain,
  validateProjectName,
  validateUuid,
  zoneAccountId,
  zoneCandidates,
} from './setup-lib.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const flags = new Map()
const bools = new Set()
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]
  if (!arg.startsWith('--')) continue
  const key = arg.slice(2)
  const next = args[i + 1]
  if (!next || next.startsWith('--')) bools.add(key)
  else {
    flags.set(key, next)
    i += 1
  }
}

const dryRun = bools.has('dry-run')
const yes = bools.has('yes') || dryRun
const debug = bools.has('debug')
const state = {
  token: '',
  accountId: '',
  project: '',
  domain: '',
  zoneId: '',
  secrets: [],
}

if (bools.has('help')) {
  console.log(`Usage: ./scripts/setup.sh [flags]

  --dry-run          Show the preflight checklist and the plan, then stop
  --yes              Skip prompts. This does not replace DNS records
  --project NAME     Pages project name (default cf-cms)
  --domain HOST      Custom domain on a zone in the same account
  --skip-domain      Deploy on <project>.pages.dev
  --account-id ID    Required when the token can see more than one account
  --replace-dns      Replace conflicting A/AAAA/CNAME with a proxied CNAME
  --seed             Load sample posts. This deletes existing posts
  --skip-seed        Leave the database without sample posts
  --debug            On failure, print a redacted stack trace
  --site-name --site-x --author --database-id
  --admin-password --session-secret --admin-api-token --admin-safepath

The API token is read from CLOUDFLARE_API_TOKEN (or --token) and is never printed.
Reruns reuse an existing D1 database, R2 bucket, and Pages project.
`)
  process.exit(0)
}

function flag(name, envName) {
  return flags.get(name) || process.env[envName] || ''
}

function currentRerun(extra = {}) {
  return rerunCommand({
    project: state.project,
    domain: state.domain,
    accountId: state.accountId,
    forceSeed: bools.has('seed'),
    replaceDns: bools.has('replace-dns'),
    skipDomain: bools.has('skip-domain') || !state.domain,
    ...extra,
  })
}

function context() {
  return {
    accountId: state.accountId,
    project: state.project,
    domain: state.domain,
    zoneId: state.zoneId,
    rerun: currentRerun(),
    secrets: state.secrets,
  }
}

function die(step, raw) {
  console.error(formatSetupError(mapSetupError({ step, raw: String(raw || ''), ...context() })))
  if (debug) console.error(redact(String(raw || ''), state.secrets))
  process.exit(1)
}

async function ask(label, fallback = '') {
  if (!stdin.isTTY || yes) return fallback
  const rl = createInterface({ input: stdin, output: stdout })
  const value = (await rl.question(label)).trim()
  rl.close()
  return value || fallback
}

async function askSecret(label) {
  const preset = flags.get(label) || ''
  if (preset || !stdin.isTTY || yes) return preset
  stdout.write(`${label}: `)
  return new Promise((resolve) => {
    stdin.setRawMode(true)
    let value = ''
    const onData = (buf) => {
      const text = buf.toString('utf8')
      if (text === '\u0003') process.exit(1)
      if (text === '\r' || text === '\n') {
        stdin.setRawMode(false)
        stdin.off('data', onData)
        stdout.write('\n')
        resolve(value)
        return
      }
      if (text === '\u007f') value = value.slice(0, -1)
      else value += text
    }
    stdin.on('data', onData)
  })
}

function errorsRaw(body) {
  return JSON.stringify({ status: body?.status || 0, errors: body?.errors || [] })
}

async function cf(path, options = {}) {
  const method = options.method || 'GET'
  let response
  try {
    response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      method,
      headers: {
        authorization: `Bearer ${state.token}`,
        'content-type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
  } catch (error) {
    return { ok: false, status: 0, errors: [{ code: 0, message: error?.message || 'fetch failed' }], result: null }
  }
  const text = await response.text()
  let json
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = { success: false, errors: [{ message: text.slice(0, 300) }] }
  }
  const errors = Array.isArray(json.errors) ? json.errors : []
  return {
    ok: response.ok && json.success !== false,
    status: response.status,
    errors,
    result: json.result,
    result_info: json.result_info,
  }
}

async function listAll(path) {
  const items = []
  for (let page = 1; page <= 20; page += 1) {
    const joiner = path.includes('?') ? '&' : '?'
    const body = await cf(`${path}${joiner}per_page=50&page=${page}`)
    if (!body.ok) return body
    const batch = Array.isArray(body.result) ? body.result : []
    items.push(...batch)
    const pages = body.result_info?.total_pages || 1
    if (page >= pages) return { ok: true, status: 200, errors: [], result: items }
  }
  return { ok: true, status: 200, errors: [], result: items }
}

function asProbe(body) {
  const code = (body?.errors || []).find((error) => error.code)?.code
  return { ok: Boolean(body?.ok), status: body?.status, raw: errorsRaw(body), code }
}

async function findZone(hostname) {
  for (const name of zoneCandidates(hostname)) {
    const body = await cf(`/zones?name=${encodeURIComponent(name)}`)
    if (!body.ok) return body
    const zone = (body.result || []).find((item) => item.name === name)
    if (zone) return { ok: true, status: 200, errors: [], result: zone }
  }
  return { ok: true, status: 200, errors: [], result: null }
}

function run(command, input) {
  const [bin, ...rest] = command
  const result = spawnSync(bin, rest, {
    input,
    encoding: 'utf8',
    cwd: root,
    env: {
      ...process.env,
      CI: '1',
      CLOUDFLARE_API_TOKEN: state.token,
      CLOUDFLARE_ACCOUNT_ID: state.accountId,
    },
  })
  const output = `${result.stdout || ''}${result.stderr || ''}`
  if (result.error || result.status !== 0) return { ok: false, output: output || result.error?.message || 'command failed' }
  return { ok: true, output }
}

function mustRun(step, command, input) {
  const result = run(command, input)
  if (!result.ok) die(step, result.output)
  return result.output
}

const progressPath = join(root, PROGRESS_FILE)
const devVarsPath = join(root, '.dev.vars')

function loadProgress(projectName) {
  try {
    const parsed = readProgress(readFileSync(progressPath, 'utf8'))
    if (parsed?.project === projectName) return parsed
  } catch {
    // A missing progress file means this is the first run.
  }
  return nextProgress({}, { project: projectName, steps: {} })
}

function saveProgress(progress) {
  writeFileSync(progressPath, `${JSON.stringify(nextProgress(progress, {}), null, 2)}\n`, { mode: 0o600 })
}

async function gatherPreflight(project, domain) {
  if (!state.token) {
    return {
      report: evaluatePreflight({ tokenSupplied: false, allowMissingToken: dryRun, domain }),
      resources: {},
    }
  }
  const verified = await cf('/user/tokens/verify')
  const tokenActive = verified.ok && verified.result?.status === 'active'
  if (!tokenActive) {
    return {
      report: evaluatePreflight({
        tokenSupplied: true,
        tokenActive: false,
        tokenError: errorsRaw(verified),
        domain,
      }),
      resources: {},
    }
  }
  const accountsBody = await cf('/accounts')
  if (!accountsBody.ok) {
    const item = {
      id: 'account',
      level: 'fail',
      en: 'Account list failed',
      zh: '读取账号列表失败',
      kind: classifyFailure({ raw: errorsRaw(accountsBody), status: accountsBody.status, step: 'account' }).kind,
      raw: errorsRaw(accountsBody),
      permission: 'account',
    }
    return {
      report: {
        items: [
          { id: 'token', level: 'ok', en: 'API token is active', zh: 'API token 有效' },
          item,
        ],
        blocks: true,
        account: null,
        zone: null,
      },
      resources: {},
    }
  }
  const accounts = Array.isArray(accountsBody.result) ? accountsBody.result : []
  let requested = state.accountId
  let picked = pickAccount(accounts, requested)
  if (picked.error === 'choose' && stdin.isTTY && !yes) {
    console.log(describeAccounts(picked.accounts))
    requested = await ask('Cloudflare account id: ')
    state.accountId = requested
    picked = pickAccount(accounts, requested)
  }
  if (!picked.account) {
    return {
      report: evaluatePreflight({
        tokenSupplied: true,
        tokenActive: true,
        accounts,
        requestedAccountId: requested,
        domain,
      }),
      resources: {},
    }
  }
  state.accountId = picked.account.id
  const pages = await listAll(`/accounts/${state.accountId}/pages/projects`)
  const databases = await listAll(`/accounts/${state.accountId}/d1/database`)
  const buckets = await cf(`/accounts/${state.accountId}/r2/buckets`)
  let zone = null
  let zoneBody = { ok: true, status: 200, errors: [] }
  let dnsBody = { ok: true, status: 200, errors: [] }
  let dns = null
  if (domain) {
    zoneBody = await findZone(domain)
    zone = zoneBody.ok ? zoneBody.result : null
    if (zone && zoneAccountId(zone) === state.accountId) {
      state.zoneId = zone.id
      dnsBody = await cf(`/zones/${zone.id}/dns_records?name=${encodeURIComponent(domain)}`)
      if (dnsBody.ok) dns = classifyDns(dnsBody.result, domain, `${project}.pages.dev`)
    }
  }
  const report = evaluatePreflight({
    tokenSupplied: true,
    tokenActive: true,
    accounts,
    requestedAccountId: state.accountId,
    domain,
    zone,
    dns,
    probes: {
      pages: asProbe(pages),
      d1: asProbe(databases),
      r2: asProbe(buckets),
      zone: domain ? asProbe(zoneBody) : undefined,
      dns: domain && zone ? asProbe(dnsBody) : undefined,
    },
  })
  return {
    report,
    resources: {
      databases: databases.ok ? databases.result : [],
      buckets: buckets.ok ? buckets.result : null,
      projects: pages.ok ? pages.result : [],
    },
  }
}

async function confirmReplace() {
  if (bools.has('replace-dns')) return true
  if (!stdin.isTTY || bools.has('yes')) return false
  const answer = await ask('Replace those records with a proxied CNAME? [y/N] ')
  return /^y(es)?$/i.test(answer)
}

async function syncDns(zoneId, domain, project) {
  const target = `${project}.pages.dev`
  const listed = await cf(`/zones/${zoneId}/dns_records?name=${encodeURIComponent(domain)}`)
  if (!listed.ok) die('dns', errorsRaw(listed))
  const decision = classifyDns(listed.result, domain, target)
  if (decision.action === 'ok') {
    console.log(`CNAME ${domain} -> ${target} is already proxied.`)
    return true
  }
  if (decision.action === 'create') {
    const created = await cf(`/zones/${zoneId}/dns_records`, {
      method: 'POST',
      body: { type: 'CNAME', name: domain, content: target, proxied: true, ttl: 1 },
    })
    if (!created.ok) die('dns', errorsRaw(created))
    console.log(`Created proxied CNAME ${domain} -> ${target}`)
    return true
  }
  console.log(`DNS records for ${domain}:`)
  for (const record of decision.records) console.log(`  ${formatDnsRecord(record)}`)
  console.log(`中文：这些记录还指着别处，Pages 域名校验会停在 pending。上面的记录不会被自动删除。`)
  console.log(`English: These records still point somewhere else, so domain validation stays pending. They are left in place.`)
  console.log(`A proxied CNAME ${domain} -> ${target} is what Pages expects.`)
  const replace = await confirmReplace()
  if (!replace) {
    console.log('Rerun with --replace-dns to delete the records above and write that CNAME.')
    console.log(`重跑时加上 --replace-dns 才会删除上述记录并写入 CNAME。`)
    return false
  }
  for (const record of decision.records) {
    if (!record.id) die('dns', `DNS record ${record.type} ${record.name} has no id`)
    const deleted = await cf(`/zones/${zoneId}/dns_records/${record.id}`, { method: 'DELETE' })
    if (!deleted.ok) die('dns', errorsRaw(deleted))
  }
  const created = await cf(`/zones/${zoneId}/dns_records`, {
    method: 'POST',
    body: { type: 'CNAME', name: domain, content: target, proxied: true, ttl: 1 },
  })
  if (!created.ok) die('dns', errorsRaw(created))
  console.log(`Replaced DNS with proxied CNAME ${domain} -> ${target}`)
  return true
}

async function attachDomain(project, domain, dnsReady) {
  const endpoint = `/accounts/${state.accountId}/pages/projects/${encodeURIComponent(project)}/domains`
  const attached = await cf(endpoint, { method: 'POST', body: { name: domain } })
  if (!attached.ok) {
    const raw = errorsRaw(attached)
    const kind = classifyFailure({ raw, status: attached.status, step: 'domain' })
    if (kind.kind !== 'exists') die('domain', raw)
  }
  if (!dnsReady) return 'pending'
  const one = `${endpoint}/${encodeURIComponent(domain)}`
  const patched = await cf(one, { method: 'PATCH', body: { name: domain } })
  if (!patched.ok) {
    console.log('域名校验重试没有完成，下面仍会查询当前状态。')
    console.log('Domain validation was not retried. Current status follows.')
    if (debug) console.error(publicDetail(errorsRaw(patched), state.secrets))
  }
  let status = 'pending'
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const got = await cf(one)
    if (got.ok) status = got.result?.status || status
    if (status === 'active') break
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  return status
}

function reportDomain(domain, status, dnsReady, project) {
  console.log(`Domain status / 域名状态: ${status}`)
  if (status === 'active') {
    console.log(`https://${domain} is active.`)
    return
  }
  console.log('证书和 DNS 传播可能还要几分钟。SSL and DNS propagation can take several minutes.')
  if (!dnsReady) {
    console.log('DNS 冲突还在。看过上面的记录后，用 --replace-dns 重跑。')
    console.log('DNS conflicts remain. After you review the records above, rerun with --replace-dns.')
  }
  console.log(`Open: ${dashboardUrl(state.accountId, `pages/view/${project}`)}`)
}

async function main() {
  state.project = await ask('Pages project name [cf-cms]: ', flag('project', 'CF_PAGES_PROJECT') || 'cf-cms')
  if (!validateProjectName(state.project)) {
    console.error('项目名只能用小写字母、数字和连字符。\nProject name must be lowercase letters, numbers, and hyphens.')
    process.exit(1)
  }
  const project = state.project
  state.domain = flag('domain', 'CF_CMS_DOMAIN') || flag('domain', 'CF_BLOGGER_DOMAIN') || (bools.has('skip-domain') ? '' : await ask('Custom domain (empty to skip): '))
  const domain = state.domain
  if (domain && !validateDomain(domain)) {
    console.error('域名需要类似 blog.example.com。\nDomain must look like blog.example.com')
    process.exit(1)
  }
  const siteName = flag('site-name', 'CF_SITE_NAME') || (await ask('Site name [Field Notes]: ', 'Field Notes'))
  const siteX = flag('site-x', 'CF_SITE_X') || ''
  const author = flag('author', 'CF_AUTHOR') || siteName || 'Field Notes'
  const databaseIdFlag = flag('database-id', 'CF_D1_ID')
  if (databaseIdFlag && !validateUuid(databaseIdFlag)) {
    console.error('database-id 必须是 UUID。\ndatabase-id must be a UUID')
    process.exit(1)
  }

  state.token = flag('token', 'CLOUDFLARE_API_TOKEN')
  state.accountId = flag('account-id', 'CLOUDFLARE_ACCOUNT_ID')
  if (!dryRun && !state.token) state.token = await askSecret('CLOUDFLARE_API_TOKEN')
  state.secrets = [state.token].filter((value) => value && value.length >= 8)

  const progress = loadProgress(project)
  const { report, resources } = await gatherPreflight(project, domain)
  console.log(formatChecklist(report.items))
  const existingDb = findDatabase(resources.databases || [], `${project}-db`)
  const knownId = databaseIdFlag || existingDb?.uuid || ''
  const fresh = databaseIdFlag ? false : (!knownId || freshDatabase(progress, false))
  const plan = setupPlan({
    project,
    domain,
    skipSeed: bools.has('skip-seed'),
    forceSeed: bools.has('seed'),
    skipDomain: bools.has('skip-domain') || !domain,
    databaseId: knownId,
    bucketExists: bucketNames(resources.buckets).includes(`${project}-media`),
    pagesExists: (resources.projects || []).some((item) => item.name === project),
    freshDatabase: fresh,
    replaceDns: bools.has('replace-dns'),
  })
  console.log('\nPlan / 计划')
  for (const line of plan.commands) console.log(`  ${line}`)
  if (report.blocks || checklistBlocks(report.items)) {
    console.error('\n预检未通过，没有创建或修改任何资源。\nPreflight failed. Nothing was created or changed.')
    for (const item of report.items) {
      const text = explainChecklistItem(item, context())
      if (text) console.error(`\n${text}`)
    }
    process.exit(1)
  }
  if (dryRun) {
    console.log('\nDry run: no resources were created.')
    process.exit(0)
  }

  const existingVars = (() => {
    try {
      const text = readFileSync(devVarsPath, 'utf8')
      return { text, values: parseDevVars(text) }
    } catch {
      return { text: '', values: {} }
    }
  })()
  const generatedPassword = !(flags.get('admin-password') || process.env.CFB_ADMIN_PASSWORD || existingVars.values.ADMIN_PASSWORD)
  const adminPassword = flags.get('admin-password') || process.env.CFB_ADMIN_PASSWORD || existingVars.values.ADMIN_PASSWORD || randomBytes(24).toString('base64url')
  const sessionSecret = flags.get('session-secret') || process.env.CFB_SESSION_SECRET || existingVars.values.SESSION_SECRET || randomBytes(32).toString('hex')
  const apiToken = flags.get('admin-api-token') || process.env.ADMIN_API_TOKEN || existingVars.values.ADMIN_API_TOKEN || randomBytes(32).toString('hex')
  const adminSafepath = flags.get('admin-safepath') || process.env.ADMIN_SAFEPATH || existingVars.values.ADMIN_SAFEPATH || randomBytes(16).toString('hex')
  if (!/^[A-Za-z0-9_-]{12,128}$/.test(adminSafepath)) {
    console.error('ADMIN_SAFEPATH 需要 12–128 位字母、数字、下划线或连字符。\nADMIN_SAFEPATH must be 12–128 letters, numbers, underscores, or hyphens.')
    process.exit(1)
  }
  state.secrets = [state.token, adminPassword, sessionSecret, apiToken].filter((value) => value && value.length >= 8)
  const devVars = renderDevVars({
    ADMIN_PASSWORD: adminPassword,
    SESSION_SECRET: sessionSecret,
    ADMIN_API_TOKEN: apiToken,
    ADMIN_SAFEPATH: adminSafepath,
    SITE_URL: plan.siteUrl,
  }, existingVars.text)
  writeFileSync(devVarsPath, devVars, { mode: 0o600 })

  let databaseId = knownId
  let createdNow = false
  if (!databaseId) {
    const created = run(['npx', 'wrangler', 'd1', 'create', plan.database])
    if (!created.ok) {
      const kind = classifyFailure({ raw: created.output, step: 'd1' })
      const again = kind.kind === 'exists' ? await listAll(`/accounts/${state.accountId}/d1/database`) : null
      const found = again?.ok ? findDatabase(again.result, plan.database) : null
      if (!found?.uuid) die('d1', created.output)
      databaseId = found.uuid
    } else {
      const match = created.output.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
      if (!match) die('d1', created.output || 'Could not read the new D1 database id')
      databaseId = match[0]
      createdNow = true
    }
  }
  let saved = nextProgress(progress, {
    project,
    accountId: state.accountId,
    database: plan.database,
    databaseId,
    databaseFresh: createdNow ? true : freshDatabase(progress, false),
    steps: { d1: createdNow ? 'created' : 'reused' },
  })
  saveProgress(saved)

  if (!plan.commands.some((line) => line.startsWith('reuse r2'))) {
    const created = run(['npx', 'wrangler', 'r2', 'bucket', 'create', plan.bucket])
    if (!created.ok && classifyFailure({ raw: created.output, step: 'r2' }).kind !== 'exists') die('r2', created.output)
  }
  saved = nextProgress(saved, { steps: { r2: 'done' } })
  saveProgress(saved)

  if (!plan.commands.some((line) => line.startsWith('reuse pages'))) {
    const created = run(['npx', 'wrangler', 'pages', 'project', 'create', project, '--production-branch', 'main'])
    if (!created.ok) {
      const again = await listAll(`/accounts/${state.accountId}/pages/projects`)
      const visible = again.ok && (again.result || []).some((item) => item.name === project)
      if (!visible) die('pages', created.output)
    }
  }
  saved = nextProgress(saved, { steps: { pages: 'done' } })
  saveProgress(saved)

  const tomlPath = join(root, 'wrangler.toml')
  const next = patchWranglerSafe(readFileSync(tomlPath, 'utf8'), {
    project,
    siteUrl: plan.siteUrl,
    siteName,
    siteX,
    author,
    database: plan.database,
    databaseId,
    bucket: plan.bucket,
  })
  writeFileSync(tomlPath, next)
  saved = nextProgress(saved, { steps: { patch: 'done' } })
  saveProgress(saved)

  mustRun('migrate', ['npx', 'wrangler', 'd1', 'migrations', 'apply', plan.database, '--remote'])
  saved = nextProgress(saved, { steps: { migrate: 'done' } })
  saveProgress(saved)

  const seedNow = shouldSeed({
    skipSeed: bools.has('skip-seed'),
    forceSeed: bools.has('seed'),
    freshDatabase: databaseIdFlag ? false : (createdNow || freshDatabase(progress, false)),
  })
  if (seedNow) {
    console.log(`Loading sample posts into ${plan.database}. This deletes existing posts, tags, and translations.`)
    console.log(`正在写入示例文章到 ${plan.database}。这会删除已有的文章、标签和译文。`)
    mustRun('seed', ['npx', 'wrangler', 'd1', 'execute', plan.database, '--remote', '--file=seed/seed.sql'])
    saved = nextProgress(saved, { databaseFresh: false, steps: { seed: 'done' } })
  } else {
    console.log(`Skipped sample posts for ${plan.database}. Pass --seed to load them (that deletes existing posts).`)
    saved = nextProgress(saved, {
      databaseFresh: bools.has('skip-seed') ? false : saved.databaseFresh,
      steps: { seed: 'skipped' },
    })
  }
  saveProgress(saved)

  mustRun('secrets', ['npx', 'wrangler', 'pages', 'secret', 'put', 'ADMIN_PASSWORD', '--project-name', project], `${adminPassword}\n`)
  mustRun('secrets', ['npx', 'wrangler', 'pages', 'secret', 'put', 'SESSION_SECRET', '--project-name', project], `${sessionSecret}\n`)
  mustRun('secrets', ['npx', 'wrangler', 'pages', 'secret', 'put', 'ADMIN_API_TOKEN', '--project-name', project], `${apiToken}\n`)
  mustRun('secrets', ['npx', 'wrangler', 'pages', 'secret', 'put', 'ADMIN_SAFEPATH', '--project-name', project], `${adminSafepath}\n`)
  saved = nextProgress(saved, { steps: { secrets: 'done' } })
  saveProgress(saved)

  mustRun('deploy', ['npx', 'wrangler', 'pages', 'deploy', 'public', '--project-name', project, '--commit-dirty=true'])
  saved = nextProgress(saved, { steps: { deploy: 'done' } })
  saveProgress(saved)

  let domainStatus = ''
  if (domain && !bools.has('skip-domain')) {
    if (!state.zoneId && report.zone?.id) state.zoneId = report.zone.id
    if (!state.zoneId) die('zone', `Zone for ${domain} was not found`)
    const dnsReady = await syncDns(state.zoneId, domain, project)
    domainStatus = await attachDomain(project, domain, dnsReady)
    reportDomain(domain, domainStatus, dnsReady, project)
    saved = nextProgress(saved, { steps: { domain: domainStatus, dns: dnsReady ? 'ready' : 'conflict' } })
    saveProgress(saved)
  }

  console.log('\nCF CMS is deployed. / CF CMS 已部署。')
  console.log(`Site:       ${plan.siteUrl}`)
  console.log(`pages.dev:  ${plan.pagesUrl}`)
  console.log(`Admin:      ${plan.siteUrl}/${adminSafepath}/admin/`)
  console.log('Secrets:    .dev.vars (local) and the Pages project secrets (production).')
  console.log('密钥位置：  本地 .dev.vars，线上在 Pages 项目的 secrets。')
  if (generatedPassword) console.log('Admin password: generated and written to .dev.vars. It was not printed.')
  else console.log('Admin password: kept from .dev.vars or the value you passed. It was not printed.')
  console.log('API token:  kept in CLOUDFLARE_API_TOKEN. It was not printed.')
  if (domainStatus) console.log(`Domain:     ${domainStatus}`)
  console.log('Next / 接下来:')
  console.log('  Open the admin URL and sign in with the password stored in .dev.vars.')
  console.log('  打开 Admin 地址，用 .dev.vars 里的密码登录。')
  console.log('  MCP: Authorization: Bearer <ADMIN_API_TOKEN from .dev.vars> POST /mcp')
  console.log('  Rotate the Cloudflare API token when setup no longer needs it.')
  console.log('  安装完成后可以轮换 Cloudflare API token。')
}

function patchWranglerSafe(source, fields) {
  try {
    return patchWrangler(source, fields)
  } catch (error) {
    die('patch', error.message)
  }
  return source
}

main().catch((error) => {
  const raw = error?.output || error?.message || String(error)
  console.error(formatSetupError(mapSetupError({ step: error?.step || 'setup', raw, ...context() })))
  if (debug && error?.stack) console.error(redact(error.stack, state.secrets))
  process.exit(1)
})
