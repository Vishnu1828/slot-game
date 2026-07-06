import type { ReactNode, Ref } from 'react'
import { extend } from '@pixi/react'
import '@pixi/layout' // enables the optional `layout` prop even if PixiLayout isn't imported
import { Container, type EventMode, type PointData } from 'pixi.js'
import type { LayoutStyle } from './PixiLayout'

// Register <pixiContainer> as a JSX element (idempotent).
extend({ Container })

export interface PixiContainerProps {
  children?: ReactNode
  x?: number
  y?: number
  /** Uniform scale (number) or per-axis `{ x, y }`. */
  scale?: number | PointData
  rotation?: number
  angle?: number
  /** Transform origin (number for both axes or `{ x, y }`). */
  pivot?: number | PointData
  alpha?: number
  visible?: boolean
  eventMode?: EventMode
  cursor?: string
  zIndex?: number
  /** Sort children by zIndex (needed for zIndex to take effect). */
  sortableChildren?: boolean
  /** Opt into flex layout (as a child of a PixiLayout, or as a layout root). Omit for a plain
   *  transform/grouping container positioned by x/y. */
  layout?: LayoutStyle
  label?: string
  ref?: Ref<Container>
}

/**
 * Reusable plain Pixi Container for @pixi/react — a transform/grouping node you position yourself
 * with `x`/`y` (or that a parent PixiLayout positions if you pass `layout`). Lighter than
 * PixiLayout: use this when you don't need flexbox, PixiLayout when you want children arranged.
 *
 * @example
 * <PixiContainer x={100} y={80} scale={0.5}>
 *   <PixiSprite texture="symbol_seven" />
 * </PixiContainer>
 */
export function PixiContainer({ children, ref, ...props }: PixiContainerProps) {
  return (
    <pixiContainer ref={ref} {...props}>
      {children}
    </pixiContainer>
  )
}

export default PixiContainer
