/** Host Canvas feature configuration and read-only capability Remote (`canvasFeatures`). */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  assertCanvasFeatureEnabled,
  assertCanvasWorkflowCreatable,
  assertCanvasWorkflowEditable,
  assertCanvasWorkflowExecutable,
  canvasFeatureEnabled,
  resolveCanvasCapabilities,
} from './features.ts'
import type { CanvasCapabilities, CanvasFeatureConfig, CanvasFeatureName } from './feature-types.ts'
import type { MediaWorkflow, WorkflowEditOperation } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    canvasFeatures: CanvasFeatureService
  }
}

const toggle = (enabled: boolean) => z.object({ enabled: z.boolean().default(enabled) })

/** Deployment feature policy shared by Canvas Host operations and Browser capability discovery. */
export class CanvasFeatureService extends TypertRemoteService {
  static Config: z<CanvasFeatureConfig> = z.object({
    canvas: toggle(true),
    editor: toggle(true),
    history: toggle(true),
    video: toggle(false),
    variants: toggle(false),
    partialRun: toggle(false),
    regionEdit: toggle(false),
    providerFallback: toggle(false),
  })

  /** Immutable effective capabilities; child switches fold through `canvas.enabled`. */
  readonly capabilities: CanvasCapabilities

  /**
   * @param ctx - owning Host Cordis context.
   * @param config - deployment Canvas feature toggles.
   */
  constructor(ctx: Context, config: CanvasFeatureConfig = {}) {
    super(ctx, 'canvasFeatures')
    this.capabilities = resolveCanvasCapabilities(config)
  }

  /**
   * @param feature - capability to inspect.
   * @returns whether the effective capability is enabled.
   */
  isEnabled(feature: CanvasFeatureName): boolean {
    return canvasFeatureEnabled(this.capabilities, feature)
  }

  /**
   * @param feature - capability required by the caller.
   * @throws CanvasFeatureError when disabled.
   */
  assertEnabled(feature: CanvasFeatureName): void {
    assertCanvasFeatureEnabled(this.capabilities, feature)
  }

  /** Reject creation or whole replacement of workflows that require disabled capabilities. */
  assertWorkflowCreatable(workflow: MediaWorkflow): void {
    assertCanvasWorkflowCreatable(this.capabilities, workflow)
  }

  /**
   * Reject edits that use a disabled feature while allowing historical disabled
   * nodes to remain readable and to be removed/disconnected.
   */
  assertWorkflowEditable(workflow: MediaWorkflow, operations: readonly WorkflowEditOperation[]): void {
    assertCanvasWorkflowEditable(this.capabilities, workflow, operations)
  }

  /** Host admission check for future workflow execution. */
  assertWorkflowExecutable(workflow: MediaWorkflow): void {
    assertCanvasWorkflowExecutable(this.capabilities, workflow)
  }

  /** Browser-readable effective deployment capabilities. */
  @Remote('get')
  remoteExportGet(): CanvasCapabilities {
    return structuredClone(this.capabilities)
  }
}

export default CanvasFeatureService
