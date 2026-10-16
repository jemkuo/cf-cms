const PROJECT = /^[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?$/
const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ANSI = /\u001b(?:\[[0-9;]*[A-Za-z]|\][^\u0007]*(?:\u0007|\u001b\\))/g

export const PROGRESS_FILE = '.cf-cms-setup.json'

export const PERMISSIONS = {
  pages: { en: 'Account · Cloudflare Pages · Edit', zh: '账户 · Cloudflare Pages · 编辑' },
  d1: { en: 'Account · D1 · Edit', zh: '账户 · D1 · 编辑' },
  r2: { en: 'Account · Workers R2 Storage · Edit', zh: '账户 · Workers R2 Storage · 编辑' },
  account: { en: 'Account · Account Settings · Read', zh: '账户 · Account Settings · 读取' },
  zone: { en: 'Zone · Zone · Read', zh: '区域 · Zone · 读取' },
  dns: { en: 'Zone · DNS · Edit', zh: '区域 · DNS · 编辑' },
}

const SECRET_KEYS = ['token', 'adminPassword', 'password', 'apiToken', 'sessionSecret', 'ADMIN_PASSWORD', 'ADMIN_API_TOKEN', 'SESSION_SECRET', 'CLOUDFLARE_API_TOKEN']

export function validateProjectName(value) {
  return PROJECT.test(value || '')
}

export function validateDomain(value) {
  return DOMAIN.test(String(value || '').toLowerCase())
}

export function validateUuid(value) {
  return UUID.test(value || '')
}

export function stripAnsi(text) {
  return String(text ?? '').replace(ANSI, '')
}

export function redact(text, secrets = []) {
  let out = stripAnsi(text)
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 8) out = out.split(secret).join('[redacted]')
  }
  out = out.replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [redacted]')
  out = out.replace(/CLOUDFLARE_API_TOKEN=\S+/g, 'CLOUDFLARE_API_TOKEN=[redacted]')
  out = out.replace(/(--(?:api-token|token)\s+)\S+/gi, '$1[redacted]')
  return out
}

export function publicDetail(raw, secrets = []) {
  return redact(raw, secrets)
    .split('\n')
    .filter((line) => !/^\s*at \S/.test(line))
    .join('\n')
    .trim()
    .slice(0, 500)
}

export function extractErrorCodes(text) {
  const raw = stripAnsi(text)
  const codes = new Set()
  for (const match of raw.matchAll(/\[code:\s*(\d+)\]|"code"\s*:\s*(\d+)|\bcode\s*[:=]\s*(\d+)/gi)) {
    codes.add(match[1] || match[2] || match[3])
  }
  return [...codes]
}

export function pagesProbePaths(accountId, project) {
  return {
    list: `/accounts/${encodeURIComponent(accountId)}/pages/projects`,
    project: `/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(project)}`,
  }
}

export function cloudflareMessages(raw) {
  const text = stripAnsi(String(raw ?? '')).trim()
  if (!text) return []
  const found = []
  const collect = (value) => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const item of value) collect(item)
      return
    }
    if (typeof value.message === 'string' && value.message.trim()) found.push(value.message.trim())
    if (value.errors) collect(value.errors)
  }
  try {
    collect(JSON.parse(text))
  } catch {
    // Wrangler and fetch failures are plain text.
  }
  if (found.length) return [...new Set(found)]
  const plain = text.split('\n').filter((line) => !/^\s*at \S/.test(line)).join(' ').trim()
  return plain ? [plain.slice(0, 400)] : []
}

export function isMissingPagesProject({ status, raw = '', errors } = {}) {
  if (status === 404) return true
  const payload = raw || JSON.stringify({ errors: errors || [] })
  return extractErrorCodes(payload).includes('8000007')
}

