// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { useAppStore } from '../app/store.ts'
import { LocationControl } from './LocationControl.tsx'

type Ok = { latitude: number; longitude: number; accuracy: number }
let respond: (ok?: Ok, errorCode?: number) => void

beforeEach(() => {
  useAppStore.setState({ location: { status: 'idle' }, start: null, picking: false })
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (success: (p: { coords: Ok }) => void, failure: (e: { code: number }) => void) => {
        respond = (ok, code) => (ok ? success({ coords: ok }) : failure({ code: code! }))
      },
    },
  })
})
afterEach(cleanup)

const tap = () => fireEvent.click(screen.getByRole('button', { name: /my location|try again/i }))
const status = () => screen.getByRole('status').textContent
const campus = { latitude: 1.559, longitude: 103.638 }

test('idle: nothing is asked until the tap', () => {
  render(<LocationControl />)
  expect(status()).toBe('We only ask for your location when you tap.')
  expect(screen.getByRole('button', { name: 'Use my location' })).toBeTruthy()
  expect(useAppStore.getState().location.status).toBe('idle')
})

test('asking: button disabled while waiting', () => {
  render(<LocationControl />)
  tap()
  expect(status()).toBe('Finding you…')
  expect((screen.getByRole('button', { name: 'Use my location' }) as HTMLButtonElement).disabled).toBe(true)
})

test('ok: on campus with a good fix sets the start', () => {
  render(<LocationControl />)
  tap()
  act(() => respond({ ...campus, accuracy: 12.4 }))
  expect(status()).toBe('Found you on campus, accurate to about 12 m.')
  expect(useAppStore.getState().start).toEqual({ lat: 1.559, lon: 103.638, source: 'gps' })
})

test('low accuracy: over 100 m asks for a drag, keeps the fix as start', () => {
  render(<LocationControl />)
  tap()
  act(() => respond({ ...campus, accuracy: 250 }))
  expect(status()).toBe('Your location is rough, about 250 m. Drag the pin to where you are.')
  expect(useAppStore.getState().start?.lat).toBe(1.559)
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
})

test('off campus: no start, offers pick on map', () => {
  render(<LocationControl />)
  tap()
  act(() => respond({ latitude: 1.3521, longitude: 103.8198, accuracy: 10 }))
  expect(status()).toBe('You are not on the UTM campus. Pick your starting point on the map.')
  expect(useAppStore.getState().start).toBeNull()
})

test('denied: shows how to enable on Android Chrome and iPhone Safari', () => {
  render(<LocationControl />)
  tap()
  act(() => respond(undefined, 1))
  expect(status()).toBe('Location is blocked for this site.')
  expect(screen.getByText('Android Chrome:')).toBeTruthy()
  expect(screen.getByText('iPhone Safari:')).toBeTruthy()
})

test('unavailable: error code 2, and a browser without geolocation', () => {
  render(<LocationControl />)
  tap()
  act(() => respond(undefined, 2))
  expect(status()).toBe('Your device could not work out where you are.')
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
  delete (navigator as { geolocation?: unknown }).geolocation
  useAppStore.setState({ location: { status: 'idle' } })
  tap()
  expect(status()).toBe('Your device could not work out where you are.')
})

test('timeout, then Try again asks again and succeeds', () => {
  render(<LocationControl />)
  tap()
  act(() => respond(undefined, 3))
  expect(status()).toBe('Finding you took too long. Try again outside or near a window.')
  tap()
  expect(status()).toBe('Finding you…')
  act(() => respond({ ...campus, accuracy: 8 }))
  expect(status()).toBe('Found you on campus, accurate to about 8 m.')
})

test('pick on map: shows the prompt, Cancel returns', () => {
  render(<LocationControl />)
  fireEvent.click(screen.getByRole('button', { name: 'Pick on map' }))
  expect(status()).toBe('Tap the map where you are starting.')
  expect(useAppStore.getState().picking).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(status()).toBe('We only ask for your location when you tap.')
  expect(useAppStore.getState().picking).toBe(false)
})

test('a hand-placed start is announced', () => {
  render(<LocationControl />)
  act(() => useAppStore.setState({ start: { lat: 1.56, lon: 103.64, source: 'pin' } }))
  expect(screen.getByText('Starting from the pin you placed. Drag it to adjust.')).toBeTruthy()
})
