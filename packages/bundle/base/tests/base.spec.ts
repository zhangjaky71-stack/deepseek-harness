/**
 * The bundle's substance is its patch file: the `dsh.bundle.patch` manifest
 * field must name a real, parseable patch list.
 */

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { evaluate } from '@deepseek-ai/cordis-plugin-loader'

describe('dsh-base bundle', () => {
  it('declares a parseable patch list through the dsh.bundle.patch manifest field', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(
      readFileSync(resolve(root, 'package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>
      dsh?: { bundle?: { patch?: string } }
    }
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    const parsed = yaml.load(
      readFileSync(resolve(root, manifest.dsh!.bundle!.patch!), 'utf8'),
      { schema: entryListSchema },
    )
    expect(Array.isArray(parsed)).toBe(true)
    const patches = parsed as { insert?: { id?: string; name?: string; config?: Record<string, unknown> }[] }[]
    expect(patches).toHaveLength(1)
    const rows = patches.flatMap(patch => patch.insert ?? [])
    expect(rows.length).toBeGreaterThan(50)
    expect(rows.some(row => row.id === 'agent-loop')).toBe(true)

    expect(rows.filter(row => row.id === 'invariants')).toHaveLength(1)
    expect(rows.find(row => row.id === 'invariants')?.name).toBe('@deepseek-ai/dsh-invariants')
    expect(rows.filter(row => row.id === 'canvas-features')).toHaveLength(1)
    expect(rows.find(row => row.id === 'canvas-features')?.name).toBe('@deepseek-ai/dsh-canvas/feature-service')
    expect(rows.filter(row => row.id === 'media-workflow')).toHaveLength(1)
    expect(rows.find(row => row.id === 'media-workflow')?.name).toBe('@deepseek-ai/dsh-media-workflow')
    expect(rows.filter(row => row.id === 'media-workflow-builtins')).toHaveLength(1)
    expect(rows.find(row => row.id === 'media-workflow-builtins')?.name).toBe('@deepseek-ai/dsh-media-workflow/builtins')
    expect(rows.filter(row => row.id === 'canvas')).toHaveLength(1)
    expect(rows.filter(row => row.id === 'canvas-invariant')).toHaveLength(1)
    expect(rows.find(row => row.id === 'canvas-invariant')?.name).toBe('@deepseek-ai/dsh-canvas/invariant')
    expect(rows.filter(row => row.id === 'canvas-interaction')).toHaveLength(1)
    expect(rows.find(row => row.id === 'canvas-interaction')?.name).toBe('@deepseek-ai/dsh-canvas/interaction-service')

    const featureIndex = rows.findIndex(row => row.id === 'canvas-features')
    const registryIndex = rows.findIndex(row => row.id === 'media-workflow')
    const builtinsIndex = rows.findIndex(row => row.id === 'media-workflow-builtins')
    const canvasIndex = rows.findIndex(row => row.id === 'canvas')
    const invariantIndex = rows.findIndex(row => row.id === 'canvas-invariant')
    const interactionIndex = rows.findIndex(row => row.id === 'canvas-interaction')
    expect(featureIndex).toBeLessThan(registryIndex)
    expect(registryIndex).toBeLessThan(builtinsIndex)
    expect(builtinsIndex).toBeLessThan(interactionIndex)
    expect(canvasIndex).toBeLessThan(invariantIndex)
    expect(invariantIndex).toBeLessThan(interactionIndex)

    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-canvas', 'workspace:^')
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-invariants', 'workspace:^')
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-media-workflow', 'workspace:^')
    expect(rows.find(row => row.id === 'session-telemetry-otel')?.config?.['mode']).toEqual({
      __jsExpr: "process.env.DSH_TELEMETRY_MODE || 'DISABLED'",
    })
    expect(rows.filter(row => row.id === 'subagent-codex')).toHaveLength(0)
    expect(rows.filter(row => row.id === 'subagent-claude-code')).toHaveLength(0)
    expect(manifest.dependencies).not.toHaveProperty('@deepseek-ai/dsh-subagent-codex')
    expect(manifest.dependencies).not.toHaveProperty('@deepseek-ai/dsh-subagent-claude-code')
  })

  it('gates each shell stack by platform with a symmetric disabled expression', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const parsed = yaml.load(
      readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8'),
      { schema: entryListSchema },
    )
    if (!Array.isArray(parsed)) throw new TypeError('base patch must parse to a patch list')
    const rows = parsed.flatMap((patch): Record<string, unknown>[] =>
      typeof patch === 'object' && patch !== null
        ? (patch as { insert?: Record<string, unknown>[] }).insert ?? []
        : [],
    )
    for (const [id, win32, linux] of [
      ['bash-sandbox', true, false],
      ['tool-bash', true, false],
      ['pwsh-sandbox', false, true],
      ['tool-pwsh', false, true],
    ] as const) {
      const row = rows.find(candidate => candidate.id === id)
      if (row === undefined) throw new Error(`base patch must mount ${id}`)
      const expression = (row.disabled as { __jsExpr?: string } | undefined)?.__jsExpr
      if (expression === undefined) throw new Error(`${id} must gate on a !!js disabled expression`)
      expect(Boolean(evaluate({ process: { platform: 'win32' } }, expression)), `${id} on win32`).toBe(win32)
      expect(Boolean(evaluate({ process: { platform: 'linux' } }, expression)), `${id} on linux`).toBe(linux)
    }
    expect(existsSync(resolve(root, 'windows.cordis.patch.yml'))).toBe(false)
  })
})