export function classifyFailure({ raw = '', status, step } = {}) {
  const text = stripAnsi(raw)
  const lower = text.toLowerCase()
  const codes = extractErrorCodes(text)
  if (codes.includes('10042') || /enable r2/.test(lower)) return { kind: 'r2-disabled', codes }
  if (/enotfound|econnreset|etimedout|eai_again|fetch failed|socket hang up|getaddrinfo|network error/.test(lower)) {
    return { kind: 'network', codes }
  }
  if (status === 404 || codes.includes('8000007')) return { kind: 'not-found', codes }
  if (codes.includes('10000') || /authentication error|invalid api token|invalid access token/.test(lower)) {
    return { kind: 'auth', codes }
  }
  const foreignCodes = codes.filter((code) => code !== '9109' && code !== '10000')
  const permissionText = /not authorized|permission denied|insufficient permission|unauthorized to access/.test(lower)
  if (codes.includes('9109') || (foreignCodes.length === 0 && (status === 403 || permissionText))) {
    return { kind: 'permission', codes }
  }
  if (/exceeded the limit|too many .*d1|d1 database.*limit|maximum number of databases|quota exceeded/.test(lower)) {
    return { kind: 'd1-limit', codes }
  }
  if (step === 'pages' && /already (exists|been taken|in use)|name (?:is )?taken|project.*taken/.test(lower)) {
    return { kind: 'pages-taken', codes }
  }
  if (/already exists|already been added|already added|duplicate/.test(lower)) return { kind: 'exists', codes }
  if (step === 'domain' || step === 'dns') return { kind: 'domain', codes }
  return { kind: 'unknown', codes }
}

export function patchWrangler(source, fields) {
  let text = source
  const set = (pattern, line) => {
    if (!pattern.test(text)) throw new Error(`Could not patch wrangler.toml (${line})`)
    text = text.replace(pattern, line)
  }
  set(/^name = ".*"$/m, `name = "${fields.project}"`)
  set(/^SITE_URL = ".*"$/m, `SITE_URL = "${fields.siteUrl}"`)
  set(/^SITE_NAME = ".*"$/m, `SITE_NAME = "${fields.siteName.replaceAll('"', '')}"`)
  set(/^SITE_X = ".*"$/m, `SITE_X = "${fields.siteX.replaceAll('"', '')}"`)
  set(/^DEFAULT_AUTHOR = ".*"$/m, `DEFAULT_AUTHOR = "${fields.author.replaceAll('"', '')}"`)
  set(/^database_name = ".*"$/m, `database_name = "${fields.database}"`)
  if (fields.databaseId) set(/^database_id = ".*"$/m, `database_id = "${fields.databaseId}"`)
  set(/^bucket_name = ".*"$/m, `bucket_name = "${fields.bucket}"`)
  return text
}

export function shouldSeed(options = {}) {
  if (options.skipSeed) return false
  if (options.forceSeed) return true
  return Boolean(options.freshDatabase ?? !options.databaseId)
}

export function setupPlan(options) {
  const project = options.project
  const database = `${project}-db`
  const bucket = `${project}-media`
  const pagesUrl = `https://${project}.pages.dev`
  const siteUrl = options.domain ? `https://${options.domain}` : pagesUrl
  const commands = []
  if (options.databaseId) commands.push(`reuse d1 ${database} ${options.databaseId}`)
  else commands.push(`wrangler d1 create ${database}`)
  if (options.bucketExists) commands.push(`reuse r2 bucket ${bucket}`)
  else commands.push(`wrangler r2 bucket create ${bucket}`)
  if (options.pagesExists) commands.push(`reuse pages project ${project}`)
  else commands.push(`wrangler pages project create ${project} --production-branch main`)
  commands.push(`wrangler d1 migrations apply ${database} --remote`)
  if (shouldSeed(options)) commands.push(`wrangler d1 execute ${database} --remote --file=seed/seed.sql`)
  else if (options.skipSeed && options.forceSeed) {
    commands.push(`skip seed for ${database} (--skip-seed is set, sample posts stay unloaded)`)
  } else {
    commands.push(`skip seed for ${database} (pass --seed to load sample posts; that deletes existing posts)`)
  }
  commands.push(
    `wrangler pages secret put ADMIN_PASSWORD --project-name ${project}`,
    `wrangler pages secret put SESSION_SECRET --project-name ${project}`,
    `wrangler pages secret put ADMIN_API_TOKEN --project-name ${project}`,
    `wrangler pages secret put ADMIN_SAFEPATH --project-name ${project}`,
    `wrangler pages deploy public --project-name ${project} --commit-dirty=true`,
  )
  if (options.domain && !options.skipDomain) {
    commands.push(
      options.replaceDns
        ? `replace DNS at ${options.domain} with proxied CNAME ${project}.pages.dev`
        : `inspect DNS at ${options.domain}; create proxied CNAME ${project}.pages.dev when absent; replace A/AAAA/CNAME only with --replace-dns`,
    )
    commands.push(`POST /accounts/{account}/pages/projects/${project}/domains { name: ${options.domain} }`)
    commands.push(`poll domain status for ${options.domain}`)
  }
  return { project, database, bucket, siteUrl, pagesUrl, commands, seed: shouldSeed(options) }
}

