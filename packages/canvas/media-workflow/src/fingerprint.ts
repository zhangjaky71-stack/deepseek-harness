/** Stable SHA-256 execution fingerprints for media-workflow nodes. */

import { createHash } from 'node:crypto'
import type { CanvasJsonValue, MediaWorkflowNode } from '@deepseek-ai/dsh-canvas/types'
import type { MediaNodeConfig, MediaNodeDefinition } from './types.ts'
import type { MediaNodeExecutionFingerprint, MediaNodeFingerprintInput } from './engine-types.ts'

function canonical(value: CanvasJsonValue): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(item => canonical(item)).join(',')}]`
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key]!)}`).join(',')}}`
}

/**
 * Compute a stable node-execution fingerprint from exact node identity, normalized config, resolved model identity, and upstream/asset fingerprints.
 * @param node - immutable run-snapshot node.
 * @param definition - exact definition captured for the run.
 * @param config - config normalized through the definition schema.
 * @param inputs - stable upstream/content hashes; ordering is normalized by port then fingerprint.
 * @param modelKey - optional canonical resolved-model identity supplied by N13 or another caller.
 * @returns SHA-256 fingerprint plus intrinsic automatic-cache eligibility.
 */
export function fingerprintMediaNodeExecution(
  node: MediaWorkflowNode,
  definition: MediaNodeDefinition,
  config: MediaNodeConfig,
  inputs: readonly MediaNodeFingerprintInput[],
  modelKey?: string,
): MediaNodeExecutionFingerprint {
  const normalizedInputs = [...inputs]
    .sort((left, right) => left.port.localeCompare(right.port) || left.fingerprint.localeCompare(right.fingerprint))
    .map(input => ({ port: input.port, fingerprint: input.fingerprint }))
  const payload: CanvasJsonValue = {
    type: node.type,
    version: node.nodeVersion ?? definition.version,
    config,
    inputs: normalizedInputs,
    ...(modelKey === undefined ? {} : { modelKey }),
  }
  return {
    algorithm: 'sha256',
    value: createHash('sha256').update(canonical(payload)).digest('hex'),
    cacheable: definition.execution.deterministic,
    nodeType: definition.type,
    nodeVersion: definition.version,
    ...(modelKey === undefined ? {} : { modelKey }),
  }
}
