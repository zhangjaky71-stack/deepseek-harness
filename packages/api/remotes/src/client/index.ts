/** Platform-neutral assembly of generated Host Remote contributions. */

import type { Context } from '@deepseek-ai/cordis'
import commandsRemote from '@deepseek-ai/dsh-commands/remote'
import goalsRemote from '@deepseek-ai/dsh-goal/remote'
import canvasRemote from '@deepseek-ai/dsh-canvas/remote'
import canvasInteractionRemote from '@deepseek-ai/dsh-canvas-interaction/remote'
import dynamicRemote from '@deepseek-ai/dsh-cordis-host-runner/remote'
import pluginInventoryRemote from '@deepseek-ai/dsh-host-plugin-inventory/remote'
import messageFeedbackRemote from '@deepseek-ai/dsh-message-feedback/remote'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'

export type { TypertClientRemote as ClientRemote } from '@deepseek-ai/dsh-typert-protocol'
export type { PluginInventorySnapshot } from '@deepseek-ai/dsh-host-plugin-inventory/types'
export type {} from '@deepseek-ai/dsh-commands/remote'
export type {} from '@deepseek-ai/dsh-goal/remote'
export type {} from '@deepseek-ai/dsh-canvas/remote'
export type {} from '@deepseek-ai/dsh-canvas-interaction/remote'
export type {} from '@deepseek-ai/dsh-host-plugin-inventory/remote'
export type {} from '@deepseek-ai/dsh-message-feedback/remote'
// The forwarded-event allowlist's selection seat: without it in the consumer's
// compilation face `TypertRemoteEvent` is `never` and every `$on` call fails.
export type { ApiRemoteForwardedEvent } from '../types.ts'
// The owner packages' client-safe exports supply declarations used by Client
// call sites without pulling Host services into the browser compilation face.
export type {} from '@deepseek-ai/dsh-canvas/client'
export type {} from '@deepseek-ai/dsh-canvas-interaction/client'
export type {} from '@deepseek-ai/dsh-commands/types'
export type {} from '@deepseek-ai/dsh-cordis-host-runner/types'
export type {} from '@deepseek-ai/dsh-credentials/types'
export type {} from '@deepseek-ai/dsh-llm/types'
export type {} from '@deepseek-ai/dsh-agent-presets/types'
export type {} from '@deepseek-ai/dsh-settings/types'

/**
 * The carrier's Client-facing types, re-exported so a business package names one
 * assembly package instead of both this facade and the Connection plugin. Type-only:
 * the carrier's runtime values stay behind their own module edge.
 */
export type {
  ClientResponse, ConfigurableProviderView, ConnectionHandle, ConnectionSinks, ContentBlock,
  CredentialView, DirectoryListing, DiscoveredModelView, HistoryEntry, HostFrame, IApiClient,
  MessageId, ModelCatalogFailure, ModelProviderGroup, ModelReasoningEffort, ModelSelection,
  MuxFrame, PromptContentPart, QuestionResponsePayload, QueueAction, RpcError, RpcId, RpcReceipt,
  RpcRequest, RpcResponse, RpcResult, SessionId, SessionModels, SessionSearchItem,
  SessionSummary, SettingsNamespaceView, SettingsPathOpView, SkillEntry, StreamChunk,
  SubagentAddress, SubagentCatalog, JobView, ToolCallView, ToolEventView, ToolResultView,
  WorkspaceId, WorkspaceView,
} from '@deepseek-ai/dsh-client-connection/client'
export type {} from '@deepseek-ai/dsh-api-gateway/client'
export type {} from '@deepseek-ai/dsh-cordis-host-runner/remote'

// The payload vocabulary of the selected namespaces, re-exported so a Client
// contribution can name what it sends and receives without importing a Host
// package: this assembly is the one place both planes legitimately meet.
export type {
  ApprovalRequestId,
  CordisHalfState,
  CordisDynamicPackageId,
  CordisDynamicPluginId,
  CordisDynamicPluginRunId,
  CordisDynamicRunMode,
  CordisInspectMethodManifest,
  CordisInspectPlatform,
  CordisInspectProviderManifest,
  CordisInspectProviderView,
  CordisInspectQueryRequest,
  CordisInspectQueryResolution,
  CordisInspectQueryResolved,
  CordisInspectRequestId,
  CordisInspectResolveAck,
  CordisRunDiagnostic,
  CordisRunStatus,
  DynamicCordisClientSource,
  DynamicCordisHostHalfResult,
  DynamicCordisInventoryRow,
  DynamicCordisInvokeResult,
  DynamicCordisPackage,
  DynamicCordisRequestResolved,
  DynamicCordisResolveAck,
  DynamicCordisRetracted,
  DynamicCordisRunRequest,
  DynamicCordisRunResolution,
  DynamicCordisRunAttempt,
  DynamicCordisRunResponse,
  DynamicCordisStopResponse,
  DynamicCordisUndefineReceipt,
  RequestRunOutcome,
} from '@deepseek-ai/dsh-cordis-host-runner/types'
// The JSON vocabulary those payloads are built from, re-exported for the same
// reason: a Client contribution names what it sends without importing a Host
// package, and this assembly is where both planes legitimately meet.
export type { JsonValue } from '@deepseek-ai/dsh-session/types'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Generated Remote namespaces selected by this Client assembly. */
    remote: TypertClientRemote
  }
}

/** Required service: the typed Client Remote contribution mount. */
export const inject = ['remote']

/**
 * Mount the Host capabilities explicitly selected for this Client assembly.
 * @param ctx - Client Cordis root carrying the typed API service.
 * @returns disposer after every selected Remote namespace is ready.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposers: Array<() => Promise<void>> = []
  try {
    for (const contribution of [
      commandsRemote,
      goalsRemote,
      canvasRemote,
      canvasInteractionRemote,
      dynamicRemote,
      pluginInventoryRemote,
      messageFeedbackRemote,
    ]) {
      disposers.push(await ctx.remote.$mount(contribution))
    }
  } catch (error) {
    for (const dispose of disposers.reverse()) await dispose()
    throw error
  }
  // Unwound in reverse mount order, so a namespace never outlives one mounted
  // after it.
  return async () => {
    for (const dispose of disposers.reverse()) await dispose()
  }
}
