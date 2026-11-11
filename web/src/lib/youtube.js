export function getYouTubeId(url) {
  if (!url) return null
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/)
  return match ? match[1] : null
}

// youtube-nocookie avoids tracking cookies until the learner presses play.
export function getYouTubeEmbedUrl(url) {
  const id = getYouTubeId(url)
  return id ? `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1` : null
}

export function getYouTubeThumb(url) {
  const id = getYouTubeId(url)
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
}
