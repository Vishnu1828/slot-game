import { useEffect, useState } from 'react'

/** Layout categories that drive per-mode sizing (desktop vs mobile landscape vs portrait). */
export type LayoutMode = 'desktop' | 'mobile-landscape' | 'portrait'

// A landscape viewport whose SHORT side is <= this is treated as a phone in landscape (vs desktop).
// Short side ≈ height in landscape: phones ~360–450, tablets/desktops larger.
const MOBILE_LANDSCAPE_MAX_SHORT_SIDE = 600

export interface Screen {
  w: number
  h: number
  /** true when height >= width (portrait / vertical). */
  portrait: boolean
  /** true when width > height. */
  landscape: boolean
  /** 'portrait' | 'mobile-landscape' | 'desktop' — use to reduce sizes per device class. */
  mode: LayoutMode
}

function resolve(w: number, h: number): Screen {
  const portrait = h >= w
  const mode: LayoutMode = portrait
    ? 'portrait'
    : Math.min(w, h) <= MOBILE_LANDSCAPE_MAX_SHORT_SIDE
      ? 'mobile-landscape'
      : 'desktop'
  return { w, h, portrait, landscape: !portrait, mode }
}

/**
 * Tracks the render surface size + orientation/layout mode so components can pick the right art and
 * cover-fit or reduce sizes per device class. Updates on resize and orientation change.
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
  return resolve(size.w, size.h)
}
