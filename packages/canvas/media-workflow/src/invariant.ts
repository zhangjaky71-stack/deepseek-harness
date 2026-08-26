/** Package-owned media-node registry invariants. @module @deepseek-ai/dsh-media-workflow/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import { assertMediaNodeDefinition } from './registry.ts'
import type { MediaNodeDefinition } from './types.ts'
import type {} from './registry.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-media-workflow'

/** Cordis companion plugin name. */
export const name = 'media-workflow-invariant'
/** The companion only needs the invariant registry; its installer owns the mediaNodes dependency. */
export const inject = ['invariants']

function validate(definition: MediaNodeDefinition, fail: InvariantFailure): void {
  try {
    assertMediaNodeDefinition(definition)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    fail(`media node definition ${definition.type}@${definition.version} violates registry invariants: ${message}`)
  }
}

const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  for (const definition of ctx.mediaNodes.list()) validate(definition, fail)
  ctx.mediaNodes.onChange((change) => {
    if (change.kind === 'registered') validate(change.definition, fail)
  })
}, { inject: ['mediaNodes'] })

/** Register independent media-node definition checks. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
