export const POWERED_BY_URL = 'https://github.com/jemkuo/cf-cms'

export function showPoweredBy(value) {
  if (typeof value === 'boolean') return value
  if (value === 'on' || value === 'true' || value === '1' || value === 1) return true
  if (value === 'off' || value === 'false' || value === '0' || value === 0 || value === '') return false
  return true
}

export function poweredByMarkup() {
  return `<p class="powered-by" lang="en">Powered by <a href="${POWERED_BY_URL}" rel="noopener">CF CMS</a></p>`
}
