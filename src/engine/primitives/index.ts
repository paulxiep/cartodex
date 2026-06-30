// Primitive registry: maps each layer primitive to its drawSVG renderer.

import type { Primitive, PrimitiveRenderer } from '../types'
import { baseRenderer } from './base'
import { regionRenderer } from './region'
import { pointRenderer } from './point'
import { flowRenderer } from './flow'

export const PRIMITIVES: Record<Primitive, PrimitiveRenderer> = {
  base: baseRenderer,
  region: regionRenderer,
  point: pointRenderer,
  flow: flowRenderer,
}

export function getPrimitive(primitive: Primitive): PrimitiveRenderer {
  return PRIMITIVES[primitive]
}
