import { useEffect } from 'react'

export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · SceneScribe` : 'SceneScribe — Learn English by describing what you see'
  }, [title])
}
