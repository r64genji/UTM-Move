import { layers, namedFlavor } from '@protomaps/basemaps'
import type { Feature, FeatureCollection, Polygon } from 'geojson'
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'
import boundaryRaw from '../../../data/campus-boundary.geojson?raw'
import buildingLabelsRaw from '../../../data/osm/building-labels.geojson?raw'

/** UTM boundary extent (west, south, east, north). */
export const CAMPUS_BOUNDS: [number, number, number, number] = [103.6156, 1.5478, 103.6603, 1.5765]
/** Extent of public/basemap/campus.pmtiles. The camera cannot leave it. */
export const TILE_BOUNDS: [number, number, number, number] = [103.608, 1.54, 103.668, 1.584]
/**
 * How far the camera may go: the tiles plus room for the cards that float over the map on phones
 * (search and directions on top, the sheet below), so the campus edge can be dragged clear of them.
 */
export const PAN_BOUNDS: [number, number, number, number] = [TILE_BOUNDS[0] - 0.01, TILE_BOUNDS[1] - 0.02, TILE_BOUNDS[2] + 0.01, TILE_BOUNDS[3] + 0.025]

export const COLORS = {
  walk: '#1a73e8', // blue dots: the walking line every map app uses, never a bus colour
  boundary: '#7a1f33',
  covered: '#e3c27a', // roof band under covered walkways
  place: '#ef4444',
  stop: '#7a1f33', // UTM maroon
  user: '#2563c9',
  casing: '#fffdf8',
}

/** Name of the arrowhead image drawn along routes (see addArrowImage). */
export const ARROW = 'utm-arrow'

/** A right-pointing triangle, tinted per feature through `icon-color`. */
export function addArrowImage(map: { addImage: (id: string, image: ImageData, options: { sdf: boolean }) => void }) {
  const size = 48
  const ctx = Object.assign(document.createElement('canvas'), { width: size, height: size }).getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.beginPath()
  ctx.moveTo(8, 6)
  ctx.lineTo(42, 24)
  ctx.lineTo(8, 42)
  ctx.lineTo(18, 24)
  ctx.closePath()
  ctx.fill()
  map.addImage(ARROW, ctx.getImageData(0, 0, size, size), { sdf: true })
}

export const ATTRIBUTION = [
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>',
  '<a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>',
].join(' · ')


const boundary = JSON.parse(boundaryRaw) as FeatureCollection<Polygon>
const world: [number, number][] = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]
const outsideCampus: Feature<Polygon> = {
  type: 'Feature',
  properties: {},
  geometry: { type: 'Polygon', coordinates: [world, ...boundary.features[0].geometry.coordinates] },
}

/**
 * Where the tiles end the map is flat land colour with a hard cut through roads and water. Stacked translucent frames
 * of that colour fade the data out over the last ~700 m instead.
 */
const tileFade: FeatureCollection<Polygon> = {
  type: 'FeatureCollection',
  features: Array.from({ length: 6 }, (_, i) => {
    const d = i * 0.0011 // degrees in from the tile edge
    const [w, s, e, n] = [TILE_BOUNDS[0] + d, TILE_BOUNDS[1] + d, TILE_BOUNDS[2] - d, TILE_BOUNDS[3] - d]
    return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [world, [[w, s], [w, n], [e, n], [e, s], [w, s]]] } }
  }),
}

const empty: FeatureCollection = { type: 'FeatureCollection', features: [] }

const flavor = {
  ...namedFlavor('light'),
  background: '#f4f1ea',
  earth: '#f4f1ea',
  buildings: '#e4ddd0',
  school: '#efeadc',
  water: '#b9d3df',
}

const buildingLabels: LayerSpecification = {
  id: 'utm-building-labels',
  type: 'symbol',
  source: 'utm-buildings',
  minzoom: 16,
  layout: {
    'text-field': [
      'step', ['zoom'],
      ['format', ['case', ['==', ['get', 'code'], ''], ['get', 'name'], ['get', 'code']], {}],
      17,
      [
        'format',
        ['get', 'code'], {},
        ['case', ['all', ['!=', ['get', 'code'], ''], ['!=', ['get', 'name'], '']], '\n', ''], {},
        ['get', 'name'], { 'text-font': ['literal', ['Noto Sans Regular']], 'font-scale': 0.85 },
      ],
    ],
    'text-font': ['Noto Sans Medium'],
    'text-size': ['interpolate', ['linear'], ['zoom'], 16, 11, 18, 13],
    'text-max-width': 8,
    'text-padding': 2,
  },
  paint: { 'text-color': '#5c4f45', 'text-halo-color': COLORS.casing, 'text-halo-width': 1.5 },
}

