/** Stable N15 run-admission failures. */

import type { CanvasRunAdmissionErrorCode } from './types.ts'

/** Fail-closed admission error safe for Host consumers to classify. */
export class CanvasRunAdmissionError extends Error {
  override readonly name = 'CanvasRunAdmissionError'
  readonly code: CanvasRunAdmissionErrorCode

  /**
   * Create one admission failure.
   * @param code - stable N15 machine-readable classification.
   * @param message - safe Host diagnostic without Provider response or credentials.
   * @param options - optional process-local cause.
   */
  constructor(code: CanvasRunAdmissionErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.code = code
  }
}
