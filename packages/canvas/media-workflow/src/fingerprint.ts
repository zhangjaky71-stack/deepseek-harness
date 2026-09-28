/** Stable SHA-256 execution fingerprints for media-workflow nodes. */

import { createHash } from 'node:crypto'
import type { CanvasJsonValue, MediaWorkflowNode } from '@deepseek-ai/dsh-canvas/types'
import type { MediaNodeConfig, MediaNodeDefinition } from './types.ts'
import type {
  MediaNodeExecutionFingerprint,
  MediaNodeExecutionIdentity,
  MediaNodeFingerprintInput,
} from './engine-types.ts'

function canonical(value: CanvasJsonValue): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(item => canonical(item)).join(',')}]`
  const record = value as Readonly<Record<string, CanvasJsonValue>>
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key]!)}`).join(',')}}`
}

/**
 * Compute one deterministic node-execution fingerprint.
 * @param node - immutable run-snapshot node.
 * @param definition - exact definition captured for the run.
 * @param config - config normalized through that definition's schema.
 * @param inputs - upstream/content fingerprints with graph identity; normalized by edge id.
 * @param executionIdentity - optional already-resolved execution identity supplied by a later resolver/caller.
 * @returns SHA-256 fingerprint plus intrinsic automatic-cache eligibility.
 */
export function fingerprintMediaNodeExecution(
  node: MediaWorkflowNode,
  definition: MediaNodeDefinition,
  config: MediaNodeConfig,
  inputs: readonly MediaNodeFingerprintInput[],
  executionIdentity?: MediaNodeExecutionIdentity,
): MediaNodeExecutionFingerprint {
  const normalizedInputs = [...inputs]
    .sort((left, right) => left.edgeId.localeCompare(right.edgeId)
      || left.targetPort.localeCompare(right.targetPort)
      || left.sourceNodeId.localeCompare(right.sourceNodeId)
      || left.sourcePort.localeCompare(right.sourcePort))
    .map(input => ({
      edgeId: input.edgeId,
      sourceNodeId: input.sourceNodeId,
      sourcePort: input.sourcePort,
      targetPort: input.targetPort,
      fingerprint: input.fingerprint,
    }))
  const payload: CanvasJsonValue = {
    type: node.type,
    version: node.nodeVersion ?? definition.version,
    config,
    inputs: normalizedInputs,
    ...(executionIdentity === undefined ? {} : { executionIdentityKey: executionIdentity.key }),
  }
  return Object.freeze({
    algorithm: 'sha256',
    value: createHash('sha256').update(canonical(payload)).digest('hex'),
    cacheable: definition.execution.deterministic,
    nodeType: definition.type,
    nodeVersion: definition.version,
    ...(executionIdentity === undefined ? {} : { executionIdentityKey: executionIdentity.key }),
  })
}