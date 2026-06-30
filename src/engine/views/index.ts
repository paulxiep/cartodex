// View registry. Adding a projection means adding a module here and registering it;
// every existing layer then works under it for free.

import type { View, ViewId } from '../types'
import { equirectangular, azimuthalEquidistant, orthographic } from './projections'
import { cartogramNoncontiguous } from './cartograms'

export const VIEWS: Record<ViewId, View> = {
  equirectangular,
  'azimuthal-equidistant': azimuthalEquidistant,
  orthographic,
  'cartogram-noncontiguous': cartogramNoncontiguous,
}

export const VIEW_LIST: View[] = Object.values(VIEWS)

export function getView(id: ViewId): View {
  return VIEWS[id]
}
