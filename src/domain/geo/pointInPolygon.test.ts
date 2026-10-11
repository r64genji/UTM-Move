import { expect, test } from 'vitest'
import { isOnCampus, pointInPolygon } from './pointInPolygon.ts'

const square = [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]
const donut = [...square, [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]]

test('square: inside, outside, and lat/lon not swapped', () => {
  expect(pointInPolygon({ lat: 5, lon: 2 }, square)).toBe(true)
  expect(pointInPolygon({ lat: 5, lon: 12 }, square)).toBe(false)
  expect(pointInPolygon({ lat: 12, lon: 5 }, square)).toBe(false)
})

test('a hole is outside', () => {
  expect(pointInPolygon({ lat: 5, lon: 5 }, donut)).toBe(false)
  expect(pointInPolygon({ lat: 2, lon: 2 }, donut)).toBe(true)
})

test('UTM campus boundary', () => {
  expect(isOnCampus({ lat: 1.559, lon: 103.638 })).toBe(true)
  expect(isOnCampus({ lat: 1.3521, lon: 103.8198 })).toBe(false) // Singapore
  expect(isOnCampus({ lat: 1.4927, lon: 103.7414 })).toBe(false) // Johor Bahru
})
