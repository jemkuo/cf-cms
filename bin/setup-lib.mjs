const PROJECT = /^[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?$/
const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validateProjectName(value) {
  return PROJECT.test(value || '')
}

export function validateDomain(value) {
  return DOMAIN.test(String(value || '').toLowerCase())
}

export function validateUuid(value) {
  return UUID.test(value || '')
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

export function setupPlan(options) {
  const project = options.project
  const database = `${project}-db`
  const bucket = `${project}-media`
  const siteUrl = options.domain ? `https://${options.domain}` : `https://${project}.pages.dev`
  const commands = [
    `wrangler d1 create ${database}`,
    `wrangler r2 bucket create ${bucket}`,
    `wrangler pages project create ${project} --production-branch main`,
    `wrangler d1 migrations apply ${database} --remote`,
  ]
  if (!options.skipSeed) commands.push(`wrangler d1 execute ${database} --remote --file=seed/seed.sql`)
  commands.push(
    `wrangler pages secret put ADMIN_PASSWORD --project-name ${project}`,
    `wrangler pages secret put SESSION_SECRET --project-name ${project}`,
    `wrangler pages secret put ADMIN_API_TOKEN --project-name ${project}`,
    `wrangler pages secret put ADMIN_SAFEPATH --project-name ${project}`,
    `wrangler pages deploy public --project-name ${project} --commit-dirty=true`,
  )
  if (options.domain && !options.skipDomain) {
    commands.push(`POST /accounts/{account}/pages/projects/${project}/domains { name: ${options.domain} }`)
  }
  return { project, database, bucket, siteUrl, commands }
}
