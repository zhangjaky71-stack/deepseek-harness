/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-renderer`.
 * @module @deepseek-ai/dsh-client-ui-renderer/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-renderer'

/** Cordis companion plugin name. */
export const name = 'client-ui-renderer-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: React root ownership is browser lifecycle behavior
 * covered by renderer/Web mount, replacement, and disposal regression tests.
 */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
