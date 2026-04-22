import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AudioPlayerPanel from './AudioPlayerPanel.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AudioPlayerPanel />
  </StrictMode>,
)
