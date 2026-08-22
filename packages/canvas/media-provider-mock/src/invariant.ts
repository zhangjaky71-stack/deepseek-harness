/** Mock Provider package invariant registration. @module @deepseek-ai/dsh-media-provider-mock/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-media-provider-mock'

export const name = 'media-provider-mock-invariant'
export const inject = ['invariants']

// No runtime invariant: the Mock owns no authority beyond the N13 catalog and
// N14 runtime registrations, whose relationship is checked by media-provider's
// invariant. Scenario queues/tasks are test-local adapter implementation state.
const install: InvariantInstaller = () => {}

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
