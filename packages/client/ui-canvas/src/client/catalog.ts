/** Pure Browser helpers over the Host-projected media-node catalog. */

import type {
  CanvasCapabilities,
  CanvasFeatureName,
  CanvasNodeCatalogEntry,
  MediaWorkflowNode,
} from '@deepseek-ai/dsh-canvas/client'

/** Exact-definition availability for one durable workflow node under current deployment capabilities. */
export type CanvasNodeCatalogAvailability =
  | { readonly available: true; readonly definition: CanvasNodeCatalogEntry }
  | { readonly available: false; readonly reason: 'definition-missing' }
  | { readonly available: false; readonly reason: 'feature-disabled'; readonly definition: CanvasNodeCatalogEntry; readonly feature: CanvasFeatureName }

/**
 * Resolve the exact `(type, nodeVersion ?? 1)` definition for a durable workflow node.
 *
 * @param catalog Host-projected media-node catalog entries.
 * @param node Durable workflow-node identity to resolve.
 * @returns The exact matching catalog entry, or `undefined` when that definition is not installed.
 */
export function definitionForNode(
  catalog: readonly CanvasNodeCatalogEntry[],
  node: Pick<MediaWorkflowNode, 'type' | 'nodeVersion'>,
): CanvasNodeCatalogEntry | undefined {
  const version = node.nodeVersion ?? 1
  return catalog.find(definition => definition.type === node.type && definition.version === version)
}

/**
 * Resolve whether the exact installed definition is usable under current deployment capabilities.
 *
 * @param catalog Host-projected media-node catalog entries.
 * @param capabilities Current Canvas deployment feature capabilities.
 * @param node Durable workflow-node identity to evaluate.
 * @returns Exact-definition availability and, when unavailable, the authoritative reason.
 */
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

/**
 * Determine whether a catalog entry may be authored in the current deployment.
 *
 * @param definition Catalog definition offered for new-node authoring.
 * @param capabilities Current Canvas deployment feature capabilities.
 * @returns `true` only when the definition is creatable, non-deprecated, and feature-enabled.
 */
export function catalogEntryCreatable(
  definition: CanvasNodeCatalogEntry,
  capabilities: CanvasCapabilities,
): boolean {
  if (!definition.lifecycle.creatable || definition.lifecycle.deprecated) return false
  return definition.feature === undefined || capabilities[definition.feature].enabled
}