export function rerunCommand(options = {}) {
  const bits = ['./scripts/setup.sh', '--yes']
  if (options.project) bits.push('--project', options.project)
  if (options.domain) bits.push('--domain', options.domain)
  if (options.accountId) bits.push('--account-id', options.accountId)
  if (options.forceSeed) bits.push('--seed')
  if (options.replaceDns) bits.push('--replace-dns')
  if (options.skipDomain) bits.push('--skip-domain')
  return bits.join(' ')
}

export function dashboardUrl(accountId, path = '') {
  const id = accountId || '<account-id>'
  const suffix = path ? `/${path.replace(/^\//, '')}` : ''
  return `https://dash.cloudflare.com/${id}${suffix}`
}

export function pickAccount(accounts, requestedId = '') {
  const list = Array.isArray(accounts) ? accounts : []
  if (requestedId) {
    const found = list.find((account) => account.id === requestedId)
    if (!found) return { error: 'missing', accounts: list }
    return { account: found }
  }
  if (list.length === 1) return { account: list[0] }
  if (list.length === 0) return { error: 'none', accounts: [] }
  return { error: 'choose', accounts: list }
}

export function describeAccounts(accounts) {
  return (accounts || []).map((account) => `${account.name}  ${account.id}`).join('\n')
}

export function findDatabase(list, name) {
  return (list || []).find((item) => item.name === name) || null
}

export function bucketNames(result) {
  if (Array.isArray(result)) return result.map((item) => item.name).filter(Boolean)
  if (Array.isArray(result?.buckets)) return result.buckets.map((item) => item.name).filter(Boolean)
  return []
}

export function zoneCandidates(domain) {
  const labels = String(domain || '').toLowerCase().split('.').filter(Boolean)
  const names = []
  for (let i = 0; i <= labels.length - 2; i += 1) names.push(labels.slice(i).join('.'))
  return names
}

export function zoneAccountId(zone) {
  return zone?.account?.id || zone?.account_id || ''
}

export function classifyDns(records, hostname, target) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '')
  const dest = String(target || '').toLowerCase().replace(/\.$/, '')
  const relevant = (Array.isArray(records) ? records : [])
    .filter((record) => {
      const name = String(record.name || '').toLowerCase().replace(/\.$/, '')
      const type = String(record.type || '').toUpperCase()
      return name === host && (type === 'A' || type === 'AAAA' || type === 'CNAME')
    })
    .map((record) => ({
      id: record.id,
      type: String(record.type).toUpperCase(),
      name: record.name,
      content: record.content,
      proxied: Boolean(record.proxied),
    }))
  if (relevant.length === 0) return { action: 'create', records: [] }
  const cnames = relevant.filter((record) => record.type === 'CNAME')
  const others = relevant.filter((record) => record.type !== 'CNAME')
  const content = (value) => String(value || '').toLowerCase().replace(/\.$/, '')
  if (cnames.length === 1 && others.length === 0 && content(cnames[0].content) === dest && cnames[0].proxied) {
    return { action: 'ok', records: relevant, proxied: true }
  }
  return { action: 'conflict', records: relevant }
}

export function formatDnsRecord(record) {
  return `${record.type} ${record.name} ${record.content} ${record.proxied ? 'proxied' : 'dns-only'}`
}

export function formatChecklist(items) {
  const lines = ['Preflight / 预检']
  for (const item of items || []) {
    const mark = item.level === 'fail' ? '✗' : item.level === 'warn' ? '!' : '✓'
    lines.push(`${mark} ${item.en}`)
    lines.push(`  ${item.zh}`)
    for (const record of item.records || []) lines.push(`    ${formatDnsRecord(record)}`)
  }
  return lines.join('\n')
}

export function checklistBlocks(items) {
  return (items || []).some((item) => item.level === 'fail')
}

function checkLine(id, level, en, zh, extra = {}) {
  return { id, level, en, zh, ...extra }
}

