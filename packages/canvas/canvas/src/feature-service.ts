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

  /** Immutable effective deployment capability snapshot sampled at activation. */
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

  /**
   * Test whether one deployment feature is enabled in the activation snapshot.
   * @param feature - deployment feature to inspect.
   * @returns whether the feature is enabled for this activation.
   */
  isEnabled(feature: CanvasFeatureName): boolean { return canvasFeatureEnabled(this.capabilities, feature) }

  /**
   * Require one deployment feature to be enabled.
   * @param feature - deployment feature to require.
   */
  assertEnabled(feature: CanvasFeatureName): void { assertCanvasFeatureEnabled(this.capabilities, feature) }

  /**
   * Require the deployment capabilities needed to author a workflow.
   * @param workflow - workflow whose authoring requirements are checked.
   */
  assertWorkflowCreatable(workflow: MediaWorkflow): void { assertCanvasWorkflowCreatable(this.capabilities, workflow) }

  /**
   * Require the deployment capabilities needed by one workflow edit.
   * @param workflow - workflow being edited.
   * @param operations - requested atomic edit operations.
   */
  assertWorkflowEditable(workflow: MediaWorkflow, operations: readonly WorkflowEditOperation[]): void {
    assertCanvasWorkflowEditable(this.capabilities, workflow, operations)
  }

  /**
   * Require the deployment capabilities needed to execute a workflow.
   * @param workflow - workflow whose execution requirements are checked.
   */
  assertWorkflowExecutable(workflow: MediaWorkflow): void { assertCanvasWorkflowExecutable(this.capabilities, workflow) }

  /**
   * Return Browser-readable effective deployment capabilities without raw settings layers.
   * @returns cloned capability snapshot for the current Host activation.
   */
  @Remote('get')
  remoteExportGet(): CanvasCapabilities { return structuredClone(this.capabilities) }

  /**
   * Return one client-safe installed-node catalog tied to the exact Host registry mutation revision.
   * @returns atomic Host registry revision and data-only node catalog entries.
   */
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