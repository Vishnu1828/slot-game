import { useEffect, useMemo, useState } from 'react'
import { extend } from '@pixi/react'
import {
  Assets,
  BitmapText,
  Container,
  Graphics,
  Sprite,
  Texture,
  type TextStyleOptions,
} from 'pixi.js'
import { initAssets, loadAssets, loadGame } from '../assets/loader'

// Register the Pixi classes we use as JSX elements (<pixiContainer/>, <pixiSprite/>, ...).
extend({ Container, Sprite, Graphics, BitmapText })

const GAME = 'lucky-slots'

// Bitmap font used on the loading screen. It lives in the `common` bundle (which only finishes
// loading during loadGame), so we load it EXPLICITLY up front — otherwise a <pixiBitmapText>
// shown during the 'loading' phase has no installed font and renders nothing.
// NOTE: fontFamily must be the .fnt's internal `face` name, which is this same string.
const LOADING_FONT = 'roulette_title_font_mobile.fnt'

type Phase = 'preload' | 'loading' | 'ready'

/** Remove the instant HTML/CSS splash (index.html) once real content is on screen. */
function dismissSplash() {
  const el = document.getElementById('app-splash')
  if (!el) return
  el.classList.add('hide')
  el.addEventListener('transitionend', () => el.remove(), { once: true })
}

/** Track the render surface size + orientation so we can pick the right art and cover-fit it. */
function useScreen() {
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

/** A sprite scaled to COVER the screen (like CSS background-size: cover), centered. */
function CoverSprite({
  texture,
  w,
  h,
  style,
}: {
  texture: Texture
  w: number
  h: number
  style: TextStyleOptions
}) {
  const scale = Math.max(w / texture.width, h / texture.height)
  return (
    <>
      <pixiSprite texture={texture} anchor={0.5} x={w / 2} y={h / 2} scale={scale} />
      <pixiBitmapText style={style} text="Loading..." x={w / 2} y={h / 2} anchor={0.5} />
    </>
  )
}

/** Simple loading bar drawn with Graphics; redraws whenever `value` (0..1) changes. */
function ProgressBar({ value, w, h }: { value: number; w: number; h: number }) {
  const barW = Math.min(w * 0.6, 640)
  const barH = 14
  const x = (w - barW) / 2
  const y = h * 0.88
  return (
    <pixiGraphics
      draw={(g) => {
        g.clear()
        g.roundRect(x, y, barW, barH, barH / 2).fill({ color: 0x000000, alpha: 0.45 })
        g.roundRect(x, y, barW * value, barH, barH / 2).fill({ color: 0xffd21e })
      }}
    />
  )
}

export default function Scene() {
  const [phase, setPhase] = useState<Phase>('preload')
  const [progress, setProgress] = useState(0)
  const screen = useScreen()
  const style = useMemo(
    () => ({
      fontFamily: 'roulette_title_font_mobile',
      fontSize: 34,
      align: 'center' as const,
      lineHeight: 34 * 1.2,
    }),
    [],
  )

  useEffect(() => {
    let alive = true
    // Pick the loading-screen image up front (from the initial orientation).
    const scenario =
      window.innerHeight >= window.innerWidth ? 'scenario_mobile_vertical' : 'scenario_desktop'
    ;(async () => {
      // 1. Init the manifest, then load ONLY the single loading-screen image (not the whole
      //    preload bundle) so the loading screen paints as fast as possible.
      await initAssets()
      if (!alive) return
      // Load the loading-screen image AND its bitmap font before painting the loading screen.
      await loadAssets([scenario, LOADING_FONT])
      if (!alive) return
      dismissSplash()
      setPhase('loading')

      // 2. While the loading screen is up, stream in the full game bundle (common + game).
      await loadGame(GAME, (p) => {
        if (alive) setProgress(p)
      })
      if (!alive) return

      // 3. Game assets are ready -> show the game, and free the loading-screen image.
      setPhase('ready')
      void Assets.unload(scenario)
    })()
    return () => {
      alive = false
    }
  }, [])

  // Nothing to draw until the preload image is available (Application bg shows through).
  if (phase === 'preload') return null

  const bgAlias =
    phase === 'ready'
      ? screen.portrait
        ? 'bg_vertical'
        : 'bg_horizontal'
      : screen.portrait
        ? 'scenario_mobile_vertical'
        : 'scenario_desktop'

  const bg = Assets.get<Texture>(bgAlias)

  return (
    <pixiContainer>
      {bg && <CoverSprite texture={bg} w={screen.w} h={screen.h} style={style} />}
      {phase === 'loading' && <ProgressBar value={progress} w={screen.w} h={screen.h} />}
    </pixiContainer>
  )
}
