export type BrightCropBox = {
  sx: number
  sy: number
  sw: number
  sh: number
  confidence: number
}

type LocateOptions = {
  targetRatio?: number
  brightnessThreshold?: number
  chromaThreshold?: number
  cellSize?: number
  minHits?: number
  padRatio?: number
}

type Component = {
  minCol: number
  minRow: number
  maxCol: number
  maxRow: number
  hits: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const luminance = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255

export const locateLargestBrightComponent = (
  imageData: ImageData,
  options: LocateOptions = {},
): BrightCropBox | null => {
  const { width, height, data } = imageData
  if (width <= 0 || height <= 0) return null

  const targetRatio = options.targetRatio ?? 2 / 3
  const brightnessThreshold = options.brightnessThreshold ?? 0.5
  const chromaThreshold = options.chromaThreshold ?? 0.6
  const cellSize = Math.max(2, Math.round(options.cellSize ?? Math.max(3, Math.min(width, height) / 200)))
  const minHits = Math.max(12, Math.round(options.minHits ?? 40))
  const padRatio = options.padRatio ?? 0.02

  const cols = Math.max(1, Math.ceil(width / cellSize))
  const rows = Math.max(1, Math.ceil(height / cellSize))
  const mask = new Uint8Array(cols * rows)
  const visited = new Uint8Array(cols * rows)

  for (let row = 0; row < rows; row += 1) {
    const py = Math.min(height - 1, Math.floor(row * cellSize + cellSize / 2))
    for (let col = 0; col < cols; col += 1) {
      const px = Math.min(width - 1, Math.floor(col * cellSize + cellSize / 2))
      const offset = (py * width + px) * 4
      const r = data[offset]
      const g = data[offset + 1]
      const b = data[offset + 2]
      const lum = luminance(r, g, b)
      const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255

      if (lum >= brightnessThreshold && chroma <= chromaThreshold) {
        mask[row * cols + col] = 1
      }
    }
  }

  const scoreComponent = (component: Component) => {
    const boxWidth = (component.maxCol - component.minCol + 1) * cellSize
    const boxHeight = (component.maxRow - component.minRow + 1) * cellSize
    const ratio = boxWidth / Math.max(1, boxHeight)
    const area = (boxWidth * boxHeight) / (width * height)
    const centerX = ((component.minCol + component.maxCol + 1) * cellSize * 0.5) / width
    const centerY = ((component.minRow + component.maxRow + 1) * cellSize * 0.5) / height

    const ratioConfidence = clamp(1 - Math.abs(ratio - targetRatio) / 0.55, 0, 1)
    const centerConfidence = clamp(1 - Math.hypot(centerX - 0.5, centerY - 0.5) / 0.8, 0, 1)
    const hitConfidence = clamp(component.hits / (minHits * 2.2), 0, 1)

    return area * 1.8 + ratioConfidence * 0.9 + centerConfidence * 0.45 + hitConfidence * 0.25
  }

  let best: Component | null = null
  let bestScore = -1

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const start = row * cols + col
      if (visited[start] || !mask[start]) continue

      const stack = [start]
      visited[start] = 1
      const component: Component = {
        minCol: col,
        minRow: row,
        maxCol: col,
        maxRow: row,
        hits: 0,
      }

      while (stack.length) {
        const current = stack.pop()!
        const currentRow = Math.floor(current / cols)
        const currentCol = current - currentRow * cols

        component.minCol = Math.min(component.minCol, currentCol)
        component.minRow = Math.min(component.minRow, currentRow)
        component.maxCol = Math.max(component.maxCol, currentCol)
        component.maxRow = Math.max(component.maxRow, currentRow)
        component.hits += 1

        for (let dr = -1; dr <= 1; dr += 1) {
          for (let dc = -1; dc <= 1; dc += 1) {
            if (dr === 0 && dc === 0) continue

            const nextRow = currentRow + dr
            const nextCol = currentCol + dc
            if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= cols) continue

            const next = nextRow * cols + nextCol
            if (visited[next] || !mask[next]) continue

            visited[next] = 1
            stack.push(next)
          }
        }
      }

      const score = scoreComponent(component)
      if (component.hits >= minHits && score > bestScore) {
        best = component
        bestScore = score
      }
    }
  }

  if (!best) return null

  let sx = best.minCol * cellSize
  let sy = best.minRow * cellSize
  let ex = Math.min(width, (best.maxCol + 1) * cellSize)
  let ey = Math.min(height, (best.maxRow + 1) * cellSize)
  const padX = Math.round((ex - sx) * padRatio)
  const padY = Math.round((ey - sy) * padRatio)

  sx = clamp(sx - padX, 0, width - 1)
  sy = clamp(sy - padY, 0, height - 1)
  ex = clamp(ex + padX, 1, width)
  ey = clamp(ey + padY, 1, height)

  const sw = ex - sx
  const sh = ey - sy
  if (sw <= 0 || sh <= 0) return null

  const area = (sw * sh) / (width * height)
  const ratioError = Math.abs(sw / sh - targetRatio) / targetRatio
  const ratioConfidence = clamp(1 - ratioError / 0.45, 0, 1)
  const areaConfidence = clamp(area / 0.1, 0, 1)
  const hitConfidence = clamp(best.hits / (minHits * 2.2), 0, 1)

  return {
    sx,
    sy,
    sw,
    sh,
    confidence: clamp(ratioConfidence * 0.45 + areaConfidence * 0.3 + hitConfidence * 0.25, 0, 1),
  }
}

