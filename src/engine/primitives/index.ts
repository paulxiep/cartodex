// Primitive registry: maps each rendering primitive to its drawSVG renderer. Channels
// (channels.ts) name the primitive they draw through.

import type { Primitive, PrimitiveRenderer } from '../types'
import { baseRenderer } from './base'
import { regionRenderer } from './region'
import { regionSymbolRenderer } from './region-symbol'
import { pointRenderer } from './point'
import { flowRenderer } from './flow'

export const PRIMITIVES: Record<Primitive, PrimitiveRenderer> = {
  base: baseRenderer,
  region: regionRenderer,
  'region-symbol': regionSymbolRenderer,
  point: pointRenderer,
  flow: flowRenderer,
}

export function getPrimitive(primitive: Primitive): PrimitiveRenderer {
  return PRIMITIVES[primitive]
}
