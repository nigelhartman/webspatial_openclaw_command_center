import { useRef, useState } from 'react'
import { fileBasename } from './lib/parseLinks.ts'
import './video-player.css'

function getUrl(): string {
  return new URLSearchParams(window.location.search).get('url') ?? ''
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function VideoPlayerPanel() {
  const url = getUrl()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(false)

  function togglePlay() {
    const video = videoRef.current
    if (!video || !ready) return
    if (isPlaying) {
      video.pause()
    } else {
      video.play().catch(() => setError(true))
    }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Number(e.target.value)
  }

  if (!url) {
    return (
      <main className="video-scene" enable-xr-monitor>
        <div className="video-panel" enable-xr>
          <div className="video-error">No video URL provided.</div>
        </div>
      </main>
    )
  }

  return (
    <main className="video-scene" enable-xr-monitor>
      <div className="video-panel" enable-xr>

        <header className="video-header">
          <span className="video-filename">{fileBasename(url)}</span>
        </header>

        {error ? (
          <div className="video-error">Failed to load video.</div>
        ) : (
          <video
            ref={videoRef}
            src={url}
            className="video-element"
            preload="metadata"
            playsInline
            onLoadedMetadata={e => { setDuration(e.currentTarget.duration); setReady(true) }}
            onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            onError={() => setError(true)}
          />
        )}

        <div className="video-controls">
          <div className="video-scrubber">
            <input
              type="range"
              className="video-slider"
              min={0}
              max={duration || 0}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              aria-label="Seek"
            />
          </div>
          <div className="video-bottom-row">
            <div
              role="button"
              tabIndex={ready ? 0 : -1}
              className={`video-play-btn${!ready ? ' loading' : ''}`}
              onClick={togglePlay}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePlay() } }}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {!ready ? '…' : isPlaying ? '⏸' : '▶'}
            </div>
            <div className="video-times">
              <span>{formatTime(currentTime)}</span>
              <span className="video-times-sep">/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </div>

      </div>
    </main>
  )
}
