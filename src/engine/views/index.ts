// View registry. Adding a projection means adding a module here and registering it;
// every channel then works under it for free (except channels gated by compatible()).

import type { View, ViewId } from '../types'
import { equirectangular, equalEarth, azimuthalEquidistant, orthographic } from './projections'

export const VIEWS: Record<ViewId, View> = {
  equirectangular,
  'equal-earth': equalEarth,
  'azimuthal-equidistant': azimuthalEquidistant,
  orthographic,
}

export const VIEW_LIST: View[] = Object.values(VIEWS)

export function getView(id: ViewId): View {
  return VIEWS[id]
}
