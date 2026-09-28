/** Mock Provider package invariant registration. @module @deepseek-ai/dsh-media-provider-mock/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-media-provider-mock'

/** Cordis companion plugin name. */
export const name = 'media-provider-mock-invariant'
/** Invariant registry must exist before the companion registers. */
export const inject = ['invariants']

// No runtime invariant: the Mock owns no authority beyond the N13 catalog and
// N14 runtime registrations, whose relationship is checked by media-provider's
// invariant. Scenario queues/tasks are test-local adapter implementation state.
const install: InvariantInstaller = () => {}

/**
 * Register the Mock package's intentionally empty invariant contribution.
 * @param ctx - Cordis context containing the invariant registry.
 * @returns effect-scoped disposer for this package contribution.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
