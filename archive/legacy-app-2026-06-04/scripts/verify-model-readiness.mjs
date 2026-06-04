import { readFile } from 'node:fs/promises'
import path from 'node:path'

const expectedClasses = 156
const modelDir = path.join(process.cwd(), 'public', 'model')
const metadataPath = path.join(modelDir, 'metadata.json')
const modelPath = path.join(modelDir, 'model.json')

const readJson = async filePath => JSON.parse(await readFile(filePath, 'utf8'))

const getOutputUnits = modelJson => {
  const layers = modelJson?.modelTopology?.config?.layers
  if (!Array.isArray(layers)) return null
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const units = layers[index]?.config?.units
    if (Number.isInteger(units)) return units
  }
  return null
}

const fail = message => {
  console.error(`model:verify error -> ${message}`)
  process.exit(1)
}

const metadata = await readJson(metadataPath)
const modelJson = await readJson(modelPath)

if (metadata?.placeholder === true) {
  fail('metadata.json ainda está como placeholder=true.')
}

if (!Array.isArray(metadata?.labels) || metadata.labels.length !== expectedClasses) {
  fail(
    `labels em metadata.json inválidas: esperado ${expectedClasses}, recebido ${Array.isArray(metadata?.labels) ? metadata.labels.length : 'não-array'}.`,
  )
}

if (modelJson?.format !== 'layers-model') {
  fail(`model.json com formato inválido: ${String(modelJson?.format || 'desconhecido')}.`)
}

const outputUnits = getOutputUnits(modelJson)
if (outputUnits !== expectedClasses) {
  fail(`model.json com classes inválidas: esperado ${expectedClasses}, recebido ${String(outputUnits)}.`)
}

console.log(
  `model:verify ok -> metadata/model consistentes (${expectedClasses} classes, placeholder=false).`,
)
