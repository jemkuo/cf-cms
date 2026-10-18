#!/usr/bin/env node
// stdio MCP proxy. The tool implementation lives in the Pages app at /mcp.
// Standard MCP stdio framing: one JSON-RPC message per line on stdin and stdout, UTF-8, no embedded newlines.
// Older clients that send LSP-style "Content-Length:" headers still work; replies then use the same framing.
// Diagnostics go to stderr only, so stdout carries nothing but protocol messages.

const endpoint = (process.env.CF_CMS_URL || process.env.CF_BLOGGER_URL || 'http://127.0.0.1:8791').replace(/\/$/, '') + '/mcp'
const token = process.env.ADMIN_API_TOKEN || ''

let framing = 'line' // 'line' (standard) or 'header' (legacy Content-Length)

function write(message) {
  const text = JSON.stringify(message)
  if (framing === 'header') {
    const body = Buffer.from(text)
    process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`)
    process.stdout.write(body)
  } else {
    process.stdout.write(`${text}\n`)
  }
}

async function forward(message) {
  if (message && typeof message.method === 'string' && message.method.startsWith('notifications/')) return
  const hasId = message && typeof message === 'object' && 'id' in message
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
    if (hasId) {
      write({
        jsonrpc: '2.0',
        id: message.id ?? null,
        error: { code: -32002, message: `Cannot reach ${endpoint}. Check CF_CMS_URL, or run npm run dev in CF CMS. ${reason}` },
      })
    }
    return
  }
  if (response.status === 202 || response.status === 204) return
  let payload
  try {
    payload = await response.json()
  } catch {
    if (hasId) write({ jsonrpc: '2.0', id: message.id ?? null, error: { code: -32603, message: `CF CMS returned HTTP ${response.status} without JSON` } })
    return
  }
  write(payload)
}

function handle(raw) {
  const text = raw.trim()
  if (!text) return
  let message
  try {
    message = JSON.parse(text)
  } catch {
    write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
    return
  }
  const run = (item) =>
    forward(item).catch((error) => {
      if (item && typeof item === 'object' && 'id' in item) {
        write({ jsonrpc: '2.0', id: item.id ?? null, error: { code: -32002, message: error instanceof Error ? error.message : 'MCP proxy failed' } })
      }
    })
  if (Array.isArray(message)) message.forEach(run)
  else run(message)
}

let buffer = Buffer.alloc(0)
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk])
  for (;;) {
    if (!buffer.length) return
    // Legacy header framing starts with "Content-Length:".
    const head = buffer.slice(0, Math.min(buffer.length, 16)).toString('utf8')
    if (/^\s*content-length:/i.test(head) || (buffer.length < 16 && 'content-length:'.startsWith(head.trimStart().toLowerCase()) && head.trim())) {
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
      framing = 'header'
      const raw = buffer.slice(start, start + length).toString('utf8')
      buffer = buffer.slice(start + length)
      handle(raw)
      continue
    }
    const newline = buffer.indexOf(0x0a)
    if (newline === -1) return
    const line = buffer.slice(0, newline).toString('utf8')
    buffer = buffer.slice(newline + 1)
    handle(line)
  }
})
process.stdin.on('end', () => {
  if (buffer.length && !/^\s*content-length:/i.test(buffer.toString('utf8'))) handle(buffer.toString('utf8'))
})
