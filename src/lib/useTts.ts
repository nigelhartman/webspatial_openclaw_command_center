import { useRef, useState } from 'react'

const TTS_KEY = 'tts-enabled'

// Default voice: ElevenLabs "Rachel"
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'

export function useTts() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(TTS_KEY) === 'true')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  function toggle() {
    const next = !enabled
    setEnabled(next)
    localStorage.setItem(TTS_KEY, String(next))
    if (!next) {
      audioRef.current?.pause()
      setIsSpeaking(false)
    }
  }

  async function speak(text: string) {
    if (!enabled || !text.trim()) return

    const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY as string | undefined
    if (!apiKey) return

    const voiceId = (import.meta.env.VITE_ELEVENLABS_VOICE_ID as string | undefined) ?? DEFAULT_VOICE_ID

    // Stop any in-progress speech
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    setIsSpeaking(true)
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      })
      if (!res.ok) throw new Error(`ElevenLabs ${res.status}`)

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio

      audio.onended = () => {
        setIsSpeaking(false)
        URL.revokeObjectURL(url)
      }
      audio.onerror = () => {
        setIsSpeaking(false)
        URL.revokeObjectURL(url)
      }
      await audio.play()
    } catch {
      setIsSpeaking(false)
    }
  }

  return { enabled, toggle, speak, isSpeaking }
}
