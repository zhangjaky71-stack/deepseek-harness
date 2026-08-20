/** Package-owned invariant companion for the process-local Canvas interaction bridge. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-canvas-interaction'

/** Cordis companion plugin name. */
export const name = 'canvas-interaction-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * N08 owns no durable Session vocabulary: staged/bound correlation is
 * intentionally process-local and its model-visible result is validated by the
 * ordinary Agent/Session message invariants. The companion therefore reserves
 * package ownership without installing a duplicate durable fold.
 */
const install: InvariantInstaller = Object.assign((_ctx: Context, _fail: InvariantFailure) => {}, {
  inject: [] as string[],
})

/** Register the package invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
