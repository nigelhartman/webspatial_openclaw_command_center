import { useRef, useState } from 'react'
import { fileBasename } from './lib/parseLinks.ts'
import './audio-player.css'

function getUrl(): string {
  return new URLSearchParams(window.location.search).get('url') ?? ''
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function AudioPlayerPanel() {
  const url = getUrl()
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(false)

  function togglePlay() {
    const audio = audioRef.current
    if (!audio || !ready) return
    if (isPlaying) {
      audio.pause()
    } else {
      audio.play().catch(() => setError(true))
    }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = Number(e.target.value)
  }

  if (!url) {
    return (
      <main className="audio-scene" enable-xr-monitor>
        <div className="audio-panel" enable-xr>
          <p className="audio-error">No audio URL provided.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="audio-scene" enable-xr-monitor>
      <div className="audio-panel" enable-xr>

        {/* Hidden native audio element — handles loading, CORS, redirects */}
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          onLoadedMetadata={e => { setDuration(e.currentTarget.duration); setReady(true) }}
          onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onError={() => setError(true)}
          style={{ display: 'none' }}
        />

        <span className="audio-filename">{fileBasename(url)}</span>

        {error ? (
          <p className="audio-error">Failed to load audio.</p>
        ) : (
          <>
            <div
              role="button"
              tabIndex={ready ? 0 : -1}
              className={`audio-play-btn${!ready ? ' loading' : ''}`}
              onClick={togglePlay}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePlay() } }}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {!ready ? '…' : isPlaying ? '⏸' : '▶'}
            </div>

            <div className="audio-scrubber">
              <input
                type="range"
                className="audio-slider"
                min={0}
                max={duration || 0}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                aria-label="Seek"
              />
              <div className="audio-times">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          </>
        )}

      </div>
    </main>
  )
}
