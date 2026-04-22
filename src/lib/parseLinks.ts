export interface TextSegment {
  type: 'text'
  value: string
}

export interface UrlSegment {
  type: 'url'
  value: string
}

export type MessageSegment = TextSegment | UrlSegment

// Matches http/https URLs; stops at whitespace and common trailing punctuation
const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/g

export function parseLinks(text: string): MessageSegment[] {
  const segments: MessageSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  URL_REGEX.lastIndex = 0
  while ((match = URL_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }
    segments.push({ type: 'url', value: match[0] })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }

  return segments.length > 0 ? segments : [{ type: 'text', value: text }]
}

export function shortenUrl(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname.length > 24 ? u.pathname.slice(0, 24) + '…' : u.pathname
    return u.hostname + (path === '/' ? '' : path)
  } catch {
    return url.length > 40 ? url.slice(0, 40) + '…' : url
  }
}

const MODEL_EXTS = ['.glb', '.usdz']

export function isModelUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase()
    return MODEL_EXTS.some(ext => pathname.endsWith(ext))
  } catch {
    const lower = url.toLowerCase().split('?')[0]
    return MODEL_EXTS.some(ext => lower.endsWith(ext))
  }
}

export function modelFilename(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/')
    return parts[parts.length - 1] || url
  } catch {
    return url.split('/').pop() || url
  }
}
