import type { ReactNode, Ref } from 'react'
import { extend } from '@pixi/react'
import '@pixi/layout' // runtime: registers the LayoutSystem + adds the `layout` mixin to containers
import '@pixi/layout/react' // types: adds <layoutContainer> & friends to @pixi/react's PixiElements
import { LayoutContainer } from '@pixi/layout/components'
import type { LayoutOptions } from '@pixi/layout'
import type { EventMode } from 'pixi.js'

// Register <layoutContainer> as a JSX element (idempotent — safe to call from every module).
extend({ LayoutContainer })

/**
 * Flexbox-style layout styles (Yoga engine): `flexDirection`, `justifyContent`, `alignItems`,
 * `gap`, `padding`, `width`/`height`, `position`, etc. — PLUS panel styling supported by
 * LayoutContainer: `backgroundColor`, `borderColor`, `borderWidth`, `borderRadius`, `overflow`.
 */
export type LayoutStyle = Omit<LayoutOptions, 'target'>

export interface PixiLayoutProps {
  /** The layout style. Position of children is computed from this — you don't set child x/y. */
  layout: LayoutStyle
  children?: ReactNode
  alpha?: number
  visible?: boolean
  /**
   * Pointer handling. Set to `'static'` for an overlay/panel that should capture clicks (and
   * block input to what's behind it); leave unset for passive layout groups.
   */
  eventMode?: EventMode
  /** Optional debug label (shown in Pixi devtools). */
  label?: string
  ref?: Ref<LayoutContainer>
}

/**
 * Reusable flexbox layout box for @pixi/react, backed by `@pixi/layout`'s LayoutContainer.
 *
 * Use it to position children responsively (flex/grid) instead of manual x/y — the layout
 * re-flows automatically when its size changes (e.g. on resize / orientation change). Give the
 * ROOT a concrete size (usually the screen) and nest boxes freely inside.
 *
 * @example
 * // Full-screen root that centers its content
 * <PixiLayout layout={{ width: screen.w, height: screen.h, justifyContent: 'center', alignItems: 'center' }}>
 *   <PixiBitmapText text="Loading..." font="roulette_title_font_mobile" size={34} />
 * </PixiLayout>
 *
 * @example
 * // A modal/panel: centered card with padding, background and rounded corners
 * <PixiLayout layout={{ width: screen.w, height: screen.h, justifyContent: 'center', alignItems: 'center' }}>
 *   <PixiLayout
 *     eventMode="static"
 *     layout={{ width: 480, padding: 24, gap: 16, flexDirection: 'column', alignItems: 'center',
 *               backgroundColor: 0x1b1b2b, borderRadius: 16 }}
 *   >
 *     ...panel content...
 *   </PixiLayout>
 * </PixiLayout>
 */
export function PixiLayout({
  layout,
  children,
  alpha,
  visible,
  eventMode,
  label,
  ref,
}: PixiLayoutProps) {
  return (
    <layoutContainer
      ref={ref}
      layout={layout}
      alpha={alpha}
      visible={visible}
      eventMode={eventMode}
      label={label}
    >
      {children}
    </layoutContainer>
  )
}

export default PixiLayout
