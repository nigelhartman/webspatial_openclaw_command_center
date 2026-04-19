import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import WebViewPanel from './WebViewPanel.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WebViewPanel />
  </StrictMode>,
)
