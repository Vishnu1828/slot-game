import { useEffect, useState } from 'react'
import { initAssets, loadAssets, loadGame } from '../assets/loader'
import LoadingScreen, { LOADING_FONT } from './LoadingScreen'
import GameScreen from './GameScreen'

type Phase = 'preload' | 'loading' | 'ready'

/** Remove the instant HTML/CSS splash (index.html) once real content is on screen. */
function dismissSplash() {
  const el = document.getElementById('app-splash')
  if (!el) return
  el.classList.add('hide')
  el.addEventListener('transitionend', () => el.remove(), { once: true })
}

export interface GameShellProps {
  /** Which game to load & render. Drives the `${game}` / `${game}-preload` asset bundles. */
  game: string
}

/**
 * The asset-load orchestrator for a game. Pass a `game` name and it:
 *   1. inits the manifest and loads just the loading-screen font (fast first paint),
 *   2. shows the LoadingScreen while it streams the full game bundle (common + game),
 *   3. swaps to the GameScreen when ready.
 */
export function GameShell({ game }: GameShellProps) {
  const [phase, setPhase] = useState<Phase>('preload')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let alive = true
    ;(async () => {
      await initAssets()
      if (!alive) return
      // Load just the loading-screen font first so "Loading..." paints fast. (No dedicated
      // loading/scenario art in this game — the loading screen is a solid bg + text + progress.)
      await loadAssets([`${LOADING_FONT}.fnt`])
      if (!alive) return
      dismissSplash()
      setPhase('loading')

      // Stream the full game (common + game bundle) while the loading screen is up.
      await loadGame(game, (p) => {
        if (alive) setProgress(p)
      })
      if (!alive) return

      setPhase('ready')
    })()
    return () => {
      alive = false
    }
  }, [game])

  // Nothing to draw until the loading image is available (Application bg shows through).
  if (phase === 'preload') return null
  if (phase === 'ready') return <GameScreen />
  return <LoadingScreen progress={progress} />
}

export default GameShell
