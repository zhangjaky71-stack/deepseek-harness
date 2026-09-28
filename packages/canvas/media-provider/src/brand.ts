/** Runtime constructors for opaque media Provider/model identifiers. */

import type { MediaModelId as MediaModelIdType, MediaProviderId as MediaProviderIdType } from './types.ts'

/** Brand one opaque media Provider id without changing its runtime string. */
export function MediaProviderId(value: string): MediaProviderIdType {
  return value as MediaProviderIdType
}

/** Brand one opaque Provider-local media model id without changing its runtime string. */
export function MediaModelId(value: string): MediaModelIdType {
  return value as MediaModelIdType
}