export function evaluatePreflight(input = {}) {
  const items = []
  const domain = input.domain || ''
  if (!input.tokenSupplied) {
    items.push(checkLine(
      'token',
      input.allowMissingToken ? 'warn' : 'fail',
      'API token not set; preflight skipped',
      '未设置 API token，已跳过预检',
      { kind: 'token-missing' },
    ))
    return { items, blocks: checklistBlocks(items), account: null, zone: null }
  }
  if (!input.tokenActive) {
    items.push(checkLine(
      'token',
      'fail',
      'API token was rejected by /user/tokens/verify',
      'API token 未通过 /user/tokens/verify',
      { kind: 'auth', raw: input.tokenError || '' },
    ))
    return { items, blocks: true, account: null, zone: null }
  }
  items.push(checkLine('token', 'ok', 'API token is active', 'API token 有效'))

  const picked = pickAccount(input.accounts || [], input.requestedAccountId || '')
  if (picked.error === 'none') {
    items.push(checkLine('account', 'fail', 'Token cannot see any account', 'Token 看不到任何账号', { kind: 'permission', permission: 'account' }))
    return { items, blocks: true, account: null, zone: null }
  }
  if (picked.error === 'missing') {
    items.push(checkLine(
      'account',
      'fail',
      `Account ${input.requestedAccountId} is not visible to this token`,
      `账号 ${input.requestedAccountId} 不在这个 token 的可见范围内`,
      { kind: 'permission', permission: 'account' },
    ))
    return { items, blocks: true, account: null, zone: null }
  }
  if (picked.error === 'choose') {
    items.push(checkLine(
      'account',
      'fail',
      'This token can see more than one account. Pass --account-id.',
      '这个 token 能看到多个账号，请加上 --account-id。',
      { kind: 'choose', accounts: picked.accounts },
    ))
    return { items, blocks: true, account: null, zone: null }
  }
  const account = picked.account
  items.push(checkLine('account', 'ok', `Account ${account.name} (${account.id})`, `账号 ${account.name}（${account.id}）`))

  const probe = (id, okEn, okZh, failEn, failZh, permission) => {
    const result = input.probes?.[id]
    if (result?.ok) {
      items.push(checkLine(id, 'ok', okEn, okZh))
      return
    }
    const raw = result?.raw || ''
    const kind = classifyFailure({ raw, status: result?.status, step: id }).kind
    items.push(checkLine(id, 'fail', failEn, failZh, { kind, raw, permission }))
  }

  probe('pages', 'Pages API reachable', 'Pages 接口可访问', 'Pages API failed', 'Pages 接口失败', 'pages')
  probe('d1', 'D1 API reachable', 'D1 接口可访问', 'D1 API failed', 'D1 接口失败', 'd1')

  const r2 = input.probes?.r2
  if (r2?.ok) items.push(checkLine('r2', 'ok', 'R2 is enabled', 'R2 已开通'))
  else {
    const raw = r2?.raw || ''
    const classified = classifyFailure({ raw, status: r2?.status, step: 'r2' }).kind
    const disabled = String(r2?.code || '') === '10042' || classified === 'r2-disabled'
    items.push(checkLine(
      'r2',
      'fail',
      disabled ? 'R2 is not enabled (error 10042)' : 'R2 API failed',
      disabled ? '尚未开通 R2（错误 10042）' : 'R2 接口失败',
      { kind: disabled ? 'r2-disabled' : classified, raw, permission: 'r2' },
    ))
  }

  let zone = null
  if (!domain) {
    items.push(checkLine('zone', 'ok', 'No custom domain requested', '未要求自定义域名'))
  } else if (input.probes?.zone && !input.probes.zone.ok) {
    items.push(checkLine('zone', 'fail', 'Zone lookup failed', '查询域名区域失败', {
      kind: classifyFailure({ raw: input.probes.zone.raw, status: input.probes.zone.status, step: 'zone' }).kind,
      raw: input.probes.zone.raw,
      permission: 'zone',
    }))
  } else if (!input.zone) {
    items.push(checkLine('zone', 'fail', `Zone for ${domain} is not in this account`, `这个账号里没有 ${domain} 的域名区域`, { kind: 'zone-missing', permission: 'zone' }))
  } else if (zoneAccountId(input.zone) !== account.id) {
    items.push(checkLine('zone', 'fail', `Zone ${input.zone.name} belongs to a different account`, `域名区域 ${input.zone.name} 不在当前账号`, { kind: 'zone-account' }))
  } else {
    zone = input.zone
    items.push(checkLine('zone', 'ok', `Zone ${zone.name} is in this account`, `域名区域 ${zone.name} 在当前账号`))
    if (input.probes?.dns && !input.probes.dns.ok) {
      items.push(checkLine('dns', 'fail', 'DNS API failed', 'DNS 接口失败', {
        kind: classifyFailure({ raw: input.probes.dns.raw, status: input.probes.dns.status, step: 'dns' }).kind,
        raw: input.probes.dns.raw,
        permission: 'dns',
      }))
    } else if (input.dns?.action === 'conflict') {
      items.push(checkLine('dns', 'warn', `DNS for ${domain} already has A, AAAA, or CNAME records`, `${domain} 已有 A、AAAA 或 CNAME，默认不会删除`, { records: input.dns.records }))
    } else if (input.dns?.action === 'ok') {
      items.push(checkLine('dns', 'ok', `CNAME ${domain} already points at the Pages hostname`, `${domain} 的 CNAME 已指向 Pages`))
    } else if (input.dns) {
      items.push(checkLine('dns', 'ok', `No A, AAAA, or CNAME yet for ${domain}`, `${domain} 还没有 A、AAAA 或 CNAME`))
    }
  }

  return { items, blocks: checklistBlocks(items), account, zone }
}

