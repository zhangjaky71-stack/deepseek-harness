import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  Remote,
  TypertBusinessFailure,
  TypertRemoteService,
} from '@deepseek-ai/dsh-typert-protocol'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import TypertGatewayService from '@deepseek-ai/dsh-api-gateway'

type RpcResult =
  | { readonly ok: true; readonly value: unknown }
  | {
    readonly ok: false
    readonly error: { readonly code: string; readonly message: string; readonly details: object }
  }

type RpcHandler = (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<RpcResult>

class FakeConnectionService extends Service {
  handler: RpcHandler | undefined

  constructor(ctx: Context) {
    super(ctx, 'connection')
  }

  get rpc() {
    const owner = this.ctx
    return {
      intercept: (
        _channel: string,
        _matches: (endpoint: string) => boolean,
        handler: RpcHandler,
        _options: { readonly authority: string },
      ) => owner.effect(() => {
        this.handler = handler
        return () => { this.handler = undefined }
      }),
    }
  }
}

class BusinessFailureService extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'businessFailureFixture')
  }

  @Remote
  safe(): never {
    throw new TypertBusinessFailure('Request conflicts with current state', 'DEMO_CONFLICT')
  }

  @Remote
  raw(): never {
    throw new Error('secret internal diagnostic must never cross the carrier')
  }
}

async function harness(): Promise<{ readonly ctx: Context; readonly connection: FakeConnectionService }> {
  const ctx = new Context()
  await ctx.plugin(TypertRegistry)
  await ctx.plugin(FakeConnectionService)
  await ctx.plugin(TypertGatewayService)
  await ctx.plugin(BusinessFailureService)
  const connection = ctx.get('connection') as unknown as FakeConnectionService
  if (connection.handler === undefined) throw new Error('expected Gateway RPC interception')
  return { ctx, connection }
}

describe('Typert Gateway business-failure boundary', () => {
  it('preserves only explicitly wire-safe business failures', async () => {
    const { ctx, connection } = await harness()
    const result = await connection.handler!(
      'businessFailureFixture/safe',
      { args: {} },
      new AbortController().signal,
    )

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'DEMO_CONFLICT',
        message: 'Request conflicts with current state',
        details: {},
      },
    })
    await ctx.fiber.dispose()
  })

  it('collapses ordinary internal exceptions without exposing their message', async () => {
    const { ctx, connection } = await harness()
    const result = await connection.handler!(
      'businessFailureFixture/raw',
      { args: {} },
      new AbortController().signal,
    )

    expect(result).toEqual({
      ok: false,
      error: { code: 'internal', message: 'Remote request failed', details: {} },
    })
    expect(JSON.stringify(result)).not.toContain('secret internal diagnostic')
    await ctx.fiber.dispose()
  })
})
