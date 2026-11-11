// SceneScribe "Frame" mark: viewfinder corners (the scene) around a speech
// bubble (your words). Source of truth: the brand canvas.

export function LogoMark({ size = 32, tile = true, title }) {
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': 'true' }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" {...a11y} className="logo-mark">
      {tile && <rect width="100" height="100" rx="24" fill="#e8ff47" />}
      <path d="M20 34V20h14M66 20h14v14M80 66v14H66M34 80H20V66" fill="none"
        stroke={tile ? '#0f0f12' : '#e8ff47'} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M36 33h28a7 7 0 0 1 7 7v14a7 7 0 0 1-7 7H49l-9 8v-8h-4a7 7 0 0 1-7-7V40a7 7 0 0 1 7-7z"
        fill={tile ? '#0f0f12' : '#e8ff47'} />
      {size >= 40 && (
        <>
          <rect x="37" y="41" width="26" height="4" rx="2" fill={tile ? '#e8ff47' : '#0f0f12'} />
          <rect x="37" y="49" width="16" height="4" rx="2" fill={tile ? '#e8ff47' : '#0f0f12'} />
        </>
      )}
    </svg>
  )
}

export function Wordmark() {
  // One word, no gap: "SceneScribe", with "Scribe" in lime.
  return <span className="wordmark">Scene<span className="wordmark-accent">Scribe</span></span>
}
