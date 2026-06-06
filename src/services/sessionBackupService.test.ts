import { describe, expect, it } from 'vitest'
import {
  parseSessionBackup,
  stringifySessionBackup,
} from './sessionBackupService'
import { SpreadingSession } from '../types'

const sessionFixture: SpreadingSession = {
  id: 'session-1',
  spreadId: 'uma-carta',
  timestamp: 1710000000000,
  spreadName: 'Uma Carta',
  drawnCards: [
    {
      position: 1,
      cardId: 0,
      cardName: 'O Louco',
      isReversed: false,
      source: 'manual',
    },
  ],
}

describe('sessionBackupService', () => {
  it('serializa e restaura sessões salvas', () => {
    const backup = stringifySessionBackup([sessionFixture])
    expect(parseSessionBackup(backup)).toEqual([sessionFixture])
  })

  it('rejeita backup com schema desconhecido', () => {
    expect(() =>
      parseSessionBackup(JSON.stringify({ schema: 'outro', sessions: [] })),
    ).toThrow('Backup com formato nao reconhecido.')
  })

  it('rejeita sessões sem cartas válidas', () => {
    const invalidBackup = stringifySessionBackup([sessionFixture]).replace(
      '"drawnCards": [',
      '"drawnCards": "quebrado", "oldCards": [',
    )

    expect(() => parseSessionBackup(invalidBackup)).toThrow(
      'Backup contem sessoes invalidas.',
    )
  })
})
