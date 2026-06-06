import { DrawnCard, SpreadingSession } from '../types'

const BACKUP_SCHEMA = 'taro.sessions.backup.v1'

export interface SessionBackupPayload {
  schema: typeof BACKUP_SCHEMA
  exportedAt: string
  sessions: SpreadingSession[]
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const isDrawnCard = (value: unknown): value is DrawnCard => {
  if (!isObject(value)) return false

  return (
    typeof value.position === 'number' &&
    typeof value.cardId === 'number' &&
    typeof value.cardName === 'string' &&
    typeof value.isReversed === 'boolean' &&
    (value.source === 'camera' || value.source === 'manual')
  )
}

const isSpreadingSession = (value: unknown): value is SpreadingSession => {
  if (!isObject(value)) return false

  return (
    typeof value.id === 'string' &&
    typeof value.spreadId === 'string' &&
    typeof value.timestamp === 'number' &&
    typeof value.spreadName === 'string' &&
    Array.isArray(value.drawnCards) &&
    value.drawnCards.every(isDrawnCard)
  )
}

export const buildSessionBackup = (sessions: SpreadingSession[]): SessionBackupPayload => ({
  schema: BACKUP_SCHEMA,
  exportedAt: new Date().toISOString(),
  sessions,
})

export const stringifySessionBackup = (sessions: SpreadingSession[]) =>
  JSON.stringify(buildSessionBackup(sessions), null, 2)

export const parseSessionBackup = (raw: string): SpreadingSession[] => {
  const parsed = JSON.parse(raw) as unknown

  if (!isObject(parsed)) {
    throw new Error('Arquivo de backup invalido.')
  }

  if (parsed.schema !== BACKUP_SCHEMA) {
    throw new Error('Backup com formato nao reconhecido.')
  }

  if (!Array.isArray(parsed.sessions)) {
    throw new Error('Backup sem lista de sessoes.')
  }

  if (!parsed.sessions.every(isSpreadingSession)) {
    throw new Error('Backup contem sessoes invalidas.')
  }

  return parsed.sessions
}

export const buildSessionBackupFileName = () => {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  return `taro-historico-backup-${stamp}.json`
}
