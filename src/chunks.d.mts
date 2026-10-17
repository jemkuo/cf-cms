export type MarkdownChunk = { kind: 'keep' | 'prose'; text: string }

export function splitMarkdown(body: string, maxChars?: number): MarkdownChunk[]
