import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PanelA from './PanelA.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PanelA />
  </StrictMode>,
)
