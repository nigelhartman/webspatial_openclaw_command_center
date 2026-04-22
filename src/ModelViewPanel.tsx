import { useState } from 'react'
import { Model } from '@webspatial/react-sdk'
import { modelFilename } from './lib/parseLinks.ts'
import './model-view.css'

function getUrl(): string {
  return new URLSearchParams(window.location.search).get('url') ?? ''
}

export default function ModelViewPanel() {
  const url = getUrl()
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')

  if (!url) {
    return (
      <main className="model-scene" enable-xr-monitor>
        <div className="model-panel" enable-xr>
          <div className="model-error">No model URL provided.</div>
        </div>
      </main>
    )
  }

  return (
    <main className="model-scene" enable-xr-monitor>
      <div className="model-panel" enable-xr>
        <header className="model-header">
          <span className="model-filename">{modelFilename(url)}</span>
        </header>
        <div className="model-content">
          {status === 'error' ? (
            <p className="model-error">Failed to load model.<br />{url}</p>
          ) : (
            <>
              {status === 'loading' && <p className="model-status">Loading…</p>}
              <Model
                src={url}
                enable-xr
                className="model-viewer"
                onLoad={() => setStatus('loaded')}
                onError={() => setStatus('error')}
              />
            </>
          )}
        </div>
      </div>
    </main>
  )
}
