/** Package-owned media Provider catalog/runtime invariant registration. @module @deepseek-ai/dsh-media-provider/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import type {} from './model-registry.ts'
import type {} from './provider-runtime.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-media-provider'

/** Cordis companion plugin name. */
export const name = 'media-provider-invariant'
/** Invariant registry and both N13/N14 Provider authorities must exist before installation. */
export const inject = ['invariants', 'mediaModels', 'mediaProviders']

function validateRuntimeCatalogRelation(ctx: Context, fail: InvariantFailure): void {
  for (const providerId of ctx.mediaProviders.list()) {
    if (ctx.mediaModels.getProvider(providerId) !== undefined) continue
    fail(`runtime Provider ${providerId} has no matching N13 catalog descriptor`)
  }
}

const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  // Runtime registration itself also requires the catalog descriptor. This
  // startup check independently proves reconstructed composition state obeys
  // the same cross-authority relationship if internals/change ordering evolve.
  validateRuntimeCatalogRelation(ctx, fail)
}, { inject: ['mediaModels', 'mediaProviders'] })

/** Register the N14 runtime/catalog cross-authority check. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
