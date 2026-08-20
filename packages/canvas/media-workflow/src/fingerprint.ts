/** Stable SHA-256 execution fingerprints for media-workflow nodes. */

import { createHash } from 'node:crypto'
import type { CanvasJsonValue, MediaWorkflowNode } from '@deepseek-ai/dsh-canvas/types'
import type { MediaNodeDefinition } from './types.ts'
import type { MediaNodeExecutionFingerprint, MediaNodeFingerprintInput } from './engine-types.ts'

function canonical(value: CanvasJsonValue): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(item => canonical(item)).join(',')}]`
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key]!)}`).join(',')}}`
}

/**
 * Compute a stable node-execution fingerprint from semantic config and resolved input fingerprints.
 * @param node - semantic node value.
 * @param definition - exact active node definition.
 * @param inputs - resolved upstream/asset fingerprints; ordering is normalized by port then value.
 * @returns SHA-256 fingerprint plus intrinsic cacheability metadata.
 */
export function fingerprintMediaNodeExecution(
  node: MediaWorkflowNode,
  definition: MediaNodeDefinition,
  inputs: readonly MediaNodeFingerprintInput[],
): MediaNodeExecutionFingerprint {
  const normalizedInputs = [...inputs]
    .sort((left, right) => left.port.localeCompare(right.port) || left.fingerprint.localeCompare(right.fingerprint))
    .map(input => ({ port: input.port, fingerprint: input.fingerprint }))
  const payload: CanvasJsonValue = {
    type: node.type,
    version: node.nodeVersion ?? definition.version,
    config: node.config,
    inputs: normalizedInputs,
  }
  return {
    algorithm: 'sha256',
    value: createHash('sha256').update(canonical(payload)).digest('hex'),
    cacheable: definition.execution.deterministic,
    nodeType: definition.type,
    nodeVersion: definition.version,
  }
}
