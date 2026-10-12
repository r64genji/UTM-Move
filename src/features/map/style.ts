import { layers, namedFlavor } from '@protomaps/basemaps'
import type { Feature, FeatureCollection, Polygon } from 'geojson'
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'
import boundaryRaw from '../../../data/campus-boundary.geojson?raw'

/** UTM boundary extent (west, south, east, north). */
export const CAMPUS_BOUNDS: [number, number, number, number] = [103.6156, 1.5478, 103.6603, 1.5765]
/** Extent of public/basemap/campus.pmtiles. The camera cannot leave it. */
export const TILE_BOUNDS: [number, number, number, number] = [103.608, 1.54, 103.668, 1.584]

export const COLORS = {
  walk: '#ec4899', // bright pink, as the walking line in the old app
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

const empty: FeatureCollection = { type: 'FeatureCollection', features: [] }

const flavor = {
  ...namedFlavor('light'),
  background: '#f4f1ea',
  earth: '#f4f1ea',
  buildings: '#e4ddd0',
  school: '#efeadc',
  water: '#b9d3df',
}

const overlay: LayerSpecification[] = [
  { id: 'utm-outside', type: 'fill', source: 'utm-campus', paint: { 'fill-color': '#e9e4da', 'fill-opacity': 0.55 } },
  {
    id: 'utm-boundary',
    type: 'line',
    source: 'utm-campus',
    paint: { 'line-color': COLORS.walk, 'line-opacity': 0.35, 'line-width': 1.5, 'line-dasharray': [3, 2] },
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
    id: 'utm-route-walk',
    type: 'line',
    source: 'utm-route',
    filter: ['all', ['==', ['get', 'mode'], 'walk'], ['!=', ['get', 'style'], 'likely']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': COLORS.walk, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 4, 18, 10] },
  },
  {
    id: 'utm-route-walk-likely',
    type: 'line',
    source: 'utm-route',
    filter: ['==', ['get', 'style'], 'likely'],
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': COLORS.walk,
      'line-width': ['interpolate', ['linear'], ['zoom'], 14, 4, 18, 10],
      'line-dasharray': [1.4, 1],
    },
  },
  {
    id: 'utm-route-arrows',
    type: 'symbol',
    source: 'utm-route',
    filter: ['==', ['get', 'arrows'], true],
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': ['interpolate', ['linear'], ['zoom'], 14, 40, 18, 90],
      'icon-image': ARROW,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.28, 18, 0.55],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-color': ['case', ['==', ['get', 'mode'], 'bus'], ['get', 'color'], COLORS.walk] },
  },
  {
    id: 'utm-user-accuracy',
    type: 'fill',
    source: 'utm-user',
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': COLORS.user, 'fill-opacity': 0.12, 'fill-outline-color': COLORS.user },
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
  {
    id: 'utm-user-dot',
    type: 'circle',
    source: 'utm-user',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-radius': 7, 'circle-color': COLORS.user, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 },
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
      'utm-route': { type: 'geojson', data: empty },
      'utm-markers': { type: 'geojson', data: empty },
      'utm-user': { type: 'geojson', data: empty },
    },
    layers: [...(layers('protomaps', flavor, { lang: 'en' }) as LayerSpecification[]), ...overlay],
  }
}