function permissionLines(ids) {
  const unique = [...new Set(ids.filter((id) => PERMISSIONS[id]))]
  return {
    en: unique.map((id) => PERMISSIONS[id].en).join('; '),
    zh: unique.map((id) => PERMISSIONS[id].zh).join('；'),
  }
}

export function mapSetupError(input = {}) {
  const classified = input.kind
    ? { kind: input.kind, codes: extractErrorCodes(input.raw || '') }
    : classifyFailure(input)
  const cfMessage = redact(cloudflareMessages(input.raw).join('; '), input.secrets || [])
  const codeText = classified.codes.join(', ') || 'unknown'
  const accountId = input.accountId || '<account-id>'
  const project = input.project || '<project>'
  const domain = input.domain || '<domain>'
  const rerun = input.rerun || rerunCommand(input)
  const pages = dashboardUrl(input.accountId, input.project ? `pages/view/${input.project}` : 'pages')
  const zoneDns = input.zoneId ? dashboardUrl(input.accountId, `${input.zoneId}/dns/records`) : dashboardUrl(input.accountId, 'domains')
  const needed = permissionLines([
    input.permission,
    'account',
    'pages',
    'd1',
    'r2',
    ...(input.domain ? ['zone', 'dns'] : []),
  ])
  const catalog = {
    'r2-disabled': {
      link: dashboardUrl(input.accountId, 'r2/overview'),
      zh: `创建 R2 存储桶时被拒绝：这个账号还没有开通 R2（错误 10042）。`,
      en: `The R2 bucket step was refused because R2 is not enabled on this account (error 10042).`,
      actionZh: `打开上面的仪表盘，开通 R2。部分账号要先添加付款方式，开通后仍可使用免费额度。然后重跑。同名 D1 会被复用。`,
      actionEn: `Enable R2 in the dashboard. Some accounts need a payment method on file first; the free tier still applies after that. Then rerun. A D1 database with the same name is reused.`,
    },
    'token-missing': {
      link: 'https://dash.cloudflare.com/profile/api-tokens',
      zh: `还没有提供 API token，所以预检没有调用 Cloudflare。`,
      en: `No API token was provided, so preflight did not call Cloudflare.`,
      actionZh: `执行 export CLOUDFLARE_API_TOKEN=... 后重跑。命令行里不要写 token。所需权限：${needed.zh}。`,
      actionEn: `Export CLOUDFLARE_API_TOKEN and rerun. Leave the token out of the command. Permissions: ${needed.en}.`,
    },
    auth: {
      link: 'https://dash.cloudflare.com/profile/api-tokens',
      zh: `API token 未通过校验（常见错误码 10000）。`,
      en: `The API token was rejected (often error 10000).`,
      actionZh: `重新创建 token，执行 export CLOUDFLARE_API_TOKEN=... 后再跑。命令行里不要写 token。所需权限：${needed.zh}。`,
      actionEn: `Create a new token, export CLOUDFLARE_API_TOKEN, and rerun. Leave the token out of the command. Permissions: ${needed.en}.`,
    },
    permission: {
      link: 'https://dash.cloudflare.com/profile/api-tokens',
      zh: `Token 已识别，但缺少「${input.step || 'setup'}」所需权限（常见错误码 9109、10000）。`,
      en: `The token is recognized, but it is missing a permission for ${input.step || 'setup'} (often 9109 or 10000).`,
      actionZh: `编辑 token，补上这些权限后重跑：${needed.zh}。`,
      actionEn: `Edit the token, add these permissions, and rerun: ${needed.en}.`,
    },
    exists: {
      link: pages,
      zh: `同名资源已经存在。重跑会按名称复用 D1、R2 和 Pages 项目。`,
      en: `A resource with this name already exists. Rerun reuses the D1 database, R2 bucket, and Pages project by name.`,
      actionZh: `直接重跑即可，不必手工删掉已创建的资源。`,
      actionEn: `Rerun the command. Existing resources with the same names stay in place.`,
    },
    'd1-limit': {
      link: dashboardUrl(input.accountId, 'workers/d1'),
      zh: `D1 数据库数量到了这个账号的上限，没法再新建 ${project}-db。`,
      en: `This account is at its D1 database limit, so ${project}-db was not created.`,
      actionZh: `在仪表盘删掉不用的数据库，或提高额度，然后重跑。`,
      actionEn: `Delete an unused database in the dashboard, or raise the limit, then rerun.`,
    },
    'pages-taken': {
      link: dashboardUrl(input.accountId, 'pages'),
      zh: `Pages 项目名「${project}」已被占用，当前账号里看不到可复用的同名项目。`,
      en: `The Pages project name "${project}" is already taken, and this account has no project with that name to reuse.`,
      actionZh: `换一个 --project 名称后重跑。`,
      actionEn: `Pick another --project name and rerun.`,
    },
    network: {
      link: 'https://www.cloudflarestatus.com/',
      zh: `连接 Cloudflare API 失败。已完成的步骤记在 ${PROGRESS_FILE}，重跑会从中断处继续。`,
      en: `The Cloudflare API could not be reached. Finished steps are recorded in ${PROGRESS_FILE}; rerun continues there.`,
      actionZh: `检查网络后重跑。`,
      actionEn: `Check the network, then rerun.`,
    },
    domain: {
      link: zoneDns || pages,
      zh: `自定义域名 ${domain} 没有进入 active。主机名上若还有别的 A、AAAA 或 CNAME，校验会停在 pending。脚本默认不删除这些记录。`,
      en: `Custom domain ${domain} did not become active. Other A, AAAA, or CNAME records on that hostname keep validation pending. Those records stay unless you pass --replace-dns or confirm.`,
      actionZh: `核对打印出来的记录。确认要改指向后，加上 --replace-dns 重跑，或在仪表盘把记录改成指向 ${project}.pages.dev 的橙色云 CNAME。证书签发和解析可能还要几分钟。`,
      actionEn: `Review the records that were printed. After you accept the change, rerun with --replace-dns, or point a proxied CNAME at ${project}.pages.dev in the dashboard. Certificate issuance and DNS propagation can take several minutes.`,
    },
    'zone-missing': {
      link: dashboardUrl(input.accountId, 'domains'),
      zh: `当前账号里找不到 ${domain} 的域名区域。`,
      en: `No zone for ${domain} is visible in this account.`,
      actionZh: `先把站点加进这个 Cloudflare 账号，并确认 token 有 Zone Read。只想先用 pages.dev 时，加重跑参数 --skip-domain。`,
      actionEn: `Add the site to this Cloudflare account and include Zone Read on the token. To deploy on pages.dev only, rerun with --skip-domain.`,
    },
    'zone-account': {
      link: dashboardUrl(input.accountId, 'domains'),
      zh: `找到的域名区域属于另一个账号。Pages 和自定义域名需要在同一个账号。`,
      en: `The zone belongs to a different account. Pages and the custom domain need to live in the same account.`,
      actionZh: `换到拥有该域名的账号对应的 token，或把域名添加到当前账号。`,
      actionEn: `Use a token for the account that owns the zone, or add the zone to this account.`,
    },
    'not-found': {
      link: pages,
      zh: `没有找到这个资源（HTTP 404 或错误 8000007）。Pages 项目不存在时，安装会改为创建。`,
      en: `Cloudflare reported this resource was not found (HTTP 404 or error 8000007). A missing Pages project is created.`,
      actionZh: `确认名称后重跑。找不到的 Pages 项目会在这一步创建。`,
      actionEn: `Check the name and rerun. Setup creates a Pages project when this lookup says it is missing.`,
    },
    unknown: {
      link: pages,
      zh: `步骤「${input.step || 'setup'}」失败。Cloudflare 错误码 ${codeText}：${cfMessage || '没有附加说明'}。`,
      en: `Step "${input.step || 'setup'}" failed. Cloudflare error ${codeText}: ${cfMessage || 'no additional message'}.`,
      actionZh: `按上面的 Cloudflare 说明处理后再重跑。这不是权限错误。堆栈需要 --debug 才会打印。进度在 ${PROGRESS_FILE}。`,
      actionEn: `Use the Cloudflare message above, then rerun. This is not a token permission error. Pass --debug for a stack trace. Progress is stored in ${PROGRESS_FILE}.`,
    },
  }
  const copy = catalog[classified.kind] || catalog.unknown
  return {
    kind: classified.kind,
    step: input.step || 'setup',
    codes: classified.codes,
    link: copy.link,
    zh: copy.zh,
    en: copy.en,
    actionZh: copy.actionZh,
    actionEn: copy.actionEn,
    detail: '',
    rerun,
    accountId,
    project,
    domain,
  }
}

