/** Package-owned media Provider/model catalog invariant registration. @module @deepseek-ai/dsh-media-provider/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-media-provider'

/** Cordis companion plugin name. */
export const name = 'media-provider-invariant'
/** Invariant registry must exist before installation. */
export const inject = ['invariants']

// No runtime invariant: N13 owns one process-local catalog and validates every
// descriptor, Provider/model ownership, duplicate identity, and registration
// mutation at its commit point. It has no independent mutable/event authority
// to compare against until N14 introduces Provider runtime registrations.
const install: InvariantInstaller = () => {}

/** Register the package's intentionally empty N13 invariant contribution. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
