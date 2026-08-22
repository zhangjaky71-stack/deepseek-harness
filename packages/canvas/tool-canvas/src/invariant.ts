/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-tool-canvas`.
 * @module @deepseek-ai/dsh-tool-canvas/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-tool-canvas'

/** Cordis companion plugin name. */
export const name = 'tool-canvas-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No independent runtime invariant: the command is a durable session event,
 * while browser source/origin checks and Canvas command validation are tested
 * at their owning bridge boundaries.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */