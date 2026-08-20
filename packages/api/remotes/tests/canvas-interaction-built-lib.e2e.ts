import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

/** REAL composition smoke for the second Canvas Typert namespace. */
const packageDir = fileURLToPath(new URL('..', import.meta.url))
const root = resolve(packageDir, '../../..')
const artifact = (path: string): string => join(root, path)
const artifactUrl = (path: string): string => pathToFileURL(artifact(path)).href

const requiredArtifacts = [
  'packages/client/connection/lib/client.js',
  'packages/client/connection/lib/index.js',
  'packages/api/remotes/lib/client.js',
  'packages/core/agent/lib/index.js',
  'packages/core/session/lib/index.js',
  'packages/canvas/canvas/lib/index.js',
  'packages/canvas/canvas/lib/types/interaction-service.js',
  'packages/canvas/canvas/lib/typert.host.js',
  'packages/api/gateway/lib/client.js',
  'packages/api/gateway/lib/index.js',
  'packages/typert/registry/lib/client.js',
  'packages/typert/registry/lib/index.js',
].every(path => existsSync(artifact(path)))

describe.skipIf(!requiredArtifacts)('Canvas interaction Remote built LIB chain', () => {
  it('mounts both Canvas namespaces from one generated contribution and crosses real HTTP', async () => {
    const urls = Object.fromEntries(Object.entries({
      agent: 'packages/core/agent/lib/index.js',
      apiGatewayClient: 'packages/api/gateway/lib/client.js',
      apiGatewayHost: 'packages/api/gateway/lib/index.js',
      canvas: 'packages/canvas/canvas/lib/index.js',
      canvasInteraction: 'packages/canvas/canvas/lib/types/interaction-service.js',
      canvasTypert: 'packages/canvas/canvas/lib/typert.host.js',
      connectionClient: 'packages/client/connection/lib/client.js',
      connectionHost: 'packages/client/connection/lib/index.js',
      registryClient: 'packages/typert/registry/lib/client.js',
      registryHost: 'packages/typert/registry/lib/index.js',
      remotesClient: 'packages/api/remotes/lib/client.js',
      session: 'packages/core/session/lib/index.js',
    }).map(([key, path]) => [key, artifactUrl(path)]))

    const script = `
      import { createServer } from 'node:http'
      import * as cordis from '@deepseek-ai/cordis'

      const urls = ${JSON.stringify(urls)}
      const { Context } = cordis
      const { default: AgentRegistry } = await import(urls.agent)
      const connectionHost = await import(urls.connectionHost)
      const { default: TypertRemoteService } = await import(urls.apiGatewayHost)
      const { default: CanvasService } = await import(urls.canvas)
      const { default: CanvasInteractionService } = await import(urls.canvasInteraction)
      const { TYPERT: CANVAS_TYPERT } = await import(urls.canvasTypert)
      const { default: TypertRegistry } = await import(urls.registryHost)
      const { Session, SessionId } = await import(urls.session)

      const routes = []
      const host = new Context()
      host.provide('webServer', {
        register(route) {
          routes.push(route)
          return () => { routes.splice(routes.indexOf(route), 1) }
        },
        tapIndex() { return () => {} },
        port: 0,
      })
      await host.plugin({ inject: connectionHost.inject, apply: connectionHost.apply })
      await host.plugin(TypertRegistry)
      await host.plugin(AgentRegistry)
      await host.plugin(TypertRemoteService)
      await host.plugin(CanvasService)
      await host.plugin(CanvasInteractionService)
      host.typert.register(CANVAS_TYPERT)

      const session = new Session(SessionId('interaction-built-agent'))
      const agent = {
        id: session.id,
        options: {},
        session,
        ctx: host.extend(),
        status: 'idle',
        acceptsNextStep: false,
        send() {},
        updateInbox() { return 'not-found' },
        followup() {},
        steer() { return { outcome: Promise.resolve({ status: 'rejected' }) } },
        inject(input) { session.append('user/message', input, { surfaceOp: 'append' }) },
        reserveTurnAdmission() {},
        cancel() {},
        whenIdle() { return Promise.resolve() },
      }
      host.agents.register(agent)

      const workflow = {
        id: 'interaction-built-workflow',
        schemaVersion: 1,
        name: 'Interaction built workflow',
        nodes: [{ id: 'node-a', type: 'prompt', nodeVersion: 1, config: { text: 'coffee' } }],
        edges: [],
        outputNodeIds: ['node-a'],
      }
      const canvas = host.canvas.create(agent, { workflow })

      if (routes.length !== 1 || routes[0].path !== '/api') throw new Error('missing real /api route')
      const server = createServer((request, response) => { void routes[0].handler(request, response) })
      await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen))
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('HTTP server has no TCP address')
      const origin = 'http://127.0.0.1:' + String(address.port)

      const handoffs = new Map()
      globalThis.window = { __ModuleLoader__: { load(handoff) { handoffs.set(handoff.id, handoff) } } }
      globalThis.location = { hostname: '127.0.0.1', origin, search: '' }
      await import(urls.registryClient)
      await import(urls.connectionClient)
      await import(urls.apiGatewayClient)
      await import(urls.remotesClient)

      const instantiate = id => {
        const handoff = handoffs.get(id)
        if (handoff === undefined) throw new Error('missing Client bundle handoff ' + id)
        return handoff.factory(specifier => {
          if (specifier === '@deepseek-ai/cordis') return cordis
          throw new Error('unexpected Client external ' + specifier)
        })
      }
      const client = new Context()
      for (const id of [
        '@deepseek-ai/dsh-typert-registry',
        '@deepseek-ai/dsh-client-connection',
        '@deepseek-ai/dsh-api-gateway',
        '@deepseek-ai/dsh-api-remotes',
      ]) {
        const plugin = instantiate(id)
        await client.plugin({ inject: plugin.inject, apply: plugin.apply })
      }

      const context = {
        canvasId: canvas.id,
        workflowId: canvas.workflow.id,
        workflowRevision: canvas.workflowRevision,
        mode: 'editor',
        selectedNodeIds: ['node-a'],
      }
      const staged = await client.remote.canvasInteraction.stage(agent.id, { rpcId: 'rpc-built-1', context })
      const discarded = await client.remote.canvasInteraction.discard(agent.id, { rpcId: 'rpc-built-1' })
      const discardedAgain = await client.remote.canvasInteraction.discard(agent.id, { rpcId: 'rpc-built-1' })
      const result = {
        staged: staged.value,
        discarded: discarded.value,
        discardedAgain: discardedAgain.value,
        hasCanvas: client.remote.canvas !== undefined,
        hasCanvasInteraction: client.remote.canvasInteraction !== undefined,
      }

      await client.fiber.dispose()
      await new Promise((resolveClose, rejectClose) => server.close(error => {
        if (error === undefined) resolveClose()
        else rejectClose(error)
      }))
      await host.fiber.dispose()
      console.log(JSON.stringify(result))
    `

    const result = await runPlainNode(script)
    expect(result.exitCode, `stderr:\n${result.stderr}`).toBe(0)
    const output = JSON.parse(result.stdout.trim().split('\n').at(-1) ?? '{}') as {
      staged: { staged: boolean; expiresAt: number }
      discarded: { discarded: boolean }
      discardedAgain: { discarded: boolean }
      hasCanvas: boolean
      hasCanvasInteraction: boolean
    }
    expect(output.hasCanvas).toBe(true)
    expect(output.hasCanvasInteraction).toBe(true)
    expect(output.staged.staged).toBe(true)
    expect(output.staged.expiresAt).toBeGreaterThan(0)
    expect(output.discarded).toEqual({ discarded: true })
    expect(output.discardedAgain).toEqual({ discarded: false })
  }, 60_000)
})

function runPlainNode(script: string): Promise<{
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string
}> {
  return new Promise((resolveRun) => {
    execFile(process.execPath, ['--input-type=module', '-e', script], {
      cwd: packageDir,
      encoding: 'utf8',
      timeout: 55_000,
    }, (error, stdout, stderr) => {
      resolveRun({
        exitCode: error === null ? 0 : typeof error.code === 'number' ? error.code : null,
        stdout,
        stderr,
      })
    })
  })
}
