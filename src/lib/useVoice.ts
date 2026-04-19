import { useState, useRef, useCallback } from 'react'

const ELEVENLABS_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY as string

export function useVoice() {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const startRecording = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.start(100)
      recorderRef.current = recorder
      setIsRecording(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone access denied')
    }
  }, [])

  const stopAndTranscribe = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      const recorder = recorderRef.current
      if (!recorder) { resolve(''); return }

      recorder.onstop = async () => {
        recorder.stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
        setIsTranscribing(true)
        try {
          const form = new FormData()
          form.append('file', blob, 'recording.webm')
          form.append('model_id', 'scribe_v1')
          const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
            method: 'POST',
            headers: { 'xi-api-key': ELEVENLABS_KEY },
            body: form,
          })
          if (!res.ok) throw new Error(`STT error: ${res.status}`)
          const data = await res.json() as { text?: string }
          resolve(data.text ?? '')
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Transcription failed'
          setError(msg)
          reject(new Error(msg))
        } finally {
          setIsTranscribing(false)
        }
      }

      recorder.stop()
      setIsRecording(false)
    })
  }, [])

  // Tap to toggle: first tap starts recording, second tap stops and transcribes.
  // Returns null when starting, returns transcript string when done.
  const toggle = useCallback(async (): Promise<string | null> => {
    if (isRecording) {
      return stopAndTranscribe()
    }
    await startRecording()
    return null
  }, [isRecording, startRecording, stopAndTranscribe])

  return { isRecording, isTranscribing, error, toggle }
}
