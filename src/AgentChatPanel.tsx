import { useEffect, useRef, useState } from 'react'
import { OpenClawClient, type Agent, type ChatMessage } from './lib/openclaw.ts'
import { useVoice } from './lib/useVoice.ts'
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
  const clientRef = useRef<OpenClawClient | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const voice = useVoice()

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

    async function init() {
      // Load agent metadata
      const agents = await client.listAgents()
      const found = agents.find(a => a.id === agentId) ?? null
      setAgent(found)

      // Load history
      try {
        const history = await client.getHistory(agentId)
        setMessages(history)
      } catch {
        // No prior history — that's fine
      }
    }

    init().catch(console.error)
    return () => { client.close(); clientRef.current = null }
  }, [agentId])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
              next[next.length - 1] = { ...last, content: last.content + chunk }
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

  return (
    <main className="chat-scene" enable-xr-monitor>
      <div className="chat-panel" enable-xr>

        <header className="chat-header">
          {agent?.identity?.emoji && (
            <span className="chat-header-emoji">{agent.identity.emoji}</span>
          )}
          <span className="chat-header-name">{agentLabel}</span>
        </header>

        <div className="chat-messages">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`msg ${msg.role === 'user' ? 'msg-user' : `msg-assistant${msg.streaming ? ' streaming' : ''}`}`}
            >
              {msg.content || (msg.streaming ? '' : '…')}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="chat-controls">
          <button
            className={`voice-btn${voice.isRecording ? ' recording' : ''}${voice.isTranscribing ? ' transcribing' : ''}`}
            onClick={handleVoiceTap}
            disabled={voiceDisabled}
            enable-xr
          >
            {voice.isRecording && <span className="voice-dot" />}
            {voiceBtnLabel()}
          </button>
          {voice.error && <p className="voice-error">{voice.error}</p>}
        </div>

      </div>
    </main>
  )
}
