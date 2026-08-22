/** Effect-scoped versioned media-node registry. */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { MediaWorkflowNodeType } from '@deepseek-ai/dsh-canvas/types'
import type {
  MediaNodeConfig,
  MediaNodeDefinition,
  MediaNodeDefinitionRef,
  MediaNodeLike,
  MediaNodeRegistryChange,
  MediaNodeRegistryErrorCode,
  MediaNodeRegistrySnapshot,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    mediaNodes: MediaNodeRegistry
  }
}

const DEFAULT_NODE_VERSION = 1
const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9._-]*$/

/** Stable registry rejection. */
export class MediaNodeRegistryError extends Error {
  /**
   * Create a registry failure.
   * @param message - human-readable failure reason.
   * @param code - stable machine-readable registry code.
   */
  constructor(message: string, readonly code: MediaNodeRegistryErrorCode) {
    super(message)
    this.name = 'MediaNodeRegistryError'
  }
}

function keyOf(type: MediaWorkflowNodeType, version: number): string {
  return `${type}@${version}`
}

function assertPortNames(definition: MediaNodeDefinition, direction: 'inputs' | 'outputs'): void {
  const seen = new Set<string>()
  for (const port of definition[direction]) {
    if (!NAME_PATTERN.test(port.name)) {
      throw new MediaNodeRegistryError(`${keyOf(definition.type, definition.version)} ${direction} port ${JSON.stringify(port.name)} has an invalid name`, 'MEDIA_NODE_INVALID_DEFINITION')
    }
    if (seen.has(port.name)) {
      throw new MediaNodeRegistryError(`${keyOf(definition.type, definition.version)} has duplicate ${direction} port ${JSON.stringify(port.name)}`, 'MEDIA_NODE_INVALID_DEFINITION')
    }
    seen.add(port.name)
  }
}

/**
 * Validate one definition independently from registry state.
 * @param definition - candidate definition supplied by a node plugin.
 * @throws MediaNodeRegistryError when version, ports, lifecycle, UI metadata, or defaults are invalid.
 */
export function assertMediaNodeDefinition(definition: MediaNodeDefinition): void {
  if (!Number.isSafeInteger(definition.version) || definition.version < 1) {
    throw new MediaNodeRegistryError(`${definition.type} node version must be a positive safe integer`, 'MEDIA_NODE_INVALID_DEFINITION')
  }
  if (definition.displayName.trim() === '') {
    throw new MediaNodeRegistryError(`${keyOf(definition.type, definition.version)} displayName must be non-empty`, 'MEDIA_NODE_INVALID_DEFINITION')
  }
  assertPortNames(definition, 'inputs')
  assertPortNames(definition, 'outputs')
  if (definition.lifecycle.deprecated && definition.lifecycle.creatable) {
    throw new MediaNodeRegistryError(`${keyOf(definition.type, definition.version)} cannot be both deprecated and creatable`, 'MEDIA_NODE_INVALID_DEFINITION')
  }
  const replacement = definition.lifecycle.replacement
  if (replacement !== undefined) {
    if (!Number.isSafeInteger(replacement.version) || replacement.version < 1) {
      throw new MediaNodeRegistryError(`${keyOf(definition.type, definition.version)} replacement version must be a positive safe integer`, 'MEDIA_NODE_INVALID_DEFINITION')
    }
    if (replacement.type === definition.type && replacement.version === definition.version) {
      throw new MediaNodeRegistryError(`${keyOf(definition.type, definition.version)} replacement cannot point to itself`, 'MEDIA_NODE_INVALID_DEFINITION')
    }
  }
  if (definition.ui.category.trim() === '' || definition.ui.icon.trim() === '' || definition.ui.inspectorKind.trim() === '') {
    throw new MediaNodeRegistryError(`${keyOf(definition.type, definition.version)} UI metadata must use non-empty stable identifiers`, 'MEDIA_NODE_INVALID_DEFINITION')
  }
  try {
    definition.configSchema.parse(structuredClone(definition.defaultConfig))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new MediaNodeRegistryError(`${keyOf(definition.type, definition.version)} default config violates its schema: ${message}`, 'MEDIA_NODE_INVALID_DEFINITION')
  }
}

/** Registry state shared by Validator, Editor adapters, Agent summaries, and Executor. */
export class MediaNodeRegistry extends Service {
  private readonly definitions = new Map<string, MediaNodeDefinition>()
  private readonly listeners = new Set<(change: MediaNodeRegistryChange) => void>()
  private revision = 0

  /**
   * Create the process-local definition registry.
   * @param ctx - owning Cordis context.
   */
  constructor(ctx: Context) {
    super(ctx, 'mediaNodes')
  }

  /**
   * Register one versioned definition on the caller plugin's effect lifetime.
   * @param definition - immutable semantic metadata supplied by a node plugin.
   * @returns idempotent disposer for the registration.
   * @throws MediaNodeRegistryError for invalid or duplicate definitions.
   */
  register(definition: MediaNodeDefinition): () => void {
    assertMediaNodeDefinition(definition)
    const key = keyOf(definition.type, definition.version)
    const disposeEffect = this.ctx.effect(() => {
      if (this.definitions.has(key)) {
        throw new MediaNodeRegistryError(`media node definition ${key} is already registered`, 'MEDIA_NODE_DUPLICATE_DEFINITION')
      }
      const stable = stableDefinition(definition)
      this.definitions.set(key, stable)
      this.revision += 1
      this.emit({ kind: 'registered', revision: this.revision, definition: stable })
      return () => {
        if (this.definitions.get(key) !== stable) return
        this.definitions.delete(key)
        this.revision += 1
        this.emit({ kind: 'unregistered', revision: this.revision, definition: stable })
      }
    }, `mediaNodes.register(${JSON.stringify(key)})`)
    return () => { void disposeEffect() }
  }

