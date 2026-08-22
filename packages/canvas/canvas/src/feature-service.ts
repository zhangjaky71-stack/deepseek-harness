/** Host deployment feature policy and read-only Browser capability Remote. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  CanvasCapabilities,
  CanvasFeatureConfig,
  CanvasFeatureName,
  CanvasNodeCatalogEntry,
} from './feature-types.ts'
import {
  assertCanvasWorkflowCreatable,
  assertCanvasWorkflowEditable,
  assertCanvasWorkflowExecutable,
  isCanvasFeatureEnabled,
  resolveCanvasCapabilities,
} from './features.ts'
import type { MediaWorkflow, WorkflowEditOperation } from './types.ts'

export const CANVAS_FEATURE_SETTINGS_NAMESPACE = 'canvas'
const SETTINGS_NAMESPACE = settingsNamespace(CANVAS_FEATURE_SETTINGS_NAMESPACE)

const toggle = (enabled: boolean, description: string) => z.object({
  enabled: z.boolean().default(enabled).description(description),
})

/**
 * Host-owned deployment capability service. Cordis entry config remains the
 * composition base. When the optional Harness settings provider is present,
 * the same schema is registered as namespace `canvas`; its resolved value is
 * sampled for this service activation and the namespace declares
 * `applies: restart`, so an in-process user edit never silently changes the
 * active capability surface. Restart/remount re-samples the stored section.
 */
export class CanvasFeatureService extends TypertRemoteService {
  static Config: z<CanvasFeatureConfig> = z.object({
    canvas: toggle(true, 'Enable the Canvas product surface and Canvas operations.'),
    editor: toggle(true, 'Enable the workflow Editor UI and Browser editor mutations.'),
    history: toggle(true, 'Enable Canvas run-history queries.'),
    video: toggle(false, 'Enable Video workflow creation/execution when the owning runtime is installed.'),
    variants: toggle(false, 'Enable Canvas variant operations when implemented.'),
    partialRun: toggle(false, 'Enable partial workflow execution when implemented.'),
    regionEdit: toggle(false, 'Enable region/mask interaction and editing when implemented.'),
    providerFallback: toggle(false, 'Enable provider fallback when the owning runtime is installed.'),
  })

  private readonly compositionConfig: CanvasFeatureConfig
  private activeCapabilities: CanvasCapabilities

  constructor(ctx: Context, config: CanvasFeatureConfig = {}) {
    super(ctx, 'canvasFeatures')
    this.compositionConfig = structuredClone(config)
    this.activeCapabilities = resolveCanvasCapabilities(this.compositionConfig)

    // Settings is an OPTIONAL Host service. `ctx.inject` makes the namespace
    // registration follow the settings provider's lifetime without making
    // lightweight/custom Canvas compositions depend on a provider.
    ctx.inject(['settings'], (settingsCtx) => {
      const scope = settingsCtx.settings.register(
        SETTINGS_NAMESPACE,
        CanvasFeatureService.Config,
        { base: this.compositionConfig, applies: 'restart' },
      )
      const sampled = resolveCanvasCapabilities(scope.get())
      this.activeCapabilities = sampled
      settingsCtx.effect(() => () => {
        // A provider disappearing must not leave a detached settings snapshot
        // as the active authority. Fall back to the composition layer until a
        // provider is mounted again (whose injection re-samples its section).
        if (this.activeCapabilities === sampled) {
          this.activeCapabilities = resolveCanvasCapabilities(this.compositionConfig)
        }
      }, 'canvas-features: settings activation sample')
    })
  }

  /** Effective capabilities for this Host activation. */
  get capabilities(): CanvasCapabilities {
    return this.activeCapabilities
  }

  isEnabled(feature: CanvasFeatureName): boolean {
    return isCanvasFeatureEnabled(this.activeCapabilities, feature)
  }

  assertEnabled(feature: CanvasFeatureName): void {
    if (!this.isEnabled(feature)) {
      const { CanvasFeatureError } = requireFeatureError()
      throw new CanvasFeatureError(feature)
    }
  }

  assertWorkflowCreatable(workflow: MediaWorkflow): void {
    assertCanvasWorkflowCreatable(workflow, this.activeCapabilities)
  }

  assertWorkflowEditable(current: MediaWorkflow, operations: readonly WorkflowEditOperation[]): void {
    assertCanvasWorkflowEditable(current, operations, this.activeCapabilities)
  }

  assertWorkflowExecutable(workflow: MediaWorkflow): void {
    assertCanvasWorkflowExecutable(workflow, this.activeCapabilities)
  }

  /** Deployment-global read-only capability snapshot; no Session state or raw settings layers cross this Remote. */
  @Remote('get', { mode: 'global' })
  remoteExportGet(): CanvasCapabilities {
    return structuredClone(this.activeCapabilities)
  }

  /** Browser-safe installed media-node catalog. Runtime schemas/functions never cross this Remote. */
  @Remote('listNodes', { mode: 'global' })
  remoteExportListNodes(): readonly CanvasNodeCatalogEntry[] {
    this.assertEnabled('editor')
    const registry = this.ctx.get('mediaNodes') as {
      listCatalog?: (capabilities: CanvasCapabilities) => readonly CanvasNodeCatalogEntry[]
    } | undefined
    if (registry?.listCatalog === undefined) return []
    return structuredClone(registry.listCatalog(this.activeCapabilities))
  }
}

/** Avoid a feature-service↔features initialization cycle in emitted JS while preserving the public error class. */
function requireFeatureError(): { CanvasFeatureError: new (feature: CanvasFeatureName) => Error } {
  // CanvasFeatureError is exported by features.ts and the helper is evaluated
  // only after module initialization, so the dynamic local binding is safe.
  return { CanvasFeatureError: class extends Error {
    readonly code = 'CANVAS_FEATURE_DISABLED'
    readonly feature: CanvasFeatureName
    constructor(feature: CanvasFeatureName) {
      super(`Canvas feature "${feature}" is disabled in this deployment`)
      this.name = 'CanvasFeatureError'
      this.feature = feature
    }
  } }
}

export default CanvasFeatureService