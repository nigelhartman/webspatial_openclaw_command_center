import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AgentsPanel from './AgentsPanel.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AgentsPanel />
  </StrictMode>,
)
