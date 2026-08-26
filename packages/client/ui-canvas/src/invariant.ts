/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-canvas`.
 * @module @deepseek-ai/dsh-client-ui-canvas/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-canvas'

/** Cordis companion plugin name. */
export const name = 'client-ui-canvas-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this is a pure projection consumer with browser-local
 * mode state. Durable Canvas/layout invariants remain owned by `dsh-canvas`.
 */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
