import { describe, expect, it } from 'vitest'
import type { CanvasImageAssetRef } from '@deepseek-ai/dsh-canvas/types'
import {
  MediaProviderError,
  runMediaProviderOperation,
  type MediaProviderOperationHandle,
  type MediaProviderRequest,
} from '@deepseek-ai/dsh-media-provider/runtime'
import {
  MOCK_MEDIA_MODEL_ID,
  MOCK_MEDIA_MODEL_DESCRIPTOR,
  MOCK_MEDIA_PROVIDER_ID,
  MockMediaProvider,
} from '../src/index.ts'

const image = {
  kind: 'image',
  image: {
    attachmentId: 'mock-input',
    mediaType: 'image/png',
    bytes: 1,
    width: 1,
    height: 1,
  },
} as CanvasImageAssetRef

const common = {
  providerId: MOCK_MEDIA_PROVIDER_ID,
  modelId: MOCK_MEDIA_MODEL_ID,
  executionIdentityKey: MOCK_MEDIA_MODEL_DESCRIPTOR.executionIdentityKey,
  nodeVersion: 1,
  config: {},
} as const

const requests: readonly MediaProviderRequest[] = [
  {
    ...common,
    nodeType: 'image.generate',
    capability: 'text-to-image',
    prompt: 'image prompt',
    count: 2,
    references: [],
  },
  {
    ...common,
    nodeType: 'image.edit',
    capability: 'image-edit',
    image,
    prompt: 'edit prompt',
  },
  {
    ...common,
    nodeType: 'video.generate',
    capability: 'text-to-video',
    prompt: 'video prompt',
  },
  {
    ...common,
    nodeType: 'video.image-to-video',
    capability: 'image-to-video',
    image,
    prompt: 'animate prompt',
  },
]

describe('MockMediaProvider', () => {
  it('supports all four N14 semantic capabilities with deterministic test bytes', async () => {
    const mock = new MockMediaProvider()
    for (const request of requests) {
      const result = await runMediaProviderOperation(mock, request)
      expect(result.mode).toBe('inline')
      const expectedKind = request.capability === 'text-to-image' || request.capability === 'image-edit'
        ? 'image'
        : 'video'
      const expectedCount = request.capability === 'text-to-image' ? request.count : 1
      expect(result.completion.outputs).toHaveLength(expectedCount)
      expect(result.completion.outputs.every(output => output.kind === expectedKind)).toBe(true)
      expect(result.completion.providerRequestId).toMatch(/^mock-request-/)
      expect(new TextDecoder().decode(result.completion.outputs[0]!.data)).toContain(request.capability)
    }
  })

  it.each(['polling', 'callback'] as const)('supports %s resume and duplicate completion idempotence', async mode => {
    const mock = new MockMediaProvider()
    mock.enqueue({ mode, pendingResumes: 1, retryAfterMs: 1 })
    const started = await mock.start(requests[0]!)
    expect(started.mode).toBe(mode)
    if (started.mode === 'inline') throw new Error('expected async Mock task')
    const handle: MediaProviderOperationHandle = {
      providerId: MOCK_MEDIA_PROVIDER_ID,
      mode: started.mode,
      providerTaskId: started.providerTaskId,
    }

    expect(await mock.resume(handle)).toEqual({ status: 'pending', retryAfterMs: 1 })
    const first = await mock.resume(handle)
    const duplicate = await mock.resume(handle)
    expect(first).toEqual(duplicate)
    expect(first.status).toBe('completed')
  })

  it.each([
    ['rate-limit', 'MEDIA_PROVIDER_RATE_LIMIT'],
    ['server-error', 'MEDIA_PROVIDER_SERVER_ERROR'],
    ['rejected', 'MEDIA_PROVIDER_REJECTED'],
    ['timeout', 'MEDIA_PROVIDER_TIMEOUT'],
  ] as const)('injects %s failure without exposing the raw mock Provider response', async (failure, code) => {
    const mock = new MockMediaProvider()
    mock.enqueue({ failure })
    let caught: unknown
    try {
      await runMediaProviderOperation(mock, requests[0]!)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(MediaProviderError)
    expect(caught).toMatchObject({ code })
    expect((caught as Error).message).not.toContain('mock-secret-provider-body')
  })

  it('can inject a resume-stage failure after an async task has started', async () => {
    const mock = new MockMediaProvider()
    mock.enqueue({ mode: 'polling', failure: 'server-error', failureAt: 'resume' })
    await expect(runMediaProviderOperation(mock, requests[0]!)).rejects.toMatchObject({
      code: 'MEDIA_PROVIDER_SERVER_ERROR',
    })
  })

  it('marks an async task cancelled and rejects later resume', async () => {
    const mock = new MockMediaProvider()
    mock.enqueue({ mode: 'callback' })
    const started = await mock.start(requests[0]!)
    if (started.mode === 'inline') throw new Error('expected async Mock task')
    const handle: MediaProviderOperationHandle = {
      providerId: MOCK_MEDIA_PROVIDER_ID,
      mode: started.mode,
      providerTaskId: started.providerTaskId,
    }
    await mock.cancel(handle)
    expect(mock.cancellationCount).toBe(1)
    await expect(mock.resume(handle)).rejects.toMatchObject({ code: 'MEDIA_PROVIDER_ABORTED' })
  })
})
