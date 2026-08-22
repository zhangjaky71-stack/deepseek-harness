/**
 * Transport-independent Canvas run admission, governance sequencing, and process-local concurrency control.
 *
 * @module @deepseek-ai/dsh-canvas-run-admission
 */

export type * from './types.ts'
export { CanvasRunAdmissionError } from './errors.ts'
export {
  CanvasRunConcurrencyLimiter,
  type CanvasRunConcurrencyConfig,
} from './concurrency.ts'
export {
  admitCanvasRun,
  type CanvasRunAdmissionAuthorities,
} from './admission.ts'
