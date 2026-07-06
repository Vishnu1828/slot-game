import type { Ref } from 'react'
import { extend } from '@pixi/react'
import '@pixi/layout' // enables the optional `layout` prop even if PixiLayout isn't imported
import {
  Assets,
  NineSliceSprite,
  Texture,
  type ColorSource,
  type EventMode,
  type PointData,
} from 'pixi.js'
import type { LayoutStyle } from './PixiLayout'

// Register <pixiNineSliceSprite> as a JSX element (idempotent).
extend({ NineSliceSprite })

export interface PixiNineSliceSpriteProps {
  /** A Texture, or an asset alias to resolve via `Assets.get` (the asset must be loaded). */
  texture: Texture | string
  /**
   * Corner inset sizes in px. The four corners keep their size, the edges stretch along one axis,
   * and the middle fills — so a small source frame scales to any width/height without distorting
   * its border. Ideal for buttons, panels, and popup frames.
   */
  leftWidth?: number
  topHeight?: number
  rightWidth?: number
  bottomHeight?: number
  /** Target size the frame stretches to (corners stay crisp). */
  width?: number
  height?: number
  x?: number
  y?: number
  /** Transform origin (number for both axes or `{ x, y }`). */
  pivot?: number | PointData
  tint?: ColorSource
  alpha?: number
  visible?: boolean
  eventMode?: EventMode
  cursor?: string
  /** Opt into flex layout (as a child of a PixiLayout). Omit to position with x/y. */
  layout?: LayoutStyle
  label?: string
  ref?: Ref<NineSliceSprite>
}

/**
 * Reusable Pixi NineSliceSprite for @pixi/react — a scalable frame that stretches its middle
 * while keeping its corners crisp. Use it for resizable buttons, panels, and popup backgrounds
 * from a single small texture. Accepts a Texture or an asset alias string; renders nothing until
 * the texture is available.
 *
 * @example
 * <PixiNineSliceSprite
 *   texture="panel_frame"
 *   leftWidth={24} topHeight={24} rightWidth={24} bottomHeight={24}
 *   width={480} height={320}
 * />
 */
export function PixiNineSliceSprite({ texture, ref, ...props }: PixiNineSliceSpriteProps) {
  const tex = typeof texture === 'string' ? Assets.get<Texture>(texture) : texture
  if (!tex) return null
  return <pixiNineSliceSprite ref={ref} texture={tex} {...props} />
}

export default PixiNineSliceSprite
