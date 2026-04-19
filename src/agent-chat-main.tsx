import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AgentChatPanel from './AgentChatPanel.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AgentChatPanel />
  </StrictMode>,
)
