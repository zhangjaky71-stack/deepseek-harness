/** Host Canvas feature configuration and read-only capability/node-catalog Remote (`canvasFeatures`). */

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

/** Deployment feature policy shared by Canvas Host operations and Browser capability discovery. */
export class CanvasFeatureService extends TypertRemoteService {
  static Config: z<CanvasFeatureConfig> = z.object({
    canvas: toggle(true), editor: toggle(true), history: toggle(true), video: toggle(false),
    variants: toggle(false), partialRun: toggle(false), regionEdit: toggle(false), providerFallback: toggle(false),
  })

  readonly capabilities: CanvasCapabilities

  constructor(ctx: Context, config: CanvasFeatureConfig = {}) {
    super(ctx, 'canvasFeatures')
    this.capabilities = resolveCanvasCapabilities(config)
  }

  isEnabled(feature: CanvasFeatureName): boolean { return canvasFeatureEnabled(this.capabilities, feature) }
  assertEnabled(feature: CanvasFeatureName): void { assertCanvasFeatureEnabled(this.capabilities, feature) }
  assertWorkflowCreatable(workflow: MediaWorkflow): void { assertCanvasWorkflowCreatable(this.capabilities, workflow) }
  assertWorkflowEditable(workflow: MediaWorkflow, operations: readonly WorkflowEditOperation[]): void {
    assertCanvasWorkflowEditable(this.capabilities, workflow, operations)
  }
  assertWorkflowExecutable(workflow: MediaWorkflow): void { assertCanvasWorkflowExecutable(this.capabilities, workflow) }

  /** Browser-readable effective deployment capabilities. */
  @Remote('get')
  remoteExportGet(): CanvasCapabilities { return structuredClone(this.capabilities) }

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
