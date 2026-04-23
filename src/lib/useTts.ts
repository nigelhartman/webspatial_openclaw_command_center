import { useEffect, useRef, useState } from 'react'

const DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb'

export function useTts() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)

  useEffect(() => {
    return () => {
      try { sourceRef.current?.stop() } catch { /* already stopped */ }
      ctxRef.current?.close()
    }
  }, [])

  async function speak(text: string) {
    if (!text.trim()) return

    const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY as string | undefined
    if (!apiKey) { setError('No ElevenLabs API key'); return }

    // Create/resume AudioContext within this user gesture so playback is allowed
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext()
    }
    if (ctxRef.current.state === 'suspended') {
      await ctxRef.current.resume()
    }

    try { sourceRef.current?.stop() } catch { /* already stopped */ }
    sourceRef.current = null

    const voiceId = (import.meta.env.VITE_ELEVENLABS_VOICE_ID as string | undefined) ?? DEFAULT_VOICE_ID

    setIsSpeaking(true)
    setError(null)

    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
          },
          body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
        },
      )
      if (!res.ok) throw new Error(`ElevenLabs ${res.status}`)

      const arrayBuffer = await res.arrayBuffer()
      const audioBuffer = await ctxRef.current.decodeAudioData(arrayBuffer)

      const source = ctxRef.current.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctxRef.current.destination)
      sourceRef.current = source
      source.onended = () => {
        setIsSpeaking(false)
        if (sourceRef.current === source) sourceRef.current = null
      }
      source.start(0)
    } catch (e) {
      setIsSpeaking(false)
      setError(e instanceof Error ? e.message : 'TTS failed')
    }
  }

  function stop() {
    try { sourceRef.current?.stop() } catch { /* already stopped */ }
    sourceRef.current = null
    setIsSpeaking(false)
  }

  return { speak, stop, isSpeaking, error }
}
