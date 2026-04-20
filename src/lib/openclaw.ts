// Derive WS URL from the page origin so it works on any device that can
// reach the Vite dev server (Pico, browser, etc.) without a separate port.
function buildWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}/openclaw-ws`
}

const TOKEN = import.meta.env.VITE_OPENCLAW_TOKEN as string

const SCOPES = [
  'operator.read',
  'operator.write',
  'operator.admin',
  'operator.approvals',
  'operator.pairing',
]

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

// ─── Device identity (Ed25519 via SubtleCrypto) ────────────────────────────

const DEVICE_KEY = 'openclaw-device-identity'

interface StoredDevice {
  id: string
  publicKeyBase64Url: string
  privateKeyPkcs8Base64: string
}

function toBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

async function loadOrCreateDevice(): Promise<StoredDevice | null> {
  if (!window.isSecureContext || !window.crypto?.subtle) {
    return null
  }
  try {
    const raw = localStorage.getItem(DEVICE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as StoredDevice
      if (parsed.id && parsed.publicKeyBase64Url && parsed.privateKeyPkcs8Base64) {
        return parsed
      }
    }
    // Generate new Ed25519 key pair
    const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
    const pubRaw = await crypto.subtle.exportKey('raw', kp.publicKey as CryptoKey)
    const privPkcs8 = await crypto.subtle.exportKey('pkcs8', kp.privateKey as CryptoKey)
    const publicKeyBase64Url = toBase64Url(pubRaw)
    const hashBuf = await crypto.subtle.digest('SHA-256', pubRaw)
    const id = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')
    const privateKeyPkcs8Base64 = btoa(String.fromCharCode(...new Uint8Array(privPkcs8)))
    const device: StoredDevice = { id, publicKeyBase64Url, privateKeyPkcs8Base64 }
    localStorage.setItem(DEVICE_KEY, JSON.stringify(device))
    return device
  } catch {
    return null
  }
}

async function buildDeviceObject(stored: StoredDevice, nonce: string) {
  const pkcs8 = Uint8Array.from(atob(stored.privateKeyPkcs8Base64), c => c.charCodeAt(0))
  const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign'])
  const signedAt = Date.now()
  // V3 payload must match what the server reconstructs from connectParams
  // platform = client.platform ('web'), deviceFamily = client.deviceFamily (undefined → '')
  const payload = [
    'v3',
    stored.id,
    'openclaw-control-ui',
    'ui',
    'operator',
    SCOPES.join(','),
    String(signedAt),
    TOKEN,
    nonce,
    'web', // matches client.platform below
    '',    // matches client.deviceFamily (not set)
  ].join('|')
  const sigBuf = await crypto.subtle.sign('Ed25519', privateKey, new TextEncoder().encode(payload))
  return {
    id: stored.id,
    publicKey: stored.publicKeyBase64Url,
    signature: toBase64Url(sigBuf),
    signedAt,
    nonce,
  }
}

// ─── WebSocket client ──────────────────────────────────────────────────────

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
      if (!window.isSecureContext) {
        reject(new Error(
          'Device authentication requires a secure context. ' +
          'Access the app via http://localhost:5173 using ADB reverse, not via the host IP.'
        ))
        this.connectPromise = null
        return
      }

      const ws = new WebSocket(buildWsUrl())
      this.ws = ws

      ws.onmessage = async (e) => {
        const msg = JSON.parse(e.data as string) as {
          type: string; id?: string; ok?: boolean
          payload?: Payload; error?: unknown; event?: string
        }

        // Wait for connect.challenge before sending connect request
        if (msg.type === 'event' && msg.event === 'connect.challenge') {
          const nonce = (msg.payload as { nonce?: string })?.nonce ?? ''
          const id = this.id()
          this.resolvers.set(id, () => resolve())
          // Clear connectPromise immediately on auth rejection so the next
          // call creates a fresh WebSocket with a new signature instead of
          // returning the same rejected promise.
          this.rejecters.set(id, (e) => { this.connectPromise = null; reject(e) })

          const stored = await loadOrCreateDevice()
          const device = stored && nonce ? await buildDeviceObject(stored, nonce) : undefined

          ws.send(JSON.stringify({
            type: 'req', id,
            method: 'connect',
            params: {
              minProtocol: 1,
              maxProtocol: 3,
              client: {
                id: 'openclaw-control-ui',
                version: '1.0.0',
                platform: 'web',
                mode: 'ui',
              },
              auth: { token: TOKEN },
              scopes: SCOPES,
              device,
            },
          }))
          return
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

    // Gateway emits events with a canonical session key like "agent:main:main"
    // even when we passed the bare key "main". Accept both forms.
    const matchesSession = (key: unknown) =>
      typeof key !== 'string' ||
      key === sessionKey ||
      key.endsWith(':' + sessionKey)

    const offChat = this.on('chat', (p) => {
      if (!matchesSession(p.sessionKey)) return
      const msg = p.message as Payload | undefined
      if (msg?.content !== undefined) {
        const text = extractText(msg.content)
        if (text) onChunk(text)
      }
      if (p.state === 'final' || p.state === 'aborted' || p.state === 'error') {
        clearTimeout(timeout)
        settle()
      }
    })

    const offAgent = this.on('agent', (p) => {
      if (!matchesSession(p.sessionKey)) return
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
