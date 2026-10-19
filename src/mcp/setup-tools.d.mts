export type SetupResult = Record<string, unknown>

export const SETUP_TOOL_NAMES: string[]
export const SETUP_TOOLS: { name: string; description: string; inputSchema: Record<string, unknown> }[]
export function isSetupTool(name: string): boolean
export function tokenArgError(args: unknown, envToken?: string): string | null
export function buildArgv(
  command: string,
  args: unknown,
): { ok: true; argv: string[]; project: string; domain: string; skipDomain: boolean } | { ok: false; error: string }
export function maskAdminUrl(url: string): string
export function parseDeployOutput(stdout: string): {
  url: string
  adminPathMasked: string
  mcpUrl: string
  reused: { d1: boolean; r2: boolean; pages: boolean }
}
export function setupHealth(
  baseUrl: string,
  fetchImpl?: (url: string, init?: { headers?: Record<string, string> }) => Promise<{ json: () => Promise<Record<string, unknown>> }>,
): Promise<{ ok: boolean; d1: boolean; r2: boolean; schema: boolean }>
export function callSetupTool(
  name: string,
  args: Record<string, unknown> | null | undefined,
  env?: { CLOUDFLARE_API_TOKEN?: string },
  deps?: {
    spawn?: (argv: string[], env: { CLOUDFLARE_API_TOKEN?: string }) => Promise<{ code: number; stdout: string; stderr: string }>
    fetch?: (url: string, init?: { headers?: Record<string, string> }) => Promise<{ json: () => Promise<Record<string, unknown>> }>
  },
): Promise<SetupResult>
