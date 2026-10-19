// Local stdio bootstrap tools. They are not mounted on the in-site /mcp route.
// CLOUDFLARE_API_TOKEN is read from the environment only. Arguments named like a token are rejected.
// The token is never placed on argv and never returned.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { redact, setupPlan, validateDomain, validateProjectName } from '../../bin/setup-lib.mjs'

export const SETUP_TOOL_NAMES = ['setup_preflight', 'setup_deploy', 'setup_health']

const SCRIPT = fileURLToPath(new URL('../../bin/create-cf-cms.mjs', import.meta.url))
const ROOT = fileURLToPath(new URL('../..', import.meta.url))

export const SETUP_TOOLS = [
  {
    name: 'setup_preflight',
    description:
      'Dry-run the CF CMS Cloudflare setup. Reads CLOUDFLARE_API_TOKEN from the environment only. Do not pass a token argument. Returns the checklist and the planned commands. Nothing is created.',
    inputSchema: {
      type: 'object',
      required: ['project'],
      properties: {
        project: { type: 'string' },
        domain: { type: 'string' },
        skip_domain: { type: 'boolean' },
      },
    },
  },
  {
    name: 'setup_deploy',
    description:
      'Create or reuse D1, R2, and Pages for a CF CMS site by running create-cf-cms with --yes. Pass domain or skip_domain. Optional seed loads sample posts and deletes existing posts. replace_dns must be true to overwrite DNS; it is off unless you set it. The API token comes only from CLOUDFLARE_API_TOKEN. The admin safepath is masked. Content tools stay on the deployed site /mcp.',
    inputSchema: {
      type: 'object',
      required: ['project'],
      properties: {
        project: { type: 'string' },
        domain: { type: 'string' },
        skip_domain: { type: 'boolean' },
        seed: { type: 'boolean' },
        replace_dns: { type: 'boolean' },
      },
    },
  },
  {
    name: 'setup_health',
    description: 'GET {baseUrl}/health and return ok, d1, r2, and schema. Does not send a token.',
    inputSchema: {
      type: 'object',
      required: ['baseUrl'],
      properties: { baseUrl: { type: 'string' } },
    },
  },
]

export function isSetupTool(name) {
  return SETUP_TOOL_NAMES.includes(name)
}

export function tokenArgError(args, envToken = '') {
  if (args === undefined || args === null) return null
  if (typeof args !== 'object' || Array.isArray(args)) return 'Arguments must be an object'
  for (const key of Object.keys(args)) {
    if (/token/i.test(key)) return 'Token arguments are not accepted. Set CLOUDFLARE_API_TOKEN in the environment.'
  }
  if (typeof envToken === 'string' && envToken.length >= 8 && JSON.stringify(args).includes(envToken)) {
    return 'Token arguments are not accepted. Set CLOUDFLARE_API_TOKEN in the environment.'
  }
  return null
}

export function buildArgv(command, args) {
  const bag = args && typeof args === 'object' && !Array.isArray(args) ? args : {}
  const project = String(bag.project || '').trim()
  if (!validateProjectName(project)) return { ok: false, error: 'Invalid project name' }
  const domain = bag.domain ? String(bag.domain).trim().toLowerCase() : ''
  const skip = bag.skip_domain === true || bag.skipDomain === true
  if (domain && skip) return { ok: false, error: 'Pass domain or skip_domain, not both' }
  if (domain && !validateDomain(domain)) return { ok: false, error: 'Invalid domain' }
  if (command === 'deploy' && !domain && !skip) return { ok: false, error: 'Pass domain or skip_domain' }
  const argv = []
  if (command === 'preflight') argv.push('--dry-run')
  argv.push('--yes', '--project', project)
  if (domain) argv.push('--domain', domain)
  else argv.push('--skip-domain')
  if (bag.seed === true) argv.push('--seed')
  if (bag.replace_dns === true || bag.replaceDns === true) argv.push('--replace-dns')
  return { ok: true, argv, project, domain, skipDomain: !domain }
}

function assertArgvSafe(argv, token) {
  if (argv.some((part) => /^--(?:api-)?token$/i.test(String(part)))) {
    throw new Error('Refusing to pass the API token on the command line')
  }
  if (typeof token === 'string' && token.length >= 8 && argv.join('\n').includes(token)) {
    throw new Error('Refusing to pass the API token on the command line')
  }
}

export function maskAdminUrl(url) {
  const masked = String(url || '').replace(/^(https?:\/\/[^/\s]+)\/[^/\s]+\/admin\/?$/i, '$1/<safepath>/admin/')
  return masked === String(url || '') ? '' : masked
}

export function parseDeployOutput(stdout) {
  const site = /Site:\s+(\S+)/.exec(stdout || '')
  const url = site ? site[1] : ''
  const admin = /Admin:\s+(\S+)/.exec(stdout || '')
  return {
    url,
    adminPathMasked: admin ? maskAdminUrl(admin[1]) : '',
    mcpUrl: url ? `${url.replace(/\/$/, '')}/mcp` : '',
    reused: {
      d1: /reuse d1/.test(stdout || ''),
      r2: /reuse r2/.test(stdout || ''),
      pages: /reuse pages/.test(stdout || ''),
    },
  }
}

export async function setupHealth(baseUrl, fetchImpl = globalThis.fetch) {
  const url = String(baseUrl || '').trim().replace(/\/$/, '')
  if (!/^https?:\/\/[^\s]+$/i.test(url)) throw new Error('baseUrl must be an http(s) URL')
  const response = await fetchImpl(`${url}/health`, { headers: { accept: 'application/json' } })
  const body = await response.json()
  return {
    ok: body?.ok === true,
    d1: body?.d1 === true,
    r2: body?.r2 === true,
    schema: body?.schema === true,
  }
}

function defaultSpawn(argv) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...argv], {
      cwd: ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
  })
}

export async function callSetupTool(name, args, env = process.env, deps = {}) {
  const token = typeof env.CLOUDFLARE_API_TOKEN === 'string' ? env.CLOUDFLARE_API_TOKEN : ''
  const rejected = tokenArgError(args, token)
  if (rejected) throw new Error(rejected)
  if (name === 'setup_health') {
    const base = args && (args.baseUrl || args.base_url)
    return setupHealth(base, deps.fetch)
  }
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN is not set')
  const command = name === 'setup_preflight' ? 'preflight' : name === 'setup_deploy' ? 'deploy' : ''
  if (!command) throw new Error('Unknown setup tool')
  const built = buildArgv(command, args || {})
  if (!built.ok) throw new Error(built.error)
  assertArgvSafe(built.argv, token)
  const spawnImpl = deps.spawn || defaultSpawn
  const result = await spawnImpl(built.argv, env)
  const stdout = redact(result.stdout || '', [token])
  const stderr = redact(result.stderr || '', [token])
  if (stdout.includes(token) || stderr.includes(token)) throw new Error('Setup output was redacted')
  const plan = setupPlan({
    project: built.project,
    domain: built.domain,
    skipDomain: built.skipDomain,
    forceSeed: args?.seed === true,
    replaceDns: args?.replace_dns === true || args?.replaceDns === true,
  })
  if (name === 'setup_preflight') {
    return { ok: result.code === 0, project: built.project, plan, checklist: stdout, exitCode: result.code ?? 1 }
  }
  if (result.code !== 0) {
    const detail = (stderr || stdout).slice(0, 400)
    throw new Error(detail ? `Setup deploy failed. ${detail}` : 'Setup deploy failed')
  }
  return parseDeployOutput(stdout)
}
