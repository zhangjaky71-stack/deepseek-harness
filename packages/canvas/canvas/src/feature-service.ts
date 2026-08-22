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
  CanvasNodeCatalogSnapshot,
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
interface MediaNodeCatalogSource {
  snapshot(): {
    readonly revision: number
    readonly definitions: readonly CatalogDefinition[]
  }
}

/**
 * Deployment feature policy shared by Canvas Host operations and Browser
 * capability discovery. The settings service is an activation dependency so
 * a Host never publishes a base-only capability snapshot and then mutates it
 * when settings arrives later. The same Schemastery Config supplies schema
 * defaults and validates both the Cordis composition base and the durable
 * `canvas` user section.
 *
 * The namespace is `applies: restart`: this service samples the resolved value
 * exactly once at activation. Later document edits are durable but do not
 * rewrite the current capability surface. Restarting/remounting the service
 * re-resolves the stored user layer over the composition base.
 */
export class CanvasFeatureService extends TypertRemoteService {
  static inject = ['settings']

  static Config: z<CanvasFeatureConfig> = z.object({
    canvas: toggle(true), editor: toggle(true), history: toggle(true), video: toggle(false),
    variants: toggle(false), partialRun: toggle(false), regionEdit: toggle(false), providerFallback: toggle(false),
  })

  readonly capabilities: CanvasCapabilities

  constructor(ctx: Context, config: CanvasFeatureConfig = {}) {
    super(ctx, 'canvasFeatures')
    const scope = ctx.settings.register(
      SETTINGS_NAMESPACE,
      CanvasFeatureService.Config,
      { base: structuredClone(config), applies: 'restart' },
    )
    this.capabilities = resolveCanvasCapabilities(scope.get())
  }

  isEnabled(feature: CanvasFeatureName): boolean { return canvasFeatureEnabled(this.capabilities, feature) }
  assertEnabled(feature: CanvasFeatureName): void { assertCanvasFeatureEnabled(this.capabilities, feature) }
  assertWorkflowCreatable(workflow: MediaWorkflow): void { assertCanvasWorkflowCreatable(this.capabilities, workflow) }
  assertWorkflowEditable(workflow: MediaWorkflow, operations: readonly WorkflowEditOperation[]): void {
    assertCanvasWorkflowEditable(this.capabilities, workflow, operations)
  }
  assertWorkflowExecutable(workflow: MediaWorkflow): void { assertCanvasWorkflowExecutable(this.capabilities, workflow) }

  /** Browser-readable effective deployment capabilities; raw settings layers never cross this Remote. */
  @Remote('get')
  remoteExportGet(): CanvasCapabilities { return structuredClone(this.capabilities) }

  /** Return one client-safe installed-node catalog tied to the exact Host registry mutation revision. */
  @Remote('listNodes')
  remoteExportListNodes(): CanvasNodeCatalogSnapshot {
    this.assertEnabled('editor')
    const source = this.ctx.get('mediaNodes') as MediaNodeCatalogSource | undefined
    if (source === undefined) throw new Error('canvasFeatures.listNodes: mediaNodes service is required while Canvas Editor is enabled')
    const catalog = source.snapshot()
    return {
      revision: catalog.revision,
      entries: catalog.definitions.map(definition => ({
        type: definition.type,
        version: definition.version,
        displayName: definition.displayName,
        inputs: structuredClone(definition.inputs),
        outputs: structuredClone(definition.outputs),
        defaultConfig: structuredClone(definition.defaultConfig),
        ...(definition.execution.feature === undefined ? {} : { feature: definition.execution.feature }),
        lifecycle: structuredClone(definition.lifecycle),
        ui: structuredClone(definition.ui),
      })),
    }
  }
}

export default CanvasFeatureService