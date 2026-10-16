import onboarding from '../../onboarding.json'
import type { Env } from '../types'
import { TOOLS, callTool } from './tools'

export const MCP_PROTOCOL = '2024-11-05'

export function serverInstructions(): string {
  return onboarding.en
}

type Rpc = {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: unknown
}

function result(id: string | number | null, value: unknown) {
  return { jsonrpc: '2.0', id, result: value }
}

function failure(id: string | number | null, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

export async function handleRpc(env: Env, message: unknown): Promise<unknown | null> {
  const rpc = message as Rpc
  if (!rpc || typeof rpc !== 'object' || rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string') {
    return failure(rpc && typeof rpc === 'object' && 'id' in rpc ? (rpc.id ?? null) : null, -32600, 'Invalid Request')
  }
  const id = rpc.id ?? null
  const note = id === null || id === undefined
  if (rpc.method.startsWith('notifications/')) return null
  if (rpc.method === 'initialize') {
    return result(id, {
      protocolVersion: MCP_PROTOCOL,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'cf-cms', version: '0.1.0' },
      instructions: serverInstructions(),
    })
  }
  if (rpc.method === 'ping') return result(id, {})
  if (rpc.method === 'tools/list') {
    return result(id, {
      tools: TOOLS.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    })
  }
  if (rpc.method === 'tools/call') {
    const params = rpc.params && typeof rpc.params === 'object' ? (rpc.params as { name?: string; arguments?: unknown }) : {}
    const name = params.name || ''
    const args = params.arguments && typeof params.arguments === 'object' ? (params.arguments as Record<string, unknown>) : {}
    try {
      const payload = await callTool(env, name, args)
      return result(id, {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        isError: false,
      })
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Tool failed'
      return result(id, {
        content: [{ type: 'text', text: messageText }],
        isError: true,
      })
    }
  }
  if (note) return null
  return failure(id, -32601, `Method not found: ${rpc.method}`)
}
