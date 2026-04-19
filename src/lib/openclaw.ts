const WS_URL = import.meta.env.VITE_OPENCLAW_WS_URL as string
const TOKEN = import.meta.env.VITE_OPENCLAW_TOKEN as string

export interface Agent {
  id: string
  name: string
  identity?: {
    name?: string
    emoji?: string
    avatarUrl?: string
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return (content as Array<Record<string, unknown>>)
      .map(b => (b.type === 'text' && typeof b.text === 'string' ? b.text : ''))
      .join('')
  }
  return ''
}

type Payload = Record<string, unknown>

export class OpenClawClient {
  private ws: WebSocket | null = null
  private msgId = 0
  private resolvers = new Map<string, (v: unknown) => void>()
  private rejecters = new Map<string, (e: unknown) => void>()
  private listeners = new Map<string, Set<(p: Payload) => void>>()
  private connectPromise: Promise<void> | null = null

  private id() {
    return String(++this.msgId)
  }

  connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise
    this.connectPromise = new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL)
      this.ws = ws

      ws.onopen = () => {
        const id = this.id()
        this.resolvers.set(id, () => resolve())
        this.rejecters.set(id, reject)
        ws.send(JSON.stringify({
          type: 'req', id,
          method: 'connect',
          params: { auth: { token: TOKEN } },
        }))
      }

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data as string) as {
          type: string; id?: string; ok?: boolean
          payload?: Payload; error?: unknown; event?: string
        }
        if (msg.type === 'res' && msg.id) {
          const res = this.resolvers.get(msg.id)
          const rej = this.rejecters.get(msg.id)
          this.resolvers.delete(msg.id)
          this.rejecters.delete(msg.id)
          if (msg.ok) res?.(msg.payload)
          else rej?.(msg.error)
        } else if (msg.type === 'event' && msg.event) {
          this.listeners.get(msg.event)?.forEach(h => h(msg.payload ?? {}))
        }
      }

      ws.onerror = () => {
        reject(new Error('WebSocket error'))
        this.connectPromise = null
      }
      ws.onclose = () => { this.connectPromise = null }
    })
    return this.connectPromise
  }

  private req<T>(method: string, params: object): Promise<T> {
    const id = this.id()
    return new Promise((resolve, reject) => {
      this.resolvers.set(id, resolve as (v: unknown) => void)
      this.rejecters.set(id, reject)
      this.ws!.send(JSON.stringify({ type: 'req', id, method, params }))
    })
  }

  on(event: string, handler: (p: Payload) => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(handler)
    return () => this.listeners.get(event)?.delete(handler)
  }

  async listAgents(): Promise<Agent[]> {
    await this.connect()
    const payload = await this.req<{ agents: Agent[] }>('agents.list', {})
    return payload.agents ?? []
  }

  async getHistory(sessionKey: string): Promise<ChatMessage[]> {
    await this.connect()
    const payload = await this.req<{ messages: Payload[] }>('chat.history', {
      sessionKey, limit: 100,
    })
    return (payload.messages ?? []).flatMap((m) => {
      const role = m.role === 'user' ? 'user' : 'assistant'
      const text = extractText(m.content)
      return text ? [{ role, content: text } as ChatMessage] : []
    })
  }

  async sendMessage(
    sessionKey: string,
    message: string,
    onChunk: (chunk: string) => void,
    onDone: () => void,
  ): Promise<void> {
    await this.connect()

    let settled = false
    const settle = () => {
      if (settled) return
      settled = true
      offChat()
      offAgent()
      onDone()
    }

    // Safety timeout: settle after 60s if no done signal arrives
    const timeout = setTimeout(settle, 60_000)

    const offChat = this.on('chat', (p) => {
      if (typeof p.sessionKey === 'string' && p.sessionKey !== sessionKey) return
      const msg = p.message as Payload | undefined
      if (msg?.content !== undefined) {
        const text = extractText(msg.content)
        if (text) onChunk(text)
      }
      if (p.state === 'final') {
        clearTimeout(timeout)
        settle()
      }
    })

    const offAgent = this.on('agent', (p) => {
      if (typeof p.sessionKey === 'string' && p.sessionKey !== sessionKey) return
      const data = p.data as Payload | undefined
      if (data?.phase === 'done' || p.stream === 'done') {
        clearTimeout(timeout)
        settle()
      }
    })

    await this.req('sessions.send', { key: sessionKey, message })
  }

  close() {
    this.ws?.close()
    this.connectPromise = null
  }
}