  /**
   * Resolve one exact definition; an omitted version addresses V1.
   * @param type - semantic node kind.
   * @param version - positive node definition version.
   * @returns active definition or `undefined` when absent.
   */
  get(type: MediaWorkflowNodeType, version = DEFAULT_NODE_VERSION): MediaNodeDefinition | undefined {
    return this.definitions.get(keyOf(type, version))
  }

  /**
   * Resolve one required definition.
   * @param ref - exact type/version reference.
   * @returns active definition.
   * @throws MediaNodeRegistryError when the definition is unknown.
   */
  require(ref: MediaNodeDefinitionRef): MediaNodeDefinition {
    const definition = this.get(ref.type, ref.version)
    if (definition !== undefined) return definition
    throw new MediaNodeRegistryError(`media node definition ${keyOf(ref.type, ref.version)} is not registered`, 'MEDIA_NODE_UNKNOWN_DEFINITION')
  }

  /**
   * Resolve the exact definition referenced by one semantic workflow node.
   * @param node - semantic node-like value.
   * @returns active definition or `undefined` when absent.
   */
  resolveNode(node: MediaNodeLike): MediaNodeDefinition | undefined {
    return this.get(node.type, node.nodeVersion ?? DEFAULT_NODE_VERSION)
  }

  /**
   * Return a stable ordered snapshot of all active definitions.
   * @returns definitions ordered by type then version.
   */
  list(): readonly MediaNodeDefinition[] {
    return [...this.definitions.values()].sort((left, right) => left.type.localeCompare(right.type) || left.version - right.version)
  }

  /**
   * Return the current mutation revision and definitions from one synchronous registry read.
   * @returns immutable snapshot whose revision changes after every successful register/unregister mutation.
   */
  snapshot(): MediaNodeRegistrySnapshot {
    return Object.freeze({
      revision: this.revision,
      definitions: Object.freeze([...this.list()]),
    })
  }

  /**
   * Parse and normalize one node config through its exact registered schema.
   * @param node - semantic node-like value.
   * @returns parsed JSON-safe config including schema defaults.
   * @throws MediaNodeRegistryError for unknown definitions or invalid config.
   */
  parseConfig(node: MediaNodeLike): MediaNodeConfig {
    const definition = this.resolveNode(node)
    if (definition === undefined) {
      throw new MediaNodeRegistryError(`media node definition ${keyOf(node.type, node.nodeVersion ?? DEFAULT_NODE_VERSION)} is not registered`, 'MEDIA_NODE_UNKNOWN_DEFINITION')
    }
    try {
      return definition.configSchema.parse(structuredClone(node.config))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new MediaNodeRegistryError(`${keyOf(definition.type, definition.version)} config is invalid: ${message}`, 'MEDIA_NODE_INVALID_CONFIG')
    }
  }

  /**
   * Require a definition to be available for new authoring.
   * @param ref - exact definition reference.
   * @returns creatable definition.
   * @throws MediaNodeRegistryError when unknown or non-creatable.
   */
  assertCreatable(ref: MediaNodeDefinitionRef): MediaNodeDefinition {
    const definition = this.require(ref)
    if (definition.lifecycle.creatable) return definition
    throw new MediaNodeRegistryError(`media node definition ${keyOf(ref.type, ref.version)} is not creatable`, 'MEDIA_NODE_NOT_CREATABLE')
  }

  /**
   * Require a node's intrinsic lifecycle to permit execution.
   * @param node - semantic node-like value.
   * @returns executable definition.
   * @throws MediaNodeRegistryError when unknown or intrinsically non-executable.
   */
  assertExecutable(node: MediaNodeLike): MediaNodeDefinition {
    const definition = this.resolveNode(node)
    if (definition === undefined) {
      throw new MediaNodeRegistryError(`media node definition ${keyOf(node.type, node.nodeVersion ?? DEFAULT_NODE_VERSION)} is not registered`, 'MEDIA_NODE_UNKNOWN_DEFINITION')
    }
    if (!definition.lifecycle.executable) {
      throw new MediaNodeRegistryError(`media node definition ${keyOf(definition.type, definition.version)} is not executable`, 'MEDIA_NODE_NOT_EXECUTABLE')
    }
    return definition
  }

  /**
   * Subscribe on the caller plugin's effect lifetime.
   * @param listener - synchronous registration/unregistration observer.
   * @returns idempotent disposer.
   */
  onChange(listener: (change: MediaNodeRegistryChange) => void): () => void {
    const disposeEffect = this.ctx.effect(() => {
      this.listeners.add(listener)
      return () => { this.listeners.delete(listener) }
    }, 'mediaNodes.onChange()')
    return () => { void disposeEffect() }
  }

  private emit(change: MediaNodeRegistryChange): void {
    for (const listener of this.listeners) listener(change)
  }
}

function stableDefinition(definition: MediaNodeDefinition): MediaNodeDefinition {
  return Object.freeze({
    ...definition,
    inputs: Object.freeze(definition.inputs.map(port => Object.freeze({ ...port }))),
    outputs: Object.freeze(definition.outputs.map(port => Object.freeze({ ...port }))),
    defaultConfig: Object.freeze(structuredClone(definition.defaultConfig)),
    execution: Object.freeze({ ...definition.execution }),
    lifecycle: Object.freeze({
      ...definition.lifecycle,
      ...(definition.lifecycle.replacement === undefined ? {} : { replacement: Object.freeze({ ...definition.lifecycle.replacement }) }),
    }),
    ui: Object.freeze({ ...definition.ui }),
    configSchema: definition.configSchema,
  })
}

export default MediaNodeRegistry
