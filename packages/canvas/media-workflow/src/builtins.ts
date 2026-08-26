/** Built-in V1 semantic media-node definitions. */

import type { Context } from '@deepseek-ai/cordis'
import type { CanvasJsonValue } from '@deepseek-ai/dsh-canvas/types'
import { z } from 'zod'
import type { MediaNodeConfig, MediaNodeDefinition, MediaNodePortDefinition } from './types.ts'
import type {} from './registry.ts'

const jsonValueSchema: z.ZodType<CanvasJsonValue> = z.lazy(() => z.union([
  z.null(),
  z.boolean(),
  z.number(),
  z.string(),
  z.array(jsonValueSchema),
  z.record(z.string(), jsonValueSchema),
]))

const genericConfigSchema: z.ZodType<MediaNodeConfig> = z.record(z.string(), jsonValueSchema)
const promptConfigSchema: z.ZodType<MediaNodeConfig> = z.object({
  text: z.string().default(''),
}).catchall(jsonValueSchema)
const imageGenerateConfigSchema: z.ZodType<MediaNodeConfig> = z.object({
  count: z.number().int().min(1).max(8).default(1),
}).catchall(jsonValueSchema)

const port = (
  name: string,
  type: MediaNodePortDefinition['type'],
  required: boolean,
  description?: string,
): MediaNodePortDefinition => ({
  name,
  type,
  required,
  ...(description === undefined ? {} : { description }),
})

const active = Object.freeze({ deprecated: false, creatable: true, executable: true })

/** Stable V1 definitions registered by the built-in plugin. */
export const BUILTIN_MEDIA_NODE_DEFINITIONS: readonly MediaNodeDefinition[] = Object.freeze([
  {
    type: 'asset.input',
    version: 1,
    displayName: 'Asset Input',
    inputs: [],
    outputs: [
      port('image', 'image', false, 'Imported or previously generated image.'),
      port('video', 'video', false, 'Imported or previously generated video.'),
    ],
    configSchema: genericConfigSchema,
    defaultConfig: {},
    execution: { deterministic: true, supportsPartialRun: true },
    lifecycle: active,
    ui: { category: 'input', icon: 'asset-input', inspectorKind: 'asset-input' },
  },
  {
    type: 'prompt',
    version: 1,
    displayName: 'Prompt',
    inputs: [],
    outputs: [port('text', 'text', true, 'Semantic prompt text.')],
    configSchema: promptConfigSchema,
    defaultConfig: { text: '' },
    execution: { deterministic: true, supportsPartialRun: true },
    lifecycle: active,
    ui: { category: 'prompt', icon: 'prompt', inspectorKind: 'prompt' },
  },
  {
    type: 'image.generate',
    version: 1,
    displayName: 'Generate Image',
    inputs: [
      port('prompt', 'text', true),
      port('references', 'image-list', false),
    ],
    outputs: [port('images', 'image-list', true)],
    configSchema: imageGenerateConfigSchema,
    defaultConfig: { count: 1 },
    execution: {
      capability: 'text-to-image',
      deterministic: false,
      supportsPartialRun: true,
    },
    lifecycle: active,
    ui: { category: 'image', icon: 'image-generate', inspectorKind: 'image-generate' },
  },
  {
    type: 'image.edit',
    version: 1,
    displayName: 'Edit Image',
    inputs: [
      port('image', 'image', true),
      port('prompt', 'text', true),
      port('mask', 'mask', false),
    ],
    outputs: [port('image', 'image', true)],
    configSchema: genericConfigSchema,
    defaultConfig: {},
    execution: {
      capability: 'image-edit',
      deterministic: false,
      supportsPartialRun: true,
    },
    lifecycle: active,
    ui: { category: 'image', icon: 'image-edit', inspectorKind: 'image-edit' },
  },
  {
    type: 'video.generate',
    version: 1,
    displayName: 'Generate Video',
    inputs: [port('prompt', 'text', true)],
    outputs: [port('video', 'video', true)],
    configSchema: genericConfigSchema,
    defaultConfig: {},
    execution: {
      capability: 'text-to-video',
      feature: 'video',
      deterministic: false,
      supportsPartialRun: true,
    },
    lifecycle: active,
    ui: { category: 'video', icon: 'video-generate', inspectorKind: 'video-generate' },
  },
  {
    type: 'video.image-to-video',
    version: 1,
    displayName: 'Image to Video',
    inputs: [
      port('image', 'image', true),
      port('prompt', 'text', false),
    ],
    outputs: [port('video', 'video', true)],
    configSchema: genericConfigSchema,
    defaultConfig: {},
    execution: {
      capability: 'image-to-video',
      feature: 'video',
      deterministic: false,
      supportsPartialRun: true,
    },
    lifecycle: active,
    ui: { category: 'video', icon: 'image-to-video', inspectorKind: 'image-to-video' },
  },
  {
    type: 'output',
    version: 1,
    displayName: 'Output',
    inputs: [
      port('images', 'image-list', false),
      port('videos', 'video-list', false),
    ],
    outputs: [],
    configSchema: genericConfigSchema,
    defaultConfig: {},
    execution: { deterministic: true, supportsPartialRun: true },
    lifecycle: active,
    ui: { category: 'output', icon: 'output', inspectorKind: 'output' },
  },
])

/** Cordis function-plugin name. */
export const name = 'media-workflow-builtins'
/** Built-ins register only after the registry service exists. */
export const inject = ['mediaNodes']

/** Register all V1 definitions on this plugin fiber; unload removes them. */
export function apply(ctx: Context): void {
  for (const definition of BUILTIN_MEDIA_NODE_DEFINITIONS) ctx.mediaNodes.register(definition)
}
