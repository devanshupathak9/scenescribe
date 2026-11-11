// Text-to-speech for the AI debate opponent (browser speechSynthesis).

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
export const isTtsSupported = () => Boolean(synth && window.SpeechSynthesisUtterance)

let cachedVoice = null

function pickVoice() {
  if (!synth) return null
  if (cachedVoice) return cachedVoice
  const voices = synth.getVoices().filter(v => /^en[-_]/i.test(v.lang))
  if (!voices.length) return null
  const score = (v) =>
    (/natural|neural|premium|enhanced/i.test(v.name) ? 4 : 0) +
    (/google/i.test(v.name) ? 3 : 0) +
    (/en[-_](US|GB|IN)/i.test(v.lang) ? 2 : 0) +
    (v.localService ? 0 : 1)
  cachedVoice = voices.sort((a, b) => score(b) - score(a))[0]
  return cachedVoice
}

// Voices load asynchronously in Chrome; call early so the first turn sounds right.
export function warmUpVoices() {
  if (!synth) return
  pickVoice()
  synth.onvoiceschanged = () => { cachedVoice = null; pickVoice() }
}

/**
 * Speak text sentence by sentence (Chrome silently stops utterances longer
 * than ~15s). Returns { cancel(), done: Promise<void> }.
 * onProgress(charIndex) reports how much has been spoken, for captions.
 */
export function speak(text, { rate = 1, onProgress } = {}) {
  if (!isTtsSupported() || !text) return { cancel() {}, done: Promise.resolve() }

  synth.cancel()
  const parts = text.match(/[^.!?]+[.!?]*\s*/g) || [text]
  let cancelled = false
  let offset = 0

  const done = (async () => {
    for (const part of parts) {
      if (cancelled) return
      const start = offset
      await new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(part.trim())
        const voice = pickVoice()
        if (voice) u.voice = voice
        u.lang = voice?.lang || 'en-US'
        u.rate = rate
        u.onboundary = (e) => onProgress?.(start + (e.charIndex || 0))
        u.onend = resolve
        u.onerror = resolve
        synth.speak(u)
        // Safety net: some engines never fire onend.
        setTimeout(resolve, Math.max(4000, part.length * 120))
      })
      offset += part.length
      onProgress?.(offset)
    }
  })()

  return {
    cancel() {
      cancelled = true
      synth.cancel()
    },
    done,
  }
}

export function stopSpeaking() {
  try { synth?.cancel() } catch { /* ignore */ }
}
