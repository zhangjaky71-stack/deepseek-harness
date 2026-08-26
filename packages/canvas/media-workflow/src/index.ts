/**
 * Versioned media-workflow node-definition registry.
 * Validator, Editor adapters, Agent summaries, and Executor consume this one metadata source.
 *
 * @module @deepseek-ai/dsh-media-workflow
 */

export type * from './types.ts'
export {
  MediaNodeRegistry,
  MediaNodeRegistryError,
  assertMediaNodeDefinition,
} from './registry.ts'
export { default } from './registry.ts'
