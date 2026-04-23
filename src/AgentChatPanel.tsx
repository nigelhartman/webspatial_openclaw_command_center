import { useEffect, useRef, useState } from 'react'
import { initScene } from '@webspatial/react-sdk'
import { OpenClawClient, type Agent, type ChatMessage } from './lib/openclaw.ts'
import { useVoice } from './lib/useVoice.ts'
import { useTts } from './lib/useTts.ts'
import { parseLinks, shortenUrl, isModelUrl, modelFilename, isAudioUrl, isVideoUrl, fileBasename } from './lib/parseLinks.ts'
import './agent-chat.css'

const PANEL_CHANNEL = 'openclaw-panels'

interface StreamingMessage extends ChatMessage {
  streaming?: boolean
}

function getAgentId(): string {
  return new URLSearchParams(window.location.search).get('agent') ?? ''
}

export default function AgentChatPanel() {
  const agentId = getAgentId()
  const [agent, setAgent] = useState<Agent | null>(null)
  const [messages, setMessages] = useState<StreamingMessage[]>([])
  const [isSending, setIsSending] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const clientRef = useRef<OpenClawClient | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const webviewRefs = useRef(new Map<string, Window>())
  const voice = useVoice()
  const tts = useTts()
  const [speakingMsgIdx, setSpeakingMsgIdx] = useState<number | null>(null)

  // Register this panel as open and broadcast to the agents list
  useEffect(() => {
    if (!agentId) return
    localStorage.setItem(`openclaw-panel-${agentId}`, '1')
    const bc = new BroadcastChannel(PANEL_CHANNEL)
    bc.postMessage({ type: 'open', agentId })

    const onUnload = () => {
      localStorage.removeItem(`openclaw-panel-${agentId}`)
      const bc2 = new BroadcastChannel(PANEL_CHANNEL)
      bc2.postMessage({ type: 'close', agentId })
      bc2.close()
    }
    window.addEventListener('beforeunload', onUnload)

    return () => {
      onUnload()
      bc.close()
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [agentId])

  // Connect to OpenClaw, load agent info + history
  useEffect(() => {
    if (!agentId) return
    const client = new OpenClawClient()
    clientRef.current = client

    async function initOnce() {
      const agents = await client.listAgents()
      const found = agents.find(a => a.id === agentId) ?? null
      setAgent(found)
      try {
        const history = await client.getHistory(agentId)
        setMessages(history)
      } catch {
        // No prior history — that's fine
      }
    }

    async function init() {
      try {
        await initOnce()
        setInitError(null)
      } catch (e1) {
        // First attempt failed (e.g. expired/stale device signature — key wiped in client).
        // Retry once with a fresh identity.
        client.close()
        try {
          await initOnce()
          setInitError(null)
        } catch (e2) {
          const msg = (e2 as { message?: string })?.message
            ?? (e2 as { code?: string })?.code
            ?? String(e2)
          setInitError(msg)
        }
      }
    }

    init()
    return () => { client.close(); clientRef.current = null }
  }, [agentId])

  // Clear speaking indicator when audio ends
  useEffect(() => {
    if (!tts.isSpeaking) setSpeakingMsgIdx(null)
  }, [tts.isSpeaking])

  // Scroll to bottom whenever messages change (history load or new message)
  useEffect(() => {
    if (messages.length === 0) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function openLink(url: string) {
    // If already open and not closed, do nothing
    const existing = webviewRefs.current.get(url)
    if (existing && !existing.closed) return

    const sceneId = `link-${btoa(url).replace(/[^a-zA-Z0-9]/g, '').slice(0, 48)}`

    if (isModelUrl(url)) {
      initScene(sceneId, defaults => ({
        ...defaults,
        defaultSize: { width: 600, height: 600 },
      }))
      const win = window.open(`/model-view.html?url=${encodeURIComponent(url)}`, sceneId)
      if (win) webviewRefs.current.set(url, win)
    } else if (isAudioUrl(url)) {
      initScene(sceneId, defaults => ({
        ...defaults,
        defaultSize: { width: 420, height: 240 },
      }))
      const win = window.open(`/audio-player.html?url=${encodeURIComponent(url)}`, sceneId)
      if (win) webviewRefs.current.set(url, win)
    } else if (isVideoUrl(url)) {
      initScene(sceneId, defaults => ({
        ...defaults,
        defaultSize: { width: 720, height: 500 },
      }))
      const win = window.open(`/video-player.html?url=${encodeURIComponent(url)}`, sceneId)
      if (win) webviewRefs.current.set(url, win)
    } else {
      initScene(sceneId, defaults => ({
        ...defaults,
        defaultSize: { width: 800, height: 700 },
      }))
      const win = window.open(`/webview.html?url=${encodeURIComponent(url)}`, sceneId)
      if (win) webviewRefs.current.set(url, win)
    }
  }

  function stripUrls(text: string): string {
    return parseLinks(text).filter(s => s.type === 'text').map(s => s.value).join('')
  }

  function handleSpeak(idx: number, text: string) {
    if (speakingMsgIdx === idx) {
      tts.stop()
      setSpeakingMsgIdx(null)
    } else {
      setSpeakingMsgIdx(idx)
      tts.speak(stripUrls(text))
    }
  }

  async function sendMessage(text: string) {
    if (!text.trim() || isSending || !clientRef.current) return
    setIsSending(true)

    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: text }])

    // Add empty assistant message that will stream in
    setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }])

    try {
      await clientRef.current.sendMessage(
        agentId,
        text,
        (chunk) => {
          setMessages(prev => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant' && last.streaming) {
              next[next.length - 1] = { ...last, content: chunk }
            }
            return next
          })
        },
        () => {
          setMessages(prev => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant' && last.streaming) {
              next[next.length - 1] = { ...last, streaming: false }
            }
            return next
          })
          setIsSending(false)
        },
      )
    } catch {
      setMessages(prev => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant' && last.streaming) {
          next[next.length - 1] = { role: 'assistant', content: '(error — no response)', streaming: false }
        }
        return next
      })
      setIsSending(false)
    }
  }

  async function handleNewSession() {
    setMessages([])
    await sendMessage('/new')
  }

  async function handleVoiceTap() {
    const transcript = await voice.toggle()
    if (transcript?.trim()) {
      await sendMessage(transcript)
    }
  }

  const voiceDisabled = voice.isTranscribing || isSending
  const agentLabel = agent?.identity?.name ?? agent?.name ?? agentId

  function voiceBtnLabel() {
    if (voice.isTranscribing) return 'Transcribing…'
    if (isSending) return 'Agent is thinking…'
    if (voice.isRecording) return 'Recording… tap to stop'
    return 'Tap to speak'
  }

  function renderMessage(msg: StreamingMessage) {
    if (!msg.content) return msg.streaming ? null : '…'
    const segments = parseLinks(msg.content)
    // If no URLs found, render plain (preserves pre-wrap whitespace with no extra nodes)
    if (segments.length === 1 && segments[0].type === 'text') return msg.content
    return segments.map((seg, i) => {
      if (seg.type === 'url') {
        const label = isModelUrl(seg.value) ? modelFilename(seg.value)
          : isAudioUrl(seg.value) || isVideoUrl(seg.value) ? fileBasename(seg.value)
          : shortenUrl(seg.value)
        return (
          <span
            key={i}
            role="button"
            tabIndex={0}
            className="msg-link-btn"
            onClick={() => openLink(seg.value)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLink(seg.value) } }}
            title={seg.value}
          >
            {label}
          </span>
        )
      }
      return <span key={i}>{seg.value}</span>
    })
  }

  return (
    <main className="chat-scene" enable-xr-monitor>
      <div className="chat-panel" enable-xr>

        <header className="chat-header">
          {agent?.identity?.emoji && (
            <span className="chat-header-emoji">{agent.identity.emoji}</span>
          )}
          <span className="chat-header-name">{agentLabel}</span>
          <div className="chat-header-actions">
            <div
              role="button"
              tabIndex={isSending ? -1 : 0}
              className={`new-session-btn${isSending ? ' disabled' : ''}`}
              onClick={isSending ? undefined : handleNewSession}
              onKeyDown={e => { if (!isSending && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handleNewSession() } }}
              aria-label="New session"
              aria-disabled={isSending}
            >
              New
            </div>
          </div>
        </header>

        <div className="chat-messages">
          {initError && (
            <div className="chat-init-error">
              <span>Connection failed: {initError}</span>
              <span className="chat-init-error-hint">Try restarting the OpenClaw gateway (<code>docker compose restart</code>) then reload this panel.</span>
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`msg ${msg.role === 'user' ? 'msg-user' : `msg-assistant${msg.streaming ? ' streaming' : ''}`}`}
            >
              {renderMessage(msg)}
              {/* TTS play button — disabled until AudioContext autoplay is resolved
              {msg.role === 'assistant' && !msg.streaming && msg.content && (
                <div
                  role="button"
                  tabIndex={0}
                  className={`msg-speak-btn${speakingMsgIdx === i ? ' speaking' : ''}`}
                  onClick={() => handleSpeak(i, msg.content)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSpeak(i, msg.content) } }}
                  aria-label={speakingMsgIdx === i ? 'Stop speaking' : 'Speak this message'}
                >
                  {speakingMsgIdx === i ? '■' : '▶'}
                </div>
              )} */}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="chat-controls">
          {/* div+role instead of <button> — <button enable-xr> blocks clicks in WebSpatial XR mode */}
          <div
            role="button"
            tabIndex={voiceDisabled ? -1 : 0}
            className={`voice-btn${voice.isRecording ? ' recording' : ''}${voice.isTranscribing ? ' transcribing' : ''}`}
            onClick={voiceDisabled ? undefined : handleVoiceTap}
            onKeyDown={e => { if (!voiceDisabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handleVoiceTap() } }}
            aria-label={voiceBtnLabel()}
            aria-pressed={voice.isRecording}
            aria-disabled={voiceDisabled}
            enable-xr
          >
            {voice.isRecording && <span className="voice-dot" />}
            {voiceBtnLabel()}
          </div>
          {voice.error && <p className="voice-error">{voice.error}</p>}
          {tts.error && <p className="voice-error">{tts.error}</p>}
        </div>

      </div>
    </main>
  )
}
