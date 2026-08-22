/** Package-owned media Provider/model catalog invariants. @module @deepseek-ai/dsh-media-provider/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import type { MediaModelDescriptor, MediaProviderDescriptor } from './types.ts'
import { assertMediaProviderDescriptor, normalizeMediaModelDescriptor } from './model-registry.ts'
import type {} from './model-registry.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-media-provider'

/** Cordis companion plugin name. */
export const name = 'media-provider-invariant'
/** Invariant service and media-model Registry must exist before installation. */
export const inject = ['invariants', 'mediaModels']

function validate(
  provider: MediaProviderDescriptor,
  models: readonly MediaModelDescriptor[],
  fail: InvariantFailure,
): void {
  try {
    assertMediaProviderDescriptor(provider)
    for (const model of models) normalizeMediaModelDescriptor(provider, model)
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
}

const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  const snapshot = ctx.mediaModels.snapshot()
  for (const provider of snapshot.providers) {
    validate(provider, snapshot.models.filter(model => model.providerId === provider.id), fail)
  }
  ctx.mediaModels.onChange((change) => {
    if (change.kind === 'registered') validate(change.provider, change.models, fail)
  })
}, { inject: ['mediaModels'] })

/** Register independent Provider/model descriptor checks. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
