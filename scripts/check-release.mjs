import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import onboarding from '../onboarding.json' with { type: 'json' }
import { patchWrangler, setupPlan, validateDomain, validateProjectName, validateUuid } from '../bin/setup-lib.mjs'

const root = new URL('..', import.meta.url).pathname
const readme = readFileSync(join(root, 'README.md'), 'utf8')
if (!readme.includes(onboarding.en) || !readme.includes(onboarding.zh)) {
  throw new Error('README is missing the onboarding sentence')
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.wrangler' || name === '.git' || name === '.dev.vars' || name === '.env' || name === '.cf-cms-setup.json') continue
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

const banned = /jemai\.cc|jemai_cc|jemai_session|Jemai/i
const pii = /Jem\s*Guo|\bAda\b|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\b(?:\+?\d{1,3}[\s.-])?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/
const publishSurfaces = ['README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md', 'CODE_OF_CONDUCT.md', 'onboarding.json', 'wrangler.toml', 'seed', 'src/i18n.ts', 'public']
for (const path of walk(root)) {
  if (path.endsWith('.png') || path.endsWith('.woff2') || path.endsWith('check-release.mjs')) continue
  const text = readFileSync(path, 'utf8')
  if (banned.test(text)) throw new Error(`Private branding in ${path}`)
  if (/ADMIN_PASSWORD=(?!\$\{)\S+/.test(text) && !path.endsWith('.example')) {
    throw new Error(`Password-looking value in ${path}`)
  }
  const rel = path.slice(root.length).replaceAll('\\', '/')
  if (publishSurfaces.some((surface) => rel === surface || rel.startsWith(`${surface}/`)) && pii.test(text)) {
    throw new Error(`Personal data in published copy: ${rel}`)
  }
}

if (!validateProjectName('cf-cms') || validateProjectName('Bad Name')) {
  throw new Error('project name check failed')
}
if (!validateDomain('blog.example.com') || validateDomain('https://example.com')) {
  throw new Error('domain check failed')
}
if (!validateUuid('00000000-0000-0000-0000-0000000000b1')) throw new Error('uuid check failed')

const sample = readFileSync(join(root, 'wrangler.toml'), 'utf8')
const patched = patchWrangler(sample, {
  project: 'cf-cms',
  siteUrl: 'https://blog.example.com',
  siteName: 'Field Notes',
  siteX: '',
  author: 'Field Notes',
  database: 'cf-cms-db',
  databaseId: '00000000-0000-0000-0000-0000000000b1',
  bucket: 'cf-cms-media',
})
if (!patched.includes('https://blog.example.com')) throw new Error('wrangler patch failed')
const plan = setupPlan({ project: 'cf-cms', domain: 'blog.example.com' })
if (plan.commands.some((line) => /CLOUDFLARE_API_TOKEN=|--api-token/.test(line))) throw new Error('plan leaked a token flag')
if (!plan.commands.some((line) => line.includes('d1 create'))) throw new Error('plan missing d1')
console.log('release checks ok')
