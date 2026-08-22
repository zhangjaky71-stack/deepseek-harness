/** Package-owned invariant companion for pure Canvas run admission. @module @deepseek-ai/dsh-canvas-run-admission/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-canvas-run-admission'

/** Cordis companion plugin name. */
export const name = 'canvas-run-admission-invariant'
/** Only the invariant registry is required because N15 publishes no process-global service. */
export const inject = ['invariants']

// No runtime invariant: N15 is a pure coordinator plus caller-owned in-memory
// concurrency limiter. It publishes no independent durable/event authority to
// compare; N16 will own the durable run/admission relation at its commit point.
const install: InvariantInstaller = () => {}

/** Register the package-owned invariant contribution. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
