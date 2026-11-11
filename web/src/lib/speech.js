// Thin wrapper over the browser Web Speech API (Chrome, Edge, Safari 14.5+).
// No audio leaves the browser through our servers; the browser vendor's
// recogniser does the transcription.

const Recognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null

export const isSpeechSupported = () => Boolean(Recognition)

const LONG_PAUSE_MS = 2000
const LOW_CONFIDENCE = 0.6

export const SPEECH_ERRORS = {
  'not-allowed': 'Microphone access is blocked. Allow it from the address bar (🔒 icon) and try again.',
  'service-not-allowed': 'Speech recognition is blocked in this browser. Try Chrome or Edge.',
  'audio-capture': 'No microphone was found. Plug one in or check your system settings.',
  network: 'Speech recognition needs an internet connection.',
}

/**
 * createSpeechSession({ lang, onUpdate, onError })
 *   onUpdate({ finalText, interimText })   — on every recognition event
 *   onError(code, message)                 — fatal errors only (permission, no device)
 * Returns { start(), stop(), isActive(), getMetrics() }.
 *
 * Chrome ends recognition after a few seconds of silence or ~60s of audio;
 * we transparently restart while the session is meant to be active.
 */
export function createSpeechSession({ lang = 'en-US', onUpdate, onError, initialText = '' } = {}) {
  if (!Recognition) throw new Error('Speech recognition not supported')

  let recognition = null
  let active = false
  let finalText = initialText ? `${initialText.trim()} ` : ''
  let lastResultAt = null
  let longPauses = 0
  const confidences = []
  const lowWords = new Set()

  function build() {
    const r = new Recognition()
    r.lang = lang
    r.continuous = true
    r.interimResults = true
    r.maxAlternatives = 1

    r.onresult = (e) => {
      const now = performance.now()
      if (lastResultAt !== null && now - lastResultAt > LONG_PAUSE_MS) longPauses += 1
      lastResultAt = now

      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        const alt = res[0]
        if (res.isFinal) {
          finalText += `${alt.transcript.trim()} `
          // Some platforms always report 0 — treat that as "unknown".
          if (alt.confidence > 0) {
            confidences.push(alt.confidence)
            if (alt.confidence < LOW_CONFIDENCE) {
              alt.transcript.toLowerCase().match(/[a-z']{4,}/g)?.forEach(w => lowWords.size < 30 && lowWords.add(w))
            }
          }
        } else {
          interim += alt.transcript
        }
      }
      onUpdate?.({ finalText: finalText.trim(), interimText: interim.trim() })
    }

    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return // benign; onend restarts
      if (SPEECH_ERRORS[e.error]) {
        active = false
        onError?.(e.error, SPEECH_ERRORS[e.error])
      }
    }

    r.onend = () => {
      if (!active) return
      // Restart after Chrome's automatic stop. Small delay avoids InvalidStateError.
      setTimeout(() => {
        if (!active) return
        try { recognition = build(); recognition.start() } catch { /* already started */ }
      }, 120)
    }
    return r
  }

  return {
    start() {
      if (active) return
      active = true
      recognition = build()
      try { recognition.start() } catch (err) { active = false; onError?.('start-failed', err.message) }
    },
    stop() {
      active = false
      try { recognition?.stop() } catch { /* not running */ }
    },
    abort() {
      active = false
      try { recognition?.abort() } catch { /* not running */ }
    },
    isActive: () => active,
    getText: () => finalText.trim(),
    getMetrics: () => ({
      long_pauses: longPauses,
      avg_confidence: confidences.length ? confidences.reduce((a, c) => a + c, 0) / confidences.length : null,
      low_confidence_words: [...lowWords],
    }),
  }
}
