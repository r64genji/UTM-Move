import { expect, test } from 'vitest'
import { decodePolyline } from './polyline.ts'

test('decodes the Google reference polyline', () => {
  expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
    { lat: 38.5, lon: -120.2 },
    { lat: 40.7, lon: -120.95 },
    { lat: 43.252, lon: -126.453 },
  ])
})
