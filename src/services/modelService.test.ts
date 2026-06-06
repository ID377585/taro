import { describe, expect, it } from 'vitest'
import {
  buildModelReadinessDiagnostics,
  extractLabelsFromMetadata,
  getModelOutputClasses,
} from './modelService'

const buildModelJson = (classes: number) => ({
  format: 'layers-model',
  modelTopology: {
    config: {
      layers: [
        { config: { units: 32 } },
        { config: { units: classes } },
      ],
    },
  },
})

describe('modelService diagnostics', () => {
  it('extrai labels de formatos comuns de metadata', () => {
    expect(extractLabelsFromMetadata({ classNames: ['a', 'b'] })).toEqual(['a', 'b'])
    expect(extractLabelsFromMetadata({ modelSettings: { labels: ['c'] } })).toEqual(['c'])
  })

  it('lê a quantidade de classes da última camada com units', () => {
    expect(getModelOutputClasses(buildModelJson(156))).toBe(156)
  })

  it('marca o modelo bootstrap como pendência de produção', () => {
    const diagnostics = buildModelReadinessDiagnostics(
      {
        labels: ['00_fool'],
        placeholder: true,
        modelType: 'bootstrap-neutral',
      },
      buildModelJson(78),
    )

    expect(diagnostics.status).toBe('bootstrap')
    expect(diagnostics.message).toBe('Modelo bootstrap publicado.')
  })

  it('marca como pronto quando metadata e model têm 156 classes finais', () => {
    const labels = Array.from({ length: 156 }, (_, index) => `card_${index}`)
    const diagnostics = buildModelReadinessDiagnostics(
      {
        labels,
        placeholder: false,
      },
      buildModelJson(156),
    )

    expect(diagnostics.status).toBe('ready')
  })
})
