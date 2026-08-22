/** Pure Browser helpers over the Host-projected media-node catalog. */

import type {
  CanvasCapabilities,
  CanvasFeatureName,
  CanvasNodeCatalogEntry,
  MediaWorkflowNode,
} from '@deepseek-ai/dsh-canvas/client'

export type CanvasNodeCatalogAvailability =
  | { readonly available: true; readonly definition: CanvasNodeCatalogEntry }
  | { readonly available: false; readonly reason: 'definition-missing' }
  | { readonly available: false; readonly reason: 'feature-disabled'; readonly definition: CanvasNodeCatalogEntry; readonly feature: CanvasFeatureName }

/** Resolve the exact `(type, nodeVersion ?? 1)` definition for a durable workflow node. */
export function definitionForNode(
  catalog: readonly CanvasNodeCatalogEntry[],
  node: Pick<MediaWorkflowNode, 'type' | 'nodeVersion'>,
): CanvasNodeCatalogEntry | undefined {
  const version = node.nodeVersion ?? 1
  return catalog.find(definition => definition.type === node.type && definition.version === version)
}

/** Resolve whether the exact installed definition is usable under current deployment capabilities. */
export function nodeCatalogAvailability(
  catalog: readonly CanvasNodeCatalogEntry[],
  capabilities: CanvasCapabilities,
  node: Pick<MediaWorkflowNode, 'type' | 'nodeVersion'>,
): CanvasNodeCatalogAvailability {
  const definition = definitionForNode(catalog, node)
  if (definition === undefined) return { available: false, reason: 'definition-missing' }
  const feature = definition.feature
  if (feature !== undefined && !capabilities[feature].enabled) {
    return { available: false, reason: 'feature-disabled', definition, feature }
  }
  return { available: true, definition }
}

/** Whether a catalog entry may be authored in the current deployment. */
export function catalogEntryCreatable(
  definition: CanvasNodeCatalogEntry,
  capabilities: CanvasCapabilities,
): boolean {
  if (!definition.lifecycle.creatable || definition.lifecycle.deprecated) return false
  return definition.feature === undefined || capabilities[definition.feature].enabled
}
