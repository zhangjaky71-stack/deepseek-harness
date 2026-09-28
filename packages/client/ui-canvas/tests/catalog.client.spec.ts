/** N11 Browser-safe node-catalog resolution and feature admission. */

import { describe, expect, it } from 'vitest'
import type { CanvasCapabilities, CanvasNodeCatalogEntry, MediaWorkflowNode } from '@deepseek-ai/dsh-canvas/client'
import { catalogEntryCreatable, definitionForNode, nodeCatalogAvailability } from '../src/client/catalog.ts'

function capabilities(video = false): CanvasCapabilities {
  return {
    canvas: { enabled: true },
    editor: { enabled: true },
    history: { enabled: true },
    video: { enabled: video },
    variants: { enabled: false },
    partialRun: { enabled: false },
    regionEdit: { enabled: false },
    providerFallback: { enabled: false },
  }
}

function definition(version: number, overrides: Partial<CanvasNodeCatalogEntry> = {}): CanvasNodeCatalogEntry {
  return {
    type: 'plugin.render',
    version,
    displayName: `Plugin render v${version}`,
    inputs: [{ name: `in-v${version}`, type: 'image', required: true }],
    outputs: [{ name: `out-v${version}`, type: 'image', required: true }],
    defaultConfig: {},
    lifecycle: { deprecated: false, creatable: true, executable: true },
    ui: { category: 'Plugin', icon: 'plugin', inspectorKind: 'json' },
    ...overrides,
  }
}

function node(version?: number): Pick<MediaWorkflowNode, 'type' | 'nodeVersion'> {
  return { type: 'plugin.render', ...(version === undefined ? {} : { nodeVersion: version }) }
}

describe('Canvas editor catalog resolution', () => {
  it('resolves the exact type/version instead of the newest or last same-type entry', () => {
    const catalog = [definition(1), definition(2)]
    expect(definitionForNode(catalog, node(1))?.version).toBe(1)
    expect(definitionForNode(catalog, node(2))?.version).toBe(2)
  })

  it('treats an omitted durable nodeVersion as v1 only', () => {
    const catalog = [definition(2), definition(1)]
    expect(definitionForNode(catalog, node())?.version).toBe(1)
  })

  it('does not silently fall forward when the exact historical definition is absent', () => {
    const availability = nodeCatalogAvailability([definition(2)], capabilities(), node(1))
    expect(availability).toEqual({ available: false, reason: 'definition-missing' })
  })

  it('keeps an installed node readable but unavailable when its deployment feature is disabled', () => {
    const videoDefinition = definition(1, { feature: 'video' })
    expect(nodeCatalogAvailability([videoDefinition], capabilities(false), node(1))).toMatchObject({
      available: false,
      reason: 'feature-disabled',
      feature: 'video',
    })
    expect(nodeCatalogAvailability([videoDefinition], capabilities(true), node(1))).toMatchObject({ available: true })
  })

  it('admits Node Library creation only for current, creatable, non-deprecated feature-enabled entries', () => {
    expect(catalogEntryCreatable(definition(1), capabilities())).toBe(true)
    expect(catalogEntryCreatable(definition(1, { feature: 'video' }), capabilities(false))).toBe(false)
    expect(catalogEntryCreatable(definition(1, { lifecycle: { deprecated: true, creatable: true, executable: true } }), capabilities())).toBe(false)
    expect(catalogEntryCreatable(definition(1, { lifecycle: { deprecated: false, creatable: false, executable: true } }), capabilities())).toBe(false)
  })
})
