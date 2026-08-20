import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Web assembly pin for the Canvas conversation-view plugin. */
describe('dsh-web-app Canvas roster', () => {
  it('ships ui-canvas exactly once and declares its workspace dependency', () => {
    const root = resolve('packages/bundle/web-app')
    const patch = readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8')
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    expect(patch.match(/- id: ui-canvas\n\s+name: '@deepseek-ai\/dsh-client-ui-canvas'/g)).toHaveLength(1)
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-client-ui-canvas', 'workspace:^')
  })
})
