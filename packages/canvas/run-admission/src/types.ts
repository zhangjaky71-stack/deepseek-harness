/** Types-only contracts for Canvas run admission and governance. */

import type {
  CanvasAccessContext,
  CanvasAuthorizationDecision,
  CanvasAuthorizationRequest,
  CanvasFeatureName,
  CanvasImageAssetRef,
  CanvasVideoAssetRef,
  MediaWorkflow,
  WorkflowEdgeId,
  WorkflowNodeId,
  WorkflowRef,
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
  /** Evaluate the existing N04 authorization vocabulary without mutating Canvas state. */
  authorize(request: CanvasAuthorizationRequest): CanvasAuthorizationDecision
}

/** Read-only deployment feature policy consumed by N15. */
export interface CanvasRunFeaturePort {
  /** Return the restart-applied N09 capability value for one feature. */
  isEnabled(feature: CanvasFeatureName): boolean
}

/** Availability check for pre-existing boundary assets. N17/N21 will provide the durable implementation. */
export interface CanvasRunAssetAvailabilityPolicy {
  /** Return whether one existing asset ref is currently resolvable for execution. */
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
  /** Target Session identity. */
  readonly sessionId: string
  /** Exact admitted Canvas/workflow revision. */
  readonly workflowRef: WorkflowRef
  /** Immutable workflow value matching {@link workflowRef}. */
  readonly workflow: MediaWorkflow
  /** Deterministic N12 execution plan for this request. */
  readonly plan: MediaWorkflowExecutionPlan
  /** Host-minted N04 actor/source provenance. */
  readonly access: CanvasAccessContext
  /** N13 resolution for each scheduled Provider-backed node. */
  readonly resolutions: ReadonlyMap<WorkflowNodeId, MediaModelResolution>
  /** Distinct resolved Provider ids in stable order. */
  readonly providerIds: readonly MediaProviderId[]
}

/** Deployment-owned estimate for one fully resolved scheduled run. */
export interface CanvasRunCostEstimator {
  /** Return a concrete estimate, explicit non-billable result, or unavailable result. */
  estimate(evidence: CanvasRunGovernanceEvidence): Promise<CanvasRunCostEstimate> | CanvasRunCostEstimate
}

/** Quota decision after model/provider resolution and cost estimation. */
export type CanvasRunQuotaDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly policyCode?: string }

/** Deployment quota policy. N15 does not invent a default allowance. */
export interface CanvasRunQuotaPolicy {
  /** Decide whether the fully resolved run remains within deployment quota. */
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
  /** Decide whether this already-resolved run may proceed. */
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
  /** Reject an already-admitted/started logical request before concurrency is reserved. */
  check(
    key: string,
    evidence: CanvasRunGovernanceEvidence,
  ): Promise<CanvasRunIdempotencyDecision> | CanvasRunIdempotencyDecision
}

/** One active in-memory concurrency reservation. Release is idempotent. */
export interface CanvasRunConcurrencyLease {
  /** Release every global/session/Provider counter reserved by this admission. */
  release(): void
}

/** Atomic concurrency/backpressure authority used immediately before a run may start. */
export interface CanvasRunConcurrencyPolicy {
  /** Atomically reserve one run across global, Session, and all resolved Provider limits. */
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
  /** Target Session identity used by N04 and concurrency policy. */
  readonly sessionId: string
  /** Host-minted actor/source provenance. */
  readonly access: CanvasAccessContext
  /** Exact current Canvas/workflow revision the caller asks N15 to admit. */
  readonly workflowRef: WorkflowRef
  /** Workflow value matching {@link workflowRef}. */
  readonly workflow: MediaWorkflow
  /** Full or partial N12 scheduling intent. */
  readonly selection?: MediaWorkflowExecutionSelection
  /** Existing values crossing into a partial scheduled scope. */
  readonly boundaryInputs?: ReadonlyMap<WorkflowEdgeId, MediaNodeExecutionOutput>
  /** Per-node N13 requests for scheduled Provider-backed nodes. */
  readonly modelRequests: ReadonlyMap<WorkflowNodeId, MediaModelResolutionRequest>
  /** Durable-layer logical request key; N15 only prechecks it. */
  readonly idempotencyKey: string
  /** Optional cancellation while admission/queueing is in progress. */
  readonly signal?: AbortSignal
}

/** Immutable evidence returned after every non-concurrency gate succeeds. */
export interface CanvasRunAdmissionEvidence extends CanvasRunGovernanceEvidence {
  /** Exact N13 execution identities N16 must forward to N12. */
  readonly executionIdentities: ReadonlyMap<WorkflowNodeId, MediaNodeExecutionIdentity>
  /** Cost result already checked by quota/approval policy. */
  readonly costEstimate: CanvasRunCostEstimate
}

/** One admitted run. N16 owns consuming the permit exactly once and releasing the lease at terminal settlement. */
export interface CanvasRunAdmissionPermit {
  readonly evidence: CanvasRunAdmissionEvidence
  readonly lease: CanvasRunConcurrencyLease
}