export const scaleCropBox = (crop: BrightCropBox, scaleX: number, scaleY: number): BrightCropBox => ({
  sx: crop.sx * scaleX,
  sy: crop.sy * scaleY,
  sw: crop.sw * scaleX,
  sh: crop.sh * scaleY,
  confidence: crop.confidence,
})

export const expandCropVariants = (
  crop: BrightCropBox,
  sourceWidth: number,
  sourceHeight: number,
): BrightCropBox[] => {
  const seen = new Map<string, BrightCropBox>()

  const push = (sx: number, sy: number, sw: number, sh: number, confidenceMultiplier = 1) => {
    const x = clamp(Math.round(sx), 0, sourceWidth - 1)
    const y = clamp(Math.round(sy), 0, sourceHeight - 1)
    const w = clamp(Math.round(sw), 1, sourceWidth - x)
    const h = clamp(Math.round(sh), 1, sourceHeight - y)
    const key = `${x}:${y}:${w}:${h}`

    if (!seen.has(key)) {
      seen.set(key, {
        sx: x,
        sy: y,
        sw: w,
        sh: h,
        confidence: clamp(crop.confidence * confidenceMultiplier, 0, 1),
      })
    }
  }

  const padX = crop.sw * 0.018
  const padY = crop.sh * 0.018
  const shiftX = crop.sw * 0.012
  const shiftY = crop.sh * 0.012

  push(crop.sx, crop.sy, crop.sw, crop.sh)
  push(crop.sx - padX, crop.sy - padY, crop.sw + padX * 2, crop.sh + padY * 2, 0.98)
  push(crop.sx + padX, crop.sy + padY, crop.sw - padX * 2, crop.sh - padY * 2, 0.97)
  push(crop.sx - shiftX, crop.sy, crop.sw, crop.sh, 0.96)
  push(crop.sx + shiftX, crop.sy, crop.sw, crop.sh, 0.96)
  push(crop.sx, crop.sy - shiftY, crop.sw, crop.sh, 0.96)
  push(crop.sx, crop.sy + shiftY, crop.sw, crop.sh, 0.96)
  push(crop.sx - padX, crop.sy, crop.sw + padX * 2, crop.sh, 0.95)
  push(crop.sx, crop.sy - padY, crop.sw, crop.sh + padY * 2, 0.95)

  return Array.from(seen.values())
}
