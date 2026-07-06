import { useEffect, useState } from 'react'

export interface Screen {
  w: number
  h: number
  /** true when height >= width (portrait / vertical). */
  portrait: boolean
}

/**
 * Tracks the render surface size + orientation so components can pick the right art and cover-fit
 * or lay out against the current viewport. Updates on resize and orientation change.
 */
export function useScreen(): Screen {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const update = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', update)
    // Rotation on mobile: 'resize' can fire before innerWidth/Height settle, so also re-read
    // after orientationchange (and again on the next frame to catch the settled values).
    const onOrientation = () => {
      update()
      requestAnimationFrame(update)
    }
    window.addEventListener('orientationchange', onOrientation)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', onOrientation)
    }
  }, [])
  return { ...size, portrait: size.h >= size.w }
}
