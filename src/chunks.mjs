/** Split Markdown so translation can send prose in pieces and leave structured spans intact. */

const FENCE = /```[\s\S]*?```/g

function linePieces(text) {
  const pieces = []
  let start = 0
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') {
      pieces.push(text.slice(start, i + 1))
      start = i + 1
    }
  }
  if (start < text.length) pieces.push(text.slice(start))
  return pieces
}

function isTableLine(line) {
  const value = line.trim()
  if (!value) return false
  if (/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(value)) return true
  return value.includes('|') && /^\|.*\|$/.test(value)
}

function isImageLine(line) {
  const value = line.trim()
  if (!value) return false
  if (/^!\[[^\]]*\]\([^)\s]+\)\s*$/.test(value)) return true
  return /^https?:\/\/\S+\.(?:png|jpe?g|gif|webp|avif|svg)(?:\?\S*)?$/i.test(value)
}

function isCommandLine(line) {
  const value = line.trim()
  if (!value || /[.?!]/.test(value)) return false
  if (/^\$\s+\S/.test(value)) return true
  return /^(?:npm|pnpm|yarn|npx|wrangler|git|curl|wget|cd|mkdir|export|node)\s+\S/.test(value)
}

function isHeading(line) {
  return /^#{1,6}\s+\S/.test(line.trim())
}

function atomsFromProse(text) {
  const pieces = linePieces(text)
  const atoms = []
  let prose = ''
  const flush = () => {
    if (!prose) return
    atoms.push({ kind: 'prose', text: prose, breakBefore: false })
    prose = ''
  }
  for (let i = 0; i < pieces.length; i += 1) {
    const piece = pieces[i]
    const line = piece.replace(/\n$/, '')
    if (isTableLine(line)) {
      flush()
      let table = ''
      while (i < pieces.length && isTableLine(pieces[i].replace(/\n$/, ''))) {
        table += pieces[i]
        i += 1
      }
      i -= 1
      atoms.push({ kind: 'keep', text: table })
      continue
    }
    if (isImageLine(line) || isCommandLine(line)) {
      flush()
      atoms.push({ kind: 'keep', text: piece })
      continue
    }
    if (isHeading(line)) {
      flush()
      atoms.push({ kind: 'prose', text: piece, breakBefore: true })
      continue
    }
    prose += piece
  }
  flush()
  return atoms
}

function atomsOf(body) {
  const atoms = []
  const text = String(body ?? '')
  FENCE.lastIndex = 0
  let last = 0
  let match = FENCE.exec(text)
  while (match) {
    if (match.index > last) atoms.push(...atomsFromProse(text.slice(last, match.index)))
    atoms.push({ kind: 'keep', text: match[0] })
    last = match.index + match[0].length
    match = FENCE.exec(text)
  }
  if (last < text.length) atoms.push(...atomsFromProse(text.slice(last)))
  return atoms
}

function avoidProtected(text, cut) {
  const fence = text.lastIndexOf('`', cut - 1)
  if (fence >= 0) {
    const count = text.slice(0, cut).split('`').length - 1
    if (count % 2 === 1) return fence
  }
  const url = text.slice(0, cut).search(/https?:\/\/\S*$/)
  if (url >= 0 && url < cut) return url
  return cut
}

function splitLongProse(text, maxChars) {
  if (text.length <= maxChars) return [text]
  const parts = []
  let rest = text
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf('\n\n', maxChars)
    if (cut < Math.floor(maxChars * 0.4)) cut = rest.lastIndexOf('\n', maxChars)
    if (cut < Math.floor(maxChars * 0.4)) cut = rest.lastIndexOf(' ', maxChars)
    if (cut < 1) cut = maxChars
    cut = avoidProtected(rest, cut)
    if (cut < 1) cut = maxChars
    parts.push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }
  if (rest) parts.push(rest)
  return parts
}

function pack(atoms, maxChars) {
  const chunks = []
  let prose = ''
  const flush = () => {
    if (!prose) return
    for (const part of splitLongProse(prose, maxChars)) chunks.push({ kind: 'prose', text: part })
    prose = ''
  }
  for (const atom of atoms) {
    if (atom.kind === 'keep') {
      flush()
      chunks.push({ kind: 'keep', text: atom.text })
      continue
    }
    if (atom.breakBefore) flush()
    if (prose && prose.length + atom.text.length > maxChars) flush()
    prose += atom.text
  }
  flush()
  return chunks
}

export function splitMarkdown(body, maxChars = 1200) {
  const limit = Number.isFinite(maxChars) && maxChars >= 200 ? maxChars : 1200
  return pack(atomsOf(body), limit)
}
