import { useEffect, useRef, useState } from 'react'
import { initScene } from '@webspatial/react-sdk'
import { OpenClawClient, type Agent } from './lib/openclaw.ts'
import './agents-panel.css'

const PANEL_CHANNEL = 'openclaw-panels'

function readOpenPanels(): Set<string> {
  const open = new Set<string>()
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('openclaw-panel-')) {
      open.add(key.slice('openclaw-panel-'.length))
    }
  }
  return open
}

export default function AgentsPanel() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [openPanels, setOpenPanels] = useState<Set<string>>(readOpenPanels)
  const [error, setError] = useState<string | null>(null)
  const windowRefs = useRef(new Map<string, Window>())

  // Load agents from OpenClaw
  useEffect(() => {
    const client = new OpenClawClient()
    client.listAgents()
      .then(setAgents)
      .catch((e) => setError(String(e)))
    return () => client.close()
  }, [])

  // Listen for panel open/close broadcast from chat windows
  useEffect(() => {
    const bc = new BroadcastChannel(PANEL_CHANNEL)
    bc.onmessage = (e: MessageEvent<{ type: 'open' | 'close'; agentId: string }>) => {
      const { type, agentId } = e.data
      setOpenPanels(prev => {
        const next = new Set(prev)
        if (type === 'open') next.add(agentId)
        else next.delete(agentId)
        return next
      })
    }
    return () => bc.close()
  }, [])

  function handleAgentClick(agentId: string) {
    if (openPanels.has(agentId)) {
      // Close the panel
      windowRefs.current.get(agentId)?.close()
      windowRefs.current.delete(agentId)
      // State will update via the 'close' BC message from the chat panel's unload handler
    } else {
      // Open a new agent chat panel
      initScene(`agent-${agentId}`, defaults => ({
        ...defaults,
        defaultSize: { width: 680, height: 620 },
      }))
      const win = window.open(`/agent-chat.html?agent=${encodeURIComponent(agentId)}`, `agent-${agentId}`)
      if (win) windowRefs.current.set(agentId, win)
    }
  }

  return (
    <main className="agents-scene" enable-xr-monitor>
      <div className="agents-card" enable-xr>
        <p className="agents-title">OpenClaw Agents</p>

        {error && <p className="agents-empty">{error}</p>}
        {!error && agents.length === 0 && (
          <p className="agents-empty">Loading…</p>
        )}

        {agents.map(agent => {
          const isOpen = openPanels.has(agent.id)
          return (
            <button
              key={agent.id}
              className={`agent-btn ${isOpen ? 'is-open' : 'is-closed'}`}
              onClick={() => handleAgentClick(agent.id)}
              enable-xr
            >
              {agent.identity?.emoji && (
                <span className="agent-emoji">{agent.identity.emoji}</span>
              )}
              <span className="agent-name">
                {agent.identity?.name ?? agent.name ?? agent.id}
              </span>
              <span className="agent-status-dot" />
            </button>
          )
        })}
      </div>
    </main>
  )
}
