import fs from 'node:fs/promises'
import path from 'node:path'
import * as tf from '@tensorflow/tfjs'

const root = process.cwd()
const cardsDataPath = path.join(root, 'public', 'data', 'cards.json')
const cardsDir = path.join(root, 'public', 'cards')
const modelDir = path.join(root, 'public', 'model')

const escapeXml = value =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const splitName = name => {
  const words = name.split(/\s+/).filter(Boolean)
  if (words.length <= 3) return [name]
  const middle = Math.ceil(words.length / 2)
  return [words.slice(0, middle).join(' '), words.slice(middle).join(' ')]
}

const buildCardSvg = (card, index) => {
  const hue = Math.round((index * 137.508) % 360)
  const hueAccent = (hue + 34) % 360
  const line1 = splitName(card.nome)[0] || card.nome
  const line2 = splitName(card.nome)[1] || ''
  const cardIndex = String(index).padStart(2, '0')
  const arcano = card.arcano === 'maior' ? 'ARCANO MAIOR' : 'ARCANO MENOR'

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="360" height="540" viewBox="0 0 360 540" role="img" aria-label="${escapeXml(card.nome)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue} 66% 22%)"/>
      <stop offset="100%" stop-color="hsl(${hueAccent} 64% 12%)"/>
    </linearGradient>
    <linearGradient id="mid" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="hsl(${hue} 88% 58% / 0.70)"/>
      <stop offset="100%" stop-color="hsl(${hueAccent} 84% 48% / 0.38)"/>
    </linearGradient>
  </defs>

  <rect x="8" y="8" width="344" height="524" rx="20" fill="url(#bg)" stroke="hsl(${hue} 80% 72%)" stroke-width="3"/>
  <rect x="26" y="26" width="308" height="488" rx="16" fill="none" stroke="hsl(${hueAccent} 78% 76% / 0.65)" stroke-width="2"/>

  <polygon points="180,52 210,88 150,88" fill="hsl(${hue} 86% 82%)"/>
  <polygon points="180,488 150,452 210,452" fill="hsl(${hue} 86% 62% / 0.68)"/>

  <rect x="54" y="122" width="252" height="274" rx="18" fill="url(#mid)" stroke="hsl(${hueAccent} 90% 88% / 0.45)" stroke-width="1.5"/>

  <text x="180" y="172" text-anchor="middle" font-family="Georgia, serif" font-size="34" font-weight="700" fill="white">${escapeXml(cardIndex)}</text>
  <text x="180" y="222" text-anchor="middle" font-family="Georgia, serif" font-size="19" font-weight="700" fill="white">${escapeXml(line1)}</text>
  ${line2 ? `<text x="180" y="250" text-anchor="middle" font-family="Georgia, serif" font-size="17" font-weight="600" fill="white">${escapeXml(line2)}</text>` : ''}
  <text x="180" y="336" text-anchor="middle" font-family="Verdana, sans-serif" font-size="13" letter-spacing="1.1" fill="white">${escapeXml(arcano)}</text>
  <text x="180" y="372" text-anchor="middle" font-family="Verdana, sans-serif" font-size="11" letter-spacing="0.6" fill="hsl(0 0% 95%)">ASSET LOCAL DO APP TARO</text>
</svg>
`
}

const ensureDirs = async () => {
  await fs.mkdir(cardsDir, { recursive: true })
  await fs.mkdir(modelDir, { recursive: true })
}

const saveBootstrapModel = async cards => {
  const labels = cards.map(card => {
    const fileName = path.basename(card.imagemUrl)
    return fileName.replace(/\.[^/.]+$/, '')
  })

  const model = tf.sequential()
  model.add(tf.layers.inputLayer({ inputShape: [8, 8, 3] }))
  model.add(tf.layers.flatten())
  model.add(
    tf.layers.dense({
      units: labels.length,
      activation: 'softmax',
      useBias: true,
      kernelInitializer: 'zeros',
      biasInitializer: 'zeros',
    }),
  )

  const saveHandler = tf.io.withSaveHandler(async artifacts => {
    const modelJson = {
      format: 'layers-model',
      generatedBy: 'taro-bootstrap-model',
      convertedBy: null,
      modelTopology: artifacts.modelTopology,
      weightsManifest: [
        {
          paths: ['weights.bin'],
          weights: artifacts.weightSpecs,
        },
      ],
    }

    await fs.writeFile(
      path.join(modelDir, 'model.json'),
      JSON.stringify(modelJson, null, 2),
      'utf8',
    )
    await fs.writeFile(path.join(modelDir, 'weights.bin'), Buffer.from(artifacts.weightData))

    return {
      modelArtifactsInfo: {
        dateSaved: new Date(),
        modelTopologyType: 'JSON',
        modelTopologyBytes: JSON.stringify(artifacts.modelTopology).length,
        weightSpecsBytes: JSON.stringify(artifacts.weightSpecs).length,
        weightDataBytes: artifacts.weightData.byteLength,
      },
    }
  })

  await model.save(saveHandler)

  const metadata = {
    labels,
    placeholder: true,
    modelType: 'bootstrap-neutral',
    createdAt: new Date().toISOString(),
    notes:
      'Modelo bootstrap neutro. Para reconhecimento por TensorFlow.js, substitua por um modelo treinado no Teachable Machine.',
  }
  await fs.writeFile(
    path.join(modelDir, 'metadata.json'),
    JSON.stringify(metadata, null, 2),
    'utf8',
  )
}

const main = async () => {
  await ensureDirs()

  const cardsRaw = await fs.readFile(cardsDataPath, 'utf8')
  const cardsData = JSON.parse(cardsRaw)
  const cards = cardsData.cards || []

  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index]
    const oldImageUrl = card.imagemUrl || `/cards/${String(card.id).padStart(2, '0')}.jpg`
    const basename = path.basename(oldImageUrl).replace(/\.[^/.]+$/, '')
    const svgName = `${basename}.svg`
    card.imagemUrl = `/cards/${svgName}`

    const svgContent = buildCardSvg(card, index)
    await fs.writeFile(path.join(cardsDir, svgName), svgContent, 'utf8')
  }

  await fs.writeFile(cardsDataPath, JSON.stringify(cardsData, null, 2), 'utf8')

  await saveBootstrapModel(cards)

  console.log(`cards_generated=${cards.length}`)
  console.log('model_files_generated=3')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
