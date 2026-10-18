import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const proxy = fileURLToPath(new URL('../bin/mcp-stdio.mjs', import.meta.url))

function fakeMcp() {
  const seen = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      const message = JSON.parse(body)
      seen.push({ auth: req.headers.authorization, message })
      if (String(message.method).startsWith('notifications/')) {
        res.writeHead(202).end()
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { echo: message.method } }))
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, url: `http://127.0.0.1:${server.address().port}` })))
}

function run(url, input, expectBytes) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [proxy], { env: { ...process.env, CF_CMS_URL: url, ADMIN_API_TOKEN: 'test-token-0123456789' } })
    let out = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`timeout; got ${JSON.stringify(out)}`))
    }, 5000)
    child.stdout.on('data', (chunk) => {
      out += chunk
      if (expectBytes(out)) {
        clearTimeout(timer)
        child.kill()
        resolve(out)
      }
    })
    child.stdin.write(input)
  })
}

test('newline-delimited JSON-RPC in, newline-delimited JSON-RPC out (standard MCP stdio)', async () => {
  const { server, seen, url } = await fakeMcp()
  try {
    const input =
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n' +
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n' +
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n'
    const out = await run(url, input, (text) => text.split('\n').filter(Boolean).length >= 2)
    const lines = out.split('\n').filter(Boolean).map((line) => JSON.parse(line))
    assert.deepEqual(lines.map((line) => line.id).sort(), [1, 2])
    assert.ok(!out.includes('Content-Length'))
    assert.ok(seen.every((item) => item.auth === 'Bearer test-token-0123456789'))
    assert.ok(!seen.some((item) => item.message.method === 'notifications/initialized'))
  } finally {
    server.close()
  }
})

test('legacy Content-Length framing still works and is answered in kind', async () => {
  const { server, url } = await fakeMcp()
  try {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'ping' })
    const out = await run(url, `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`, (text) => text.includes('}'))
    assert.match(out, /^Content-Length: \d+\r\n\r\n/)
    assert.equal(JSON.parse(out.split('\r\n\r\n')[1]).id, 7)
  } finally {
    server.close()
  }
})

test('unreachable server returns a JSON-RPC error line', async () => {
  const out = await run('http://127.0.0.1:9', JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list' }) + '\n', (text) => text.includes('\n'))
  const reply = JSON.parse(out.trim())
  assert.equal(reply.id, 3)
  assert.equal(reply.error.code, -32002)
})
