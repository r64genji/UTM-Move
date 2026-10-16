import type { FeatureCollection } from 'geojson'
import { describe, expect, it } from 'vitest'
import { buildStyle } from './style'

describe('buildStyle', () => {
  it('labels campus buildings with their block code and name', () => {
    const style = buildStyle('https://example.test')
    const source = style.sources['utm-buildings'] as { data: FeatureCollection }
    const labels = source.data.features.map((f) => f.properties)
    expect(labels).toContainEqual({ code: 'N28A', name: 'School Of Computing' })
    expect(labels).toContainEqual({ code: 'K28', name: 'KTR' })
    expect(style.layers.find((l) => l.id === 'utm-building-labels')).toMatchObject({ type: 'symbol', source: 'utm-buildings' })
  })
})
