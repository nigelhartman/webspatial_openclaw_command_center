import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PanelB from './PanelB.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PanelB />
  </StrictMode>,
)
