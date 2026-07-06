import { useState } from 'react'
import { extend } from '@pixi/react'
import '@pixi/layout' // enables the optional `layout` prop
import { Assets, Sprite, Texture } from 'pixi.js'
import type { LayoutStyle } from './PixiLayout'

// Register <pixiSprite> as a JSX element (idempotent).
extend({ Sprite })

export interface IconButtonProps {
  /** Icon texture, or an asset alias to resolve via Assets.get (must be loaded). */
  icon: Texture | string
  /** Called on tap/click (ignored when disabled). */
  onPress?: () => void
  /** Square display size in px. Omit to use the texture's natural size. */
  size?: number
  disabled?: boolean
  x?: number
  y?: number
  /** Opt into flex layout (as a child of a PixiLayout). Omit to position with x/y. */
  layout?: LayoutStyle
  label?: string
}

/**
 * Reusable tappable icon button for @pixi/react. The icon art already includes the button look
 * (e.g. `sound_idle`, `info_idle`, `exit_idle`), so this is just an interactive Sprite: pointer
 * cursor, press feedback (dim on hold), disabled state, and an `onPress` callback. Renders nothing
 * until its texture is loaded.
 *
 * @example
 * <IconButton icon="info_idle" size={44} onPress={() => showOverlay('info')} />
 */
export function IconButton({
  icon,
  onPress,
  size,
  disabled = false,
  x,
  y,
  layout,
  label,
}: IconButtonProps) {
  const [pressed, setPressed] = useState(false)
  const tex = typeof icon === 'string' ? Assets.get<Texture>(icon) : icon
  if (!tex) return null

  const dims = size != null ? { width: size, height: size } : {}

  return (
    <pixiSprite
      texture={tex}
      {...dims}
      x={x}
      y={y}
      layout={layout}
      label={label}
      alpha={disabled ? 0.4 : pressed ? 0.75 : 1}
      eventMode={disabled ? 'none' : 'static'}
      cursor={disabled ? 'default' : 'pointer'}
      onPointerTap={disabled ? undefined : () => onPress?.()}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerUpOutside={() => setPressed(false)}
      onPointerOut={() => setPressed(false)}
    />
  )
}

export default IconButton
