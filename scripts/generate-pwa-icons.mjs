import fs from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'

const outputDir = path.join(process.cwd(), 'public', 'icons')
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

const crcTable = new Uint32Array(256).map((_, index) => {
  let c = index
  for (let bit = 0; bit < 8; bit += 1) {
    c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return c >>> 0
})

const crc32 = buffer => {
  let crc = 0xffffffff
  for (const value of buffer) {
    crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const chunk = (type, data) => {
  const typeBuffer = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

const createIconPng = size => {
  const rowBytes = size * 4
  const raw = Buffer.alloc((rowBytes + 1) * size)
  const center = size / 2
  const radius = size * 0.34

  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (rowBytes + 1)
    raw[rowOffset] = 0

    for (let x = 0; x < size; x += 1) {
      const pixelOffset = rowOffset + 1 + x * 4
      const nx = x / (size - 1 || 1)
      const ny = y / (size - 1 || 1)
      const distance = Math.hypot(x - center, y - center)
      const ring = Math.max(0, 1 - Math.abs(distance - radius) / (size * 0.07))

      const red = Math.round(18 + 42 * nx + 110 * ring)
      const green = Math.round(32 + 56 * (1 - ny) + 90 * ring)
      const blue = Math.round(78 + 110 * ny)

      raw[pixelOffset] = red
      raw[pixelOffset + 1] = green
      raw[pixelOffset + 2] = blue
      raw[pixelOffset + 3] = 255
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const compressed = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const main = async () => {
  await fs.mkdir(outputDir, { recursive: true })
  await fs.writeFile(path.join(outputDir, 'icon-192.png'), createIconPng(192))
  await fs.writeFile(path.join(outputDir, 'icon-512.png'), createIconPng(512))
  console.log('generated-icons=2')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
