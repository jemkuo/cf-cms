#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { readFileSync, writeFileSync } from 'node:fs'
import { stdin, stdout } from 'node:process'
import { patchWrangler, setupPlan, validateDomain, validateProjectName, validateUuid } from './setup-lib.mjs'

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

function flag(name, envName) {
  return flags.get(name) || process.env[envName] || ''
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

function run(command, input) {
  const [bin, ...rest] = command
  const result = spawnSync(bin, rest, {
    input,
    encoding: 'utf8',
    env: {
      ...process.env,
      CI: '1',
      CLOUDFLARE_API_TOKEN: token,
      CLOUDFLARE_ACCOUNT_ID: accountId,
    },
  })
  const output = `${result.stdout || ''}${result.stderr || ''}`.split(token).join('[redacted]')
  if (result.status !== 0) {
    throw new Error(output || `${bin} failed`)
  }
  return output
}

let token = ''
let accountId = ''

const project = await ask('Pages project name [cf-cms]: ', flag('project', 'CF_PAGES_PROJECT') || 'cf-cms')
if (!validateProjectName(project)) {
  console.error('Project name must be lowercase letters, numbers, and hyphens.')
  process.exit(1)
}
const domain = flag('domain', 'CF_CMS_DOMAIN') || flag('domain', 'CF_BLOGGER_DOMAIN') || (bools.has('skip-domain') ? '' : await ask('Custom domain (empty to skip): '))
if (domain && !validateDomain(domain)) {
  console.error('Domain must look like blog.example.com')
  process.exit(1)
}
const siteName = flag('site-name', 'CF_SITE_NAME') || (await ask('Site name [Field Notes]: ', 'Field Notes'))
const siteX = flag('site-x', 'CF_SITE_X') || ''
const author = flag('author', 'CF_AUTHOR') || siteName || 'Field Notes'
const databaseIdFlag = flag('database-id', 'CF_D1_ID')
if (databaseIdFlag && !validateUuid(databaseIdFlag)) {
  console.error('database-id must be a UUID')
  process.exit(1)
}

token = flag('token', 'CLOUDFLARE_API_TOKEN')
accountId = flag('account-id', 'CLOUDFLARE_ACCOUNT_ID')
if (!dryRun) {
  token = token || (await askSecret('CLOUDFLARE_API_TOKEN'))
  accountId = accountId || (await ask('Cloudflare account id: '))
  if (!token || !accountId) {
    console.error('A Cloudflare API token and account id are required.')
    process.exit(1)
  }
}

const plan = setupPlan({
  project,
  domain,
  skipSeed: bools.has('skip-seed'),
  skipDomain: bools.has('skip-domain') || !domain,
})

if (dryRun) {
  console.log(JSON.stringify({ ...plan, token: token ? '[redacted]' : '' }, null, 2))
  process.exit(0)
}

const adminPassword = flags.get('admin-password') || process.env.CFB_ADMIN_PASSWORD || (await askSecret('ADMIN_PASSWORD'))
if (!adminPassword) {
  console.error('ADMIN_PASSWORD is required.')
  process.exit(1)
}
const sessionSecret = flags.get('session-secret') || process.env.CFB_SESSION_SECRET || randomBytes(32).toString('hex')
const apiToken = flags.get('admin-api-token') || process.env.ADMIN_API_TOKEN || randomBytes(32).toString('hex')
const adminSafepath = flags.get('admin-safepath') || process.env.ADMIN_SAFEPATH || randomBytes(16).toString('hex')
if (!/^[A-Za-z0-9_-]{12,128}$/.test(adminSafepath)) {
  console.error('ADMIN_SAFEPATH must be 12–128 letters, numbers, underscores, or hyphens.')
  process.exit(1)
}

let databaseId = databaseIdFlag
if (!databaseId) {
  const created = run(['npx', 'wrangler', 'd1', 'create', plan.database])
  const match = created.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  if (!match) throw new Error('Could not read the new D1 database id')
  databaseId = match[0]
}
run(['npx', 'wrangler', 'r2', 'bucket', 'create', plan.bucket])
run(['npx', 'wrangler', 'pages', 'project', 'create', project, '--production-branch', 'main'])

const tomlPath = new URL('../wrangler.toml', import.meta.url)
const next = patchWrangler(readFileSync(tomlPath, 'utf8'), {
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
run(['npx', 'wrangler', 'd1', 'migrations', 'apply', plan.database, '--remote'])
if (!bools.has('skip-seed')) {
  run(['npx', 'wrangler', 'd1', 'execute', plan.database, '--remote', '--file=seed/seed.sql'])
}
run(['npx', 'wrangler', 'pages', 'secret', 'put', 'ADMIN_PASSWORD', '--project-name', project], `${adminPassword}\n`)
run(['npx', 'wrangler', 'pages', 'secret', 'put', 'SESSION_SECRET', '--project-name', project], `${sessionSecret}\n`)
run(['npx', 'wrangler', 'pages', 'secret', 'put', 'ADMIN_API_TOKEN', '--project-name', project], `${apiToken}\n`)
run(['npx', 'wrangler', 'pages', 'secret', 'put', 'ADMIN_SAFEPATH', '--project-name', project], `${adminSafepath}\n`)
run(['npx', 'wrangler', 'pages', 'deploy', 'public', '--project-name', project, '--commit-dirty=true'])

writeFileSync(
  new URL('../.dev.vars', import.meta.url),
  `ADMIN_PASSWORD=${adminPassword}\nSESSION_SECRET=${sessionSecret}\nADMIN_API_TOKEN=${apiToken}\nADMIN_SAFEPATH=${adminSafepath}\nSITE_URL=${plan.siteUrl}\n`,
)
console.log('Wrote gitignored .dev.vars for local use. The API token was not printed.')
console.log(`Admin URL: ${plan.siteUrl}/${adminSafepath}/admin/`)

if (domain && !bools.has('skip-domain')) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${project}/domains`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: domain }),
    },
  )
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body.success === false) {
    console.log(`Custom domain was not attached. Add a CNAME from ${domain} to ${project}.pages.dev, then retry.`)
  } else {
    console.log(`Attached ${domain}. Point DNS at ${project}.pages.dev if Cloudflare did not write the record.`)
  }
}

console.log(`Live at ${plan.siteUrl}`)
console.log('MCP: Authorization: Bearer <ADMIN_API_TOKEN> POST /mcp')
console.log('The admin API token is in .dev.vars and in the Pages secret ADMIN_API_TOKEN.')
