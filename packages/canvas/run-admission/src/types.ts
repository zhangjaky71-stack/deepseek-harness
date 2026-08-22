/** Types-only contracts for Canvas run admission and governance. */

import type {
  CanvasAccessContext,
  CanvasAuthorizationDecision,
  CanvasAuthorizationRequest,
  CanvasFeatureName,
  CanvasId,
  CanvasImageAssetRef,
  CanvasVideoAssetRef,
  MediaWorkflow,
  WorkflowEdgeId,
  WorkflowNodeId,
} from '@deepseek-ai/dsh-canvas'
import type {
  MediaNodeExecutionIdentity,
  MediaNodeExecutionOutput,
  MediaWorkflowExecutionPlan,
  MediaWorkflowExecutionSelection,
} from '@deepseek-ai/dsh-media-workflow/engine'
import type {
  MediaModelResolution,
  MediaModelResolutionRequest,
  MediaProviderId,
} from '@deepseek-ai/dsh-media-provider'

/** Stable N15 admission failures. */
export type CanvasRunAdmissionErrorCode =
  | 'CANVAS_RUN_PERMISSION_DENIED'
  | 'CANVAS_RUN_AUTHORIZATION_UNAVAILABLE'
  | 'CANVAS_RUN_FEATURE_DISABLED'
  | 'CANVAS_RUN_INVALID_WORKFLOW'
  | 'CANVAS_RUN_BOUNDARY_INPUT_MISSING'
  | 'CANVAS_RUN_ASSET_UNAVAILABLE'
  | 'CANVAS_RUN_MODEL_REQUEST_MISSING'
  | 'CANVAS_RUN_MODEL_REQUEST_INVALID'
  | 'CANVAS_RUN_MODEL_RESOLUTION_FAILED'
  | 'CANVAS_RUN_PROVIDER_UNAVAILABLE'
  | 'CANVAS_RUN_COST_UNAVAILABLE'
  | 'CANVAS_RUN_QUOTA_DENIED'
  | 'CANVAS_RUN_APPROVAL_DENIED'
  | 'CANVAS_RUN_APPROVAL_UNAVAILABLE'
  | 'CANVAS_RUN_DUPLICATE_REQUEST'
  | 'CANVAS_RUN_CONCURRENCY_FULL'
  | 'CANVAS_RUN_QUEUE_FULL'
  | 'CANVAS_RUN_QUEUE_TIMEOUT'
  | 'CANVAS_RUN_ABORTED'

/** Existing durable media ref whose availability must be checked before execution. */
export type CanvasRunInputAsset = CanvasImageAssetRef | CanvasVideoAssetRef

/** Authorization capability consumed by N15; `CanvasService` satisfies this interface. */
export interface CanvasRunAuthorizationPort {
  authorize(request: CanvasAuthorizationRequest): CanvasAuthorizationDecision
}

/** Read-only deployment feature policy consumed by N15. */
export interface CanvasRunFeaturePort {
  isEnabled(feature: CanvasFeatureName): boolean
}

/** Availability check for pre-existing boundary assets. N17/N21 will provide the durable implementation. */
export interface CanvasRunAssetAvailabilityPolicy {
  isAvailable(asset: CanvasRunInputAsset): Promise<boolean> | boolean
}

/** Provider-neutral cost estimate. Unknown cost is explicit rather than silently treated as free. */
export type CanvasRunCostEstimate =
  | { readonly kind: 'not-applicable' }
  | { readonly kind: 'unavailable' }
  | {
    readonly kind: 'estimated'
    readonly currency: string
    readonly amountMinor: number
  }

/** Read-only evidence available to cost/quota/approval/idempotency policies. */
export interface CanvasRunGovernanceEvidence {
  readonly sessionId: string
  readonly canvasId: CanvasId
  readonly workflow: MediaWorkflow
  readonly plan: MediaWorkflowExecutionPlan
  readonly access: CanvasAccessContext
  readonly resolutions: ReadonlyMap<WorkflowNodeId, MediaModelResolution>
  readonly providerIds: readonly MediaProviderId[]
}

