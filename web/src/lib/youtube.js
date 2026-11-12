export function getYouTubeId(url) {
  if (!url) return null
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/)
  return match ? match[1] : null
}

// "95", "95s", "1m35s", "1h2m3s" or "1:35" → seconds. Anything else → null.
export function parseTime(value) {
  if (value == null || value === '') return null
  const v = String(value).trim()
  if (/^\d+$/.test(v)) return Number(v)
  if (/^\d+(:\d{1,2}){1,2}$/.test(v)) return v.split(':').reduce((acc, n) => acc * 60 + Number(n), 0)
  const m = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (m && (m[1] || m[2] || m[3])) return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0)
  return null
}

// Clip window from the URL: `t` or `start` for the start, `end` for the end.
// Lets a scene use one part of a longer video, e.g. ...watch?v=ID&t=1m35s&end=5m20s
export function getClipRange(url) {
  if (!url) return { start: null, end: null }
  let params
  try { params = new URL(url).searchParams } catch { return { start: null, end: null } }
  const start = parseTime(params.get('start') ?? params.get('t'))
  let end = parseTime(params.get('end'))
  if (end != null && start != null && end <= start) end = null
  return { start, end }
}

// youtube-nocookie avoids tracking cookies until the learner presses play.
export function getYouTubeEmbedUrl(url) {
  const id = getYouTubeId(url)
  if (!id) return null
  const { start, end } = getClipRange(url)
  const range = `${start ? `&start=${start}` : ''}${end ? `&end=${end}` : ''}`
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1${range}`
}

export function getYouTubeThumb(url) {
  const id = getYouTubeId(url)
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
}

export function formatClip(url) {
  const { start, end } = getClipRange(url)
  const f = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  if (start == null && end == null) return ''
  return `${start != null ? f(start) : '0:00'}–${end != null ? f(end) : 'end'}`
}