const overlay: LayerSpecification[] = [
  { id: 'utm-tile-fade', type: 'fill', source: 'utm-tile-fade', paint: { 'fill-color': '#f4f1ea', 'fill-opacity': 0.3, 'fill-antialias': false } },
  { id: 'utm-outside', type: 'fill', source: 'utm-campus', paint: { 'fill-color': '#e9e4da', 'fill-opacity': 0.55 } },
  {
    id: 'utm-boundary',
    type: 'line',
    source: 'utm-campus',
    paint: { 'line-color': COLORS.boundary, 'line-opacity': 0.3, 'line-width': 1.5, 'line-dasharray': [3, 2] },
  },
  {
    id: 'utm-route-covered',
    type: 'line',
    source: 'utm-route',
    filter: ['==', ['get', 'style'], 'covered'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': COLORS.covered, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 12, 18, 26] },
  },
  {
    id: 'utm-route-casing',
    type: 'line',
    source: 'utm-route',
    filter: ['==', ['get', 'mode'], 'bus'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': COLORS.casing, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 7, 18, 16] },
  },
  {
    id: 'utm-route-bus',
    type: 'line',
    source: 'utm-route',
    filter: ['==', ['get', 'mode'], 'bus'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 4, 18, 10] },
  },
  {
    // Round dots: a zero-length dash with a round cap draws a circle.
    id: 'utm-route-walk',
    type: 'line',
    source: 'utm-route',
    filter: ['==', ['get', 'mode'], 'walk'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      // An unverified shortcut is the same dots, faded (in the colour, so the layer opacity stays free to fade in).
      'line-color': ['case', ['==', ['get', 'style'], 'likely'], 'rgba(26, 115, 232, 0.45)', COLORS.walk],
      'line-width': ['interpolate', ['linear'], ['zoom'], 14, 5, 18, 11],
      'line-dasharray': [0, 1.8],
    },
  },
  {
    id: 'utm-route-arrows',
    type: 'symbol',
    source: 'utm-route',
    filter: ['all', ['==', ['get', 'arrows'], true], ['==', ['get', 'mode'], 'bus']],
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': ['interpolate', ['linear'], ['zoom'], 14, 40, 18, 90],
      'icon-image': ARROW,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.28, 18, 0.55],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-color': ['get', 'color'] },
  },
  {
    id: 'utm-stops',
    type: 'circle',
    source: 'utm-markers',
    filter: ['==', ['get', 'kind'], 'stop'],
    paint: {
      'circle-radius': ['case', ['get', 'selected'], 9, 6],
      'circle-color': COLORS.casing,
      'circle-stroke-color': COLORS.stop,
      'circle-stroke-width': 3,
    },
  },
  {
    id: 'utm-places',
    type: 'circle',
    source: 'utm-markers',
    filter: ['==', ['get', 'kind'], 'place'],
    paint: {
      'circle-radius': ['case', ['get', 'selected'], 10, 7],
      'circle-color': ['coalesce', ['get', 'color'], COLORS.place],
      'circle-stroke-color': COLORS.casing,
      'circle-stroke-width': 2.5,
    },
  },
  {
    id: 'utm-marker-labels',
    type: 'symbol',
    source: 'utm-markers',
    filter: ['any', ['get', 'selected'], ['>=', ['zoom'], 16]],
    layout: {
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Medium'],
      'text-size': 13,
      'text-offset': [0, 1.1],
      'text-anchor': 'top',
      'text-max-width': 9,
    },
    paint: { 'text-color': '#1f1a17', 'text-halo-color': COLORS.casing, 'text-halo-width': 2 },
  },
]

/** Full map style. Every URL points at this origin: no tile, font or sprite CDN at runtime. */
export function buildStyle(origin: string): StyleSpecification {
  return {
    version: 8,
    glyphs: `${origin}/basemap/fonts/{fontstack}/{range}.pbf`,
    sprite: `${origin}/basemap/sprites/light`,
    sources: {
      protomaps: { type: 'vector', url: `pmtiles://${origin}/basemap/campus.pmtiles`, attribution: ATTRIBUTION },
      'utm-campus': { type: 'geojson', data: outsideCampus },
      'utm-tile-fade': { type: 'geojson', data: tileFade },
      'utm-route': { type: 'geojson', data: empty },
      'utm-markers': { type: 'geojson', data: empty },
      'utm-buildings': { type: 'geojson', data: JSON.parse(buildingLabelsRaw) as FeatureCollection },
    },
    layers: [...(layers('protomaps', flavor, { lang: 'en' }) as LayerSpecification[]), buildingLabels, ...overlay],
  }
}
