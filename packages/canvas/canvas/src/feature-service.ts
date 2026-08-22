/** Host Canvas feature configuration and read-only capability/node-catalog Remote (`canvasFeatures`). */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  assertCanvasFeatureEnabled,
  assertCanvasWorkflowCreatable,
  assertCanvasWorkflowEditable,
  assertCanvasWorkflowExecutable,
  canvasFeatureEnabled,
  resolveCanvasCapabilities,
} from './features.ts'
import type {
  CanvasCapabilities,
  CanvasFeatureConfig,
  CanvasFeatureName,
  CanvasNodeCatalogEntry,
} from './feature-types.ts'
import type { MediaWorkflow, WorkflowEditOperation } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context { canvasFeatures: CanvasFeatureService }
}

/** Harness settings namespace owned by the Canvas deployment feature policy. */
export const CANVAS_FEATURE_SETTINGS_NAMESPACE = 'canvas'
const SETTINGS_NAMESPACE = settingsNamespace(CANVAS_FEATURE_SETTINGS_NAMESPACE)
const toggle = (enabled: boolean) => z.object({ enabled: z.boolean().default(enabled) })

type CatalogDefinition = {
  readonly type: CanvasNodeCatalogEntry['type']
  readonly version: number
  readonly displayName: string
  readonly inputs: CanvasNodeCatalogEntry['inputs']
  readonly outputs: CanvasNodeCatalogEntry['outputs']
  readonly defaultConfig: CanvasNodeCatalogEntry['defaultConfig']
  readonly execution: { readonly feature?: CanvasFeatureName }
  readonly lifecycle: CanvasNodeCatalogEntry['lifecycle']
  readonly ui: CanvasNodeCatalogEntry['ui']
}
interface MediaNodeCatalogSource { list(): readonly CatalogDefinition[] }

/**
 * Deployment feature policy shared by Canvas Host operations and Browser
 * capability discovery. Cordis entry config remains the composition base. If
 * the optional Harness settings provider is mounted, this owner registers the
 * same schema as namespace `canvas` and samples the resolved user section for
 * this service activation. The namespace declares `applies: restart`: later
 * in-process document edits are persisted for the next activation and do not
 * silently rewrite the already-published capability surface.
 */
export class CanvasFeatureService extends TypertRemoteService {
  static Config: z<CanvasFeatureConfig> = z.object({
    canvas: toggle(true), editor: toggle(true), history: toggle(true), video: toggle(false),
    variants: toggle(false), partialRun: toggle(false), regionEdit: toggle(false), providerFallback: toggle(false),
  })

  private readonly compositionConfig: CanvasFeatureConfig
  private activeCapabilities: CanvasCapabilities

  constructor(ctx: Context, config: CanvasFeatureConfig = {}) {
    super(ctx, 'canvasFeatures')
    this.compositionConfig = structuredClone(config)
    this.activeCapabilities = resolveCanvasCapabilities(this.compositionConfig)

    // Settings is deliberately optional. This mirrors other feature owners:
    // lightweight/custom compositions keep working from entry config alone,
    // while the standard Host settings provider supplies the user layer.
    ctx.inject(['settings'], (settingsCtx) => {
      const scope = settingsCtx.settings.register(
        SETTINGS_NAMESPACE,
        CanvasFeatureService.Config,
        { base: this.compositionConfig, applies: 'restart' },
      )
      const sampled = resolveCanvasCapabilities(scope.get())
      this.activeCapabilities = sampled
      settingsCtx.effect(() => () => {
        // If the settings provider disappears, do not retain a detached user
        // document as current deployment authority. A later provider mount is
        // injected again and re-samples its own registered namespace.
        if (this.activeCapabilities === sampled) {
          this.activeCapabilities = resolveCanvasCapabilities(this.compositionConfig)
        }
      }, 'canvas-features: settings activation sample')
    })
  }

  /** Effective deployment capability snapshot for this Host activation. */
  get capabilities(): CanvasCapabilities { return this.activeCapabilities }

  isEnabled(feature: CanvasFeatureName): boolean { return canvasFeatureEnabled(this.activeCapabilities, feature) }
  assertEnabled(feature: CanvasFeatureName): void { assertCanvasFeatureEnabled(this.activeCapabilities, feature) }
  assertWorkflowCreatable(workflow: MediaWorkflow): void { assertCanvasWorkflowCreatable(this.activeCapabilities, workflow) }
  assertWorkflowEditable(workflow: MediaWorkflow, operations: readonly WorkflowEditOperation[]): void {
    assertCanvasWorkflowEditable(this.activeCapabilities, workflow, operations)
  }
  assertWorkflowExecutable(workflow: MediaWorkflow): void { assertCanvasWorkflowExecutable(this.activeCapabilities, workflow) }

  /** Browser-readable effective deployment capabilities; raw settings layers never cross this Remote. */
  @Remote('get')
  remoteExportGet(): CanvasCapabilities { return structuredClone(this.activeCapabilities) }

  /** Return installed node metadata from the Host registry as a data-only DTO. */
  @Remote('listNodes')
  remoteExportListNodes(): readonly CanvasNodeCatalogEntry[] {
    this.assertEnabled('editor')
    const source = this.ctx.get('mediaNodes') as MediaNodeCatalogSource | undefined
    if (source === undefined) throw new Error('canvasFeatures.listNodes: mediaNodes service is required while Canvas Editor is enabled')
    return source.list().map(definition => ({
      type: definition.type,
      version: definition.version,
      displayName: definition.displayName,
      inputs: structuredClone(definition.inputs),
      outputs: structuredClone(definition.outputs),
      defaultConfig: structuredClone(definition.defaultConfig),
      ...(definition.execution.feature === undefined ? {} : { feature: definition.execution.feature }),
      lifecycle: structuredClone(definition.lifecycle),
      ui: structuredClone(definition.ui),
    }))
  }
}

export default CanvasFeatureService