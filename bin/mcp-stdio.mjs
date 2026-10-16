#!/usr/bin/env node
// stdio MCP proxy. The tool implementation lives in the Pages app at /mcp.

const endpoint = (process.env.CF_CMS_URL || process.env.CF_BLOGGER_URL || 'http://127.0.0.1:8791').replace(/\/$/, '') + '/mcp'
const token = process.env.ADMIN_API_TOKEN || ''

function write(message) {
  const body = Buffer.from(JSON.stringify(message))
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`)
  process.stdout.write(body)
}

async function forward(message) {
  if (message && typeof message.method === 'string' && message.method.startsWith('notifications/')) return
  let response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(message),
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'fetch failed'
    write({
      jsonrpc: '2.0',
      id: message?.id ?? null,
      error: { code: -32002, message: `Cannot reach ${endpoint}. Run npm run dev in CF CMS. ${reason}` },
    })
    return
  }
  if (response.status === 202) return
  const payload = await response.json()
  write(payload)
}

let buffer = Buffer.alloc(0)
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk])
  for (;;) {
    const headerEnd = buffer.indexOf('\r\n\r\n')
    if (headerEnd === -1) return
    const header = buffer.slice(0, headerEnd).toString('utf8')
    const match = /Content-Length:\s*(\d+)/i.exec(header)
    if (!match) {
      buffer = buffer.slice(headerEnd + 4)
      continue
    }
    const length = Number(match[1])
    const start = headerEnd + 4
    if (buffer.length < start + length) return
    const raw = buffer.slice(start, start + length).toString('utf8')
    buffer = buffer.slice(start + length)
    try {
      const message = JSON.parse(raw)
      forward(message).catch((error) => {
        write({
          jsonrpc: '2.0',
          id: message?.id ?? null,
          error: { code: -32002, message: error instanceof Error ? error.message : 'MCP proxy failed' },
        })
      })
    } catch {
      write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
    }
  }
})
