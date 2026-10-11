// Renders public/icons/*.png from public/icons/logo.svg. Run `npm run build:icons` after changing the logo.
import { readFileSync } from 'node:fs'
import sharp from 'sharp'

const svg = readFileSync('public/icons/logo.svg')
const render = (size: number, out: string, opaque = false) => {
  const img = sharp(svg, { density: 144 }).resize(size, size)
  return (opaque ? img.flatten({ background: '#7a1f33' }) : img).png().toFile(`public/icons/${out}`)
}

// Maskable: full-bleed maroon with the logo shrunk into the 80% safe zone.
async function maskable(size: number, out: string) {
  const inner = Math.round(size * 0.7)
  const logo = await sharp(svg, { density: 144 }).resize(inner, inner).png().toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: '#7a1f33' } })
    .composite([{ input: logo, gravity: 'centre' }])
    .png()
    .toFile(`public/icons/${out}`)
}

await Promise.all([render(192, 'icon-192.png'), render(512, 'icon-512.png'), render(180, 'apple-touch-icon.png', true), maskable(512, 'maskable-512.png')])
console.log('wrote public/icons/*.png')
