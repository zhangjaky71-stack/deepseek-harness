/** N11.5 compatibility pin for the rc.8 dynamic-client public boundary. */

import { describe, expect, it } from 'vitest'
import * as canvasClient from '../src/client/index.ts'

/**
 * Components, stores, and pure helpers are implementation details. The dynamic
 * client entry exposes only the Cordis loading face at runtime; declaration
 * merges and shared contracts are type-only and therefore erased here.
 */
describe('ui-canvas rc.8 client public boundary', () => {
  it('exports only the dynamic plugin loading face at runtime', () => {
    expect(Object.keys(canvasClient).sort()).toEqual(['apply', 'inject'])
    expect(canvasClient.inject).toEqual(['slots', 'sessions', 'locale', 'conversation'])
  })
})
