import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/** N11.5 guard for the Canvas overlay's dynamic-client ownership boundary. */
describe('Canvas client ownership', () => {
  it('keeps Canvas in ui-canvas and exposes only a generic shell.main seam from ui-layout', () => {
    const canvas = readFileSync(resolve('packages/client/ui-canvas/src/client/index.ts'), 'utf8')
    const frame = readFileSync(resolve('packages/client/ui-layout/src/client/AppFrame.tsx'), 'utf8')

    expect(canvas).toContain("slots.inject('shell.main'")
    expect(canvas).not.toContain('conversation.view')

    expect(frame).toContain("renderSlot('shell.main'")
    expect(frame).not.toContain('@deepseek-ai/dsh-client-ui-canvas')
    expect(frame).not.toContain('CanvasView')
    expect(frame).not.toContain('CanvasSnapshot')
  })
})
