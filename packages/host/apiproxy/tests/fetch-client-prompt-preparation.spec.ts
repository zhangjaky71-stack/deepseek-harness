import { describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { AbstractApiClient } from '../src/fetch/client.ts'

class PromptPreparationClient extends AbstractApiClient {
  readonly order: string[] = []
  requestRpcId: string | undefined
  fetchCount = 0

  protected async doFetch(_input: URL, init?: RequestInit): Promise<Response> {
    this.order.push('fetch')
    this.fetchCount += 1
    const body = JSON.parse(String(init?.body)) as { rpcId: string }
    this.requestRpcId = body.rpcId
    return new Response(JSON.stringify({
      type: 'server-response',
      rpcId: body.rpcId,
      result: { ok: true, value: { accepted: true } },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
}

const payload = {
  sessionId: SessionId('session-preparation'),
  mode: 'queue' as const,
  content: [{ type: 'text' as const, text: 'modify this' }],
}

describe('session.prompt rpc preparation', () => {
  it('runs after rpc-id mint and before the request becomes transport-visible', async () => {
    const client = new PromptPreparationClient()
    let preparedRpcId: string | undefined

    const response = await client.sessions.prompt(payload, undefined, (rpcId) => {
      client.order.push('prepare')
      preparedRpcId = rpcId
      expect(client.fetchCount).toBe(0)
    })

    expect(response.result).toEqual({ ok: true, value: { accepted: true } })
    expect(client.order).toEqual(['prepare', 'fetch'])
    expect(preparedRpcId).toBeDefined()
    expect(preparedRpcId).toBe(client.requestRpcId)
  })

  it('does not emit or transport the prompt when preparation rejects', async () => {
    const client = new PromptPreparationClient()

    await expect(client.sessions.prompt(payload, undefined, async () => {
      client.order.push('prepare')
      throw new Error('stage failed')
    })).rejects.toThrow('stage failed')

    expect(client.order).toEqual(['prepare'])
    expect(client.fetchCount).toBe(0)
    expect(client.requestRpcId).toBeUndefined()
  })
})
