import type { Ref } from 'react'
import { extend } from '@pixi/react'
import '@pixi/layout' // enables the optional `layout` prop even if PixiLayout isn't imported
import { Assets, Sprite, Texture, type ColorSource, type EventMode, type PointData } from 'pixi.js'
import type { LayoutStyle } from './PixiLayout'

// Register <pixiSprite> as a JSX element (idempotent).
extend({ Sprite })

export interface PixiSpriteProps {
  /** A Texture, or an asset alias to resolve via `Assets.get` (the asset must be loaded). */
  texture: Texture | string
  x?: number
  y?: number
  /** 0..1 — a single number for both axes, or `{ x, y }`. Default 0 (top-left). */
  anchor?: number | PointData
  /** Uniform scale (number) or per-axis `{ x, y }`. */
  scale?: number | PointData
  /** Explicit display size in px (overrides the texture's natural size). */
  width?: number
  height?: number
  rotation?: number
  angle?: number
  /** Multiplies the texture color (0xffffff = unchanged). */
  tint?: ColorSource
  alpha?: number
  visible?: boolean
  eventMode?: EventMode
  cursor?: string
  /** Opt into flex layout (as a child of a PixiLayout). Omit to position with x/y. */
  layout?: LayoutStyle
  label?: string
  ref?: Ref<Sprite>
}

/**
 * Reusable Pixi Sprite for @pixi/react. Accepts either a Texture or an asset alias string
 * (resolved via Assets.get) and renders nothing until that texture is available — so it won't
 * flash an empty/broken sprite before the bundle finishes loading.
 *
 * @example
 * <PixiSprite texture="symbol_cherry" anchor={0.5} x={cx} y={cy} />
 * <PixiSprite texture={someTexture} width={120} height={120} tint={0xffd21e} />
 */
export function PixiSprite({ texture, ref, ...props }: PixiSpriteProps) {
  const tex = typeof texture === 'string' ? Assets.get<Texture>(texture) : texture
  if (!tex) return null
  return <pixiSprite ref={ref} texture={tex} {...props} />
}

export default PixiSprite
