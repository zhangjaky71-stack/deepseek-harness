/** Types for deployment-resolved Canvas feature capabilities. */

/** Feature switches owned by the Canvas deployment policy. */
export type CanvasFeatureName =
  | 'canvas'
  | 'editor'
  | 'history'
  | 'video'
  | 'variants'
  | 'partialRun'
  | 'regionEdit'
  | 'providerFallback'

/** One optional deployment toggle before defaults and parent capability folding. */
export interface CanvasFeatureToggleConfig {
  readonly enabled?: boolean
}

/** Raw Canvas feature configuration accepted from Cordis config. */
export interface CanvasFeatureConfig {
  readonly canvas?: CanvasFeatureToggleConfig
  readonly editor?: CanvasFeatureToggleConfig
  readonly history?: CanvasFeatureToggleConfig
  readonly video?: CanvasFeatureToggleConfig
  readonly variants?: CanvasFeatureToggleConfig
  readonly partialRun?: CanvasFeatureToggleConfig
  readonly regionEdit?: CanvasFeatureToggleConfig
  readonly providerFallback?: CanvasFeatureToggleConfig
}

/** One effective feature value exposed to Browser and future Agent consumers. */
export interface CanvasCapability {
  readonly enabled: boolean
}

/** Effective deployment capabilities. Child capabilities are false while Canvas itself is disabled. */
export interface CanvasCapabilities {
  readonly canvas: CanvasCapability
  readonly editor: CanvasCapability
  readonly history: CanvasCapability
  readonly video: CanvasCapability
  readonly variants: CanvasCapability
  readonly partialRun: CanvasCapability
  readonly regionEdit: CanvasCapability
  readonly providerFallback: CanvasCapability
}

/** Stable feature-policy failure surfaced before a disabled operation starts. */
export type CanvasFeatureErrorCode = 'CANVAS_FEATURE_DISABLED'