/** Deployment-owned estimate for one fully resolved scheduled run. */
export interface CanvasRunCostEstimator {
  estimate(evidence: CanvasRunGovernanceEvidence): Promise<CanvasRunCostEstimate> | CanvasRunCostEstimate
}

/** Quota decision after model/provider resolution and cost estimation. */
export type CanvasRunQuotaDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly policyCode?: string }

/** Deployment quota policy. N15 does not invent a default allowance. */
export interface CanvasRunQuotaPolicy {
  check(
    evidence: CanvasRunGovernanceEvidence,
    estimate: CanvasRunCostEstimate,
  ): Promise<CanvasRunQuotaDecision> | CanvasRunQuotaDecision
}

/** Host-level approval decision independent from Agent/Browser transport. */
export type CanvasRunApprovalDecision =
  | { readonly outcome: 'approved' | 'not-required' }
  | { readonly outcome: 'denied' | 'unavailable' }

/** Approval policy adapter. Agent and Browser surfaces may adapt their own interaction mechanisms to this seam. */
export interface CanvasRunApprovalPolicy {
  request(
    evidence: CanvasRunGovernanceEvidence,
    estimate: CanvasRunCostEstimate,
    signal?: AbortSignal,
  ): Promise<CanvasRunApprovalDecision> | CanvasRunApprovalDecision
}

/** Idempotency precheck owned by the durable run layer. */
export type CanvasRunIdempotencyDecision =
  | { readonly status: 'new' }
  | { readonly status: 'duplicate'; readonly policyCode?: string }

/** N16 supplies the durable idempotency implementation; N15 only orders and enforces the decision. */
export interface CanvasRunIdempotencyPolicy {
  check(
    key: string,
    evidence: CanvasRunGovernanceEvidence,
  ): Promise<CanvasRunIdempotencyDecision> | CanvasRunIdempotencyDecision
}

/** One active in-memory concurrency reservation. Release is idempotent. */
export interface CanvasRunConcurrencyLease {
  release(): void
}

/** Atomic concurrency/backpressure authority used immediately before a run may start. */
export interface CanvasRunConcurrencyPolicy {
  acquire(
    sessionId: string,
    providerIds: readonly MediaProviderId[],
    signal?: AbortSignal,
  ): Promise<CanvasRunConcurrencyLease>
}

/** Complete deployment governance dependencies. No policy silently defaults to allow. */
export interface CanvasRunAdmissionGovernance {
  readonly assets: CanvasRunAssetAvailabilityPolicy
  readonly cost: CanvasRunCostEstimator
  readonly quota: CanvasRunQuotaPolicy
  readonly approval: CanvasRunApprovalPolicy
  readonly idempotency: CanvasRunIdempotencyPolicy
  readonly concurrency: CanvasRunConcurrencyPolicy
}

/** N15 preflight input. Model requests are required only for scheduled Provider-backed nodes. */
export interface CanvasRunAdmissionRequest {
  readonly sessionId: string
  readonly access: CanvasAccessContext
  readonly canvasId: CanvasId
  readonly workflow: MediaWorkflow
  readonly selection?: MediaWorkflowExecutionSelection
  readonly boundaryInputs?: ReadonlyMap<WorkflowEdgeId, MediaNodeExecutionOutput>
  readonly modelRequests: ReadonlyMap<WorkflowNodeId, MediaModelResolutionRequest>
  readonly idempotencyKey: string
  readonly signal?: AbortSignal
}

/** Immutable evidence returned after every non-concurrency gate succeeds. */
export interface CanvasRunAdmissionEvidence extends CanvasRunGovernanceEvidence {
  readonly executionIdentities: ReadonlyMap<WorkflowNodeId, MediaNodeExecutionIdentity>
  readonly costEstimate: CanvasRunCostEstimate
}

/** One admitted run. N16 owns consuming the permit exactly once and releasing the lease at terminal settlement. */
export interface CanvasRunAdmissionPermit {
  readonly evidence: CanvasRunAdmissionEvidence
  readonly lease: CanvasRunConcurrencyLease
}