export function formatSetupError(mapped) {
  const lines = [
    `✗ ${mapped.step}`,
    `中文：${mapped.zh}`,
    `English: ${mapped.en}`,
  ]
  if (mapped.codes?.length) lines.push(`Code: ${mapped.codes.join(', ')}`)
  if (mapped.detail) lines.push(mapped.detail)
  if (mapped.link) lines.push(`Open: ${mapped.link}`)
  lines.push(`下一步：${mapped.actionZh}`)
  lines.push(`Next: ${mapped.actionEn}`)
  lines.push('Rerun (keep the token in CLOUDFLARE_API_TOKEN; the command does not print it):')
  lines.push(mapped.rerun)
  return lines.join('\n')
}

export function explainChecklistItem(item, context = {}) {
  if (!item || item.level === 'ok' || item.level === 'warn') return ''
  if (item.kind === 'choose') {
    return [
      '中文：这个 token 能看到多个账号，请指定 --account-id。',
      'English: This token can see more than one account. Pass --account-id.',
      describeAccounts(item.accounts || []),
      `Rerun: ${context.rerun || rerunCommand(context)}`,
    ].join('\n')
  }
  return formatSetupError(mapSetupError({
    step: item.id,
    kind: item.kind,
    raw: item.raw || '',
    permission: item.permission,
    accountId: context.accountId,
    project: context.project,
    domain: context.domain,
    zoneId: context.zoneId,
    rerun: context.rerun,
    secrets: context.secrets,
  }))
}

export function parseDevVars(text) {
  const out = {}
  for (const line of String(text || '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
  }
  return out
}

export function renderDevVars(vars, previousText = '') {
  const keys = ['ADMIN_PASSWORD', 'SESSION_SECRET', 'ADMIN_API_TOKEN', 'ADMIN_SAFEPATH', 'SITE_URL']
  const merged = { ...parseDevVars(previousText), ...vars }
  const ordered = [...keys, ...Object.keys(merged).filter((key) => !keys.includes(key))]
  return `${ordered.map((key) => `${key}=${merged[key] ?? ''}`).join('\n')}\n`
}

export function readProgress(text) {
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return nextProgress(parsed, {})
  } catch {
    return null
  }
}

export function nextProgress(prev, patch) {
  const merged = {
    version: 1,
    ...(prev || {}),
    ...(patch || {}),
    steps: { ...((prev && prev.steps) || {}), ...((patch && patch.steps) || {}) },
  }
  for (const key of SECRET_KEYS) delete merged[key]
  return merged
}

export function freshDatabase(progress, createdNow) {
  if (createdNow) return true
  if (!progress?.databaseFresh) return false
  return progress.steps?.seed !== 'done'
}
