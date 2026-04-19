import { useState } from 'react'
import './webview.css'

function getUrl(): string {
  return new URLSearchParams(window.location.search).get('url') ?? ''
}

export default function WebViewPanel() {
  const url = getUrl()
  const [blocked, setBlocked] = useState(false)

  if (!url) {
    return (
      <main className="webview-scene" enable-xr-monitor>
        <div className="webview-panel" enable-xr>
          <div className="webview-blocked">No URL provided.</div>
        </div>
      </main>
    )
  }

  return (
    <main className="webview-scene" enable-xr-monitor>
      <div className="webview-panel" enable-xr>
        <header className="webview-header">
          <span className="webview-url">{url}</span>
        </header>
        <div className="webview-content">
          {blocked ? (
            <div className="webview-blocked">
              <span>This page cannot be shown in a panel (it blocked embedding).</span>
              <a href={url} target="_blank" rel="noreferrer">{url}</a>
            </div>
          ) : (
            <iframe
              src={url}
              className="webview-iframe"
              title={url}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              onError={() => setBlocked(true)}
            />
          )}
        </div>
      </div>
    </main>
  )
}
