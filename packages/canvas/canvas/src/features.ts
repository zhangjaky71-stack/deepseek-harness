/** Deployment-resolved Canvas feature policy shared by Host consumers. */

import { HarnessError } from '@deepseek-ai/dsh-llm'
import type {
  CanvasCapabilities,
  CanvasFeatureConfig,
  CanvasFeatureErrorCode,
  CanvasFeatureName,
} from './feature-types.ts'
import type { MediaWorkflow, WorkflowEditOperation } from './types.ts'

const DEFAULTS: Readonly<Record<CanvasFeatureName, boolean>> = Object.freeze({
  canvas: true,
  editor: true,
  history: true,
  video: false,
  variants: false,
  partialRun: false,
  regionEdit: false,
  providerFallback: false,
})

/** Feature-policy rejection with one stable machine-readable error code. */
export class CanvasFeatureError extends HarnessError {
  /** Disabled feature responsible for the rejection. */
  readonly feature: CanvasFeatureName

  /**
   * @param feature - disabled effective feature.
   * @param message - optional operation-specific diagnostic.
   */
  constructor(feature: CanvasFeatureName, message = `Canvas feature "${feature}" is disabled`) {
    super(message, 'CANVAS_FEATURE_DISABLED' satisfies CanvasFeatureErrorCode)
    this.feature = feature
  }
}

/** Resolve raw Cordis config into immutable effective capabilities. */
export function resolveCanvasCapabilities(config: CanvasFeatureConfig = {}): CanvasCapabilities {
  const canvas = config.canvas?.enabled ?? DEFAULTS.canvas
  const child = (name: Exclude<CanvasFeatureName, 'canvas'>): boolean =>
    canvas && (config[name]?.enabled ?? DEFAULTS[name])
  return Object.freeze({
    canvas: Object.freeze({ enabled: canvas }),
    editor: Object.freeze({ enabled: child('editor') }),
    history: Object.freeze({ enabled: child('history') }),
    video: Object.freeze({ enabled: child('video') }),
    variants: Object.freeze({ enabled: child('variants') }),
    partialRun: Object.freeze({ enabled: child('partialRun') }),
    regionEdit: Object.freeze({ enabled: child('regionEdit') }),
    providerFallback: Object.freeze({ enabled: child('providerFallback') }),
  })
}

/** Read one effective capability without exposing raw deployment config. */
export function canvasFeatureEnabled(capabilities: CanvasCapabilities, feature: CanvasFeatureName): boolean {
  return capabilities[feature].enabled
}

/** Require one effective deployment capability. */
export function assertCanvasFeatureEnabled(
  capabilities: CanvasCapabilities,
  feature: CanvasFeatureName,
): void {
  if (!canvasFeatureEnabled(capabilities, feature)) throw new CanvasFeatureError(feature)
}

/** Whether one current semantic node requires the Video capability. */
export function isVideoWorkflowNode(type: MediaWorkflow['nodes'][number]['type']): boolean {
  return type === 'video.generate' || type === 'video.image-to-video'
}

/** Return feature requirements that make a workflow non-executable in this deployment. */
export function unavailableWorkflowFeatures(
  capabilities: CanvasCapabilities,
  workflow: MediaWorkflow,
): readonly CanvasFeatureName[] {
  const unavailable: CanvasFeatureName[] = []
  if (!capabilities.canvas.enabled) unavailable.push('canvas')
  if (!capabilities.video.enabled && workflow.nodes.some(node => isVideoWorkflowNode(node.type))) unavailable.push('video')
  return unavailable
}

/** Require a workflow to be creatable as new semantic state in this deployment. */
export function assertCanvasWorkflowCreatable(
  capabilities: CanvasCapabilities,
  workflow: MediaWorkflow,
): void {
  assertCanvasFeatureEnabled(capabilities, 'canvas')
  const disabled = unavailableWorkflowFeatures(capabilities, workflow).find(feature => feature !== 'canvas')
  if (disabled !== undefined) throw new CanvasFeatureError(disabled)
}

/**
 * Check whether an atomic edit tries to use a disabled Video node while still
 * allowing historical disabled nodes to be removed or disconnected.
 */
export function editUsesDisabledVideo(
  workflow: MediaWorkflow,
  operations: readonly WorkflowEditOperation[],
): boolean {
  const types = new Map(workflow.nodes.map(node => [String(node.id), node.type] as const))
  for (const operation of operations) {
    switch (operation.op) {
      case 'add-node':
        if (isVideoWorkflowNode(operation.node.type)) return true
        types.set(String(operation.node.id), operation.node.type)
        break
      case 'remove-node':
        types.delete(String(operation.nodeId))
        break
      case 'replace-node-config':
        if (isVideoWorkflowNode(types.get(String(operation.nodeId)) ?? 'asset.input')) return true
        break
      case 'connect':
        if (
          isVideoWorkflowNode(types.get(String(operation.edge.sourceNodeId)) ?? 'asset.input')
          || isVideoWorkflowNode(types.get(String(operation.edge.targetNodeId)) ?? 'asset.input')
        ) return true
        break
      case 'set-output-nodes':
        if (operation.nodeIds.some(nodeId => isVideoWorkflowNode(types.get(String(nodeId)) ?? 'asset.input'))) return true
        break
      case 'rename-node':
      case 'disconnect':
      case 'rename-workflow':
        break
      default:
        operation satisfies never
    }
  }
  return false
}

/** Require one atomic edit batch to avoid active use of disabled features. */
export function assertCanvasWorkflowEditable(
  capabilities: CanvasCapabilities,
  workflow: MediaWorkflow,
  operations: readonly WorkflowEditOperation[],
): void {
  assertCanvasFeatureEnabled(capabilities, 'canvas')
  if (!capabilities.video.enabled && editUsesDisabledVideo(workflow, operations)) {
    throw new CanvasFeatureError('video')
  }
}

/** Host admission check for workflow execution. */
export function assertCanvasWorkflowExecutable(
  capabilities: CanvasCapabilities,
  workflow: MediaWorkflow,
): void {
  const disabled = unavailableWorkflowFeatures(capabilities, workflow)[0]
  if (disabled !== undefined) throw new CanvasFeatureError(disabled)
}
