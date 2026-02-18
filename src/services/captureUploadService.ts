import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Card } from '../types'
import {
  buildCaptureUploadId,
  CardCaptureOrientation,
  CaptureUploadQueueRecord,
  dbService,
  PersistedCardCaptureRecord,
  UploadedCardCaptureCounts,
} from './dbService'

const DEFAULT_BUCKET = 'taro-captures'
const DEFAULT_FOLDER_PREFIX = 'raw-captures'
const RETRY_BASE_DELAY_MS = 20_000
const RETRY_MAX_DELAY_MS = 15 * 60 * 1000

interface CaptureCloudConfig {
  enabled: boolean
  supabaseUrl: string
  supabaseAnonKey: string
  bucket: string
  folderPrefix: string
  metadataTable: string
}

interface CaptureCloudConfigStatus {
  enabled: boolean
  missing: string[]
  bucket: string
  folderPrefix: string
  metadataTable: string
}

export interface CaptureUploadQueueSummary {
  pending: number
  uploading: number
  failed: number
  uploaded: number
  total: number
}

export interface CaptureUploadProcessResult {
  enabled: boolean
  uploadedNow: number
  failedNow: number
  queue: CaptureUploadQueueSummary
  message: string
}

export interface DirectCaptureUploadInput {
  cardId: number
  cardName: string
  orientation: CardCaptureOrientation
  capturedAt: number
  blob: Blob
  queueId?: string
}

export interface DirectCaptureUploadResult {
  enabled: boolean
  uploaded: boolean
  queueId: string
  remotePath: string | null
  message: string
}

export interface RemoteCardCaptureCountsResult {
  available: boolean
  counts: UploadedCardCaptureCounts
  source: 'metadata' | 'none'
  message: string
}

export interface CleanupLocalUploadedResult {
  cleaned: number
  checked: number
}

interface ProcessQueueOptions {
  cards: Card[]
  limit?: number
  onUploadedSample?: (payload: {
    cardId: number
    orientation: CardCaptureOrientation
    capturedAt: number
    byteSize: number
  }) => void
}

interface CaptureMetadataRow {
  queue_id: string
  card_id: number
  orientation: CardCaptureOrientation
  captured_at: string
  byte_size: number
  mime_type: string
  storage_path: string
  uploaded_at: string
}

interface MetadataTableValidationResult {
  valid: boolean
  message: string
}

let supabaseClient: SupabaseClient | null = null
let supabaseClientKey = ''
const metadataSchemaCache: Record<string, MetadataTableValidationResult> = {}

const REQUIRED_METADATA_COLUMNS = [
  'queue_id',
  'card_id',
  'orientation',
  'captured_at',
  'byte_size',
  'mime_type',
  'storage_path',
  'uploaded_at',
] as const

const sanitizePathPart = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

const getConfig = (): CaptureCloudConfig => {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim()
  const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()
  const bucket = (import.meta.env.VITE_SUPABASE_BUCKET || DEFAULT_BUCKET).trim()
  const folderPrefix = (
    import.meta.env.VITE_SUPABASE_FOLDER_PREFIX || DEFAULT_FOLDER_PREFIX
  ).trim()
  const metadataTable = (import.meta.env.VITE_SUPABASE_METADATA_TABLE || '').trim()

  return {
    enabled: Boolean(supabaseUrl && supabaseAnonKey),
    supabaseUrl,
    supabaseAnonKey,
    bucket: bucket || DEFAULT_BUCKET,
    folderPrefix: folderPrefix || DEFAULT_FOLDER_PREFIX,
    metadataTable,
  }
}

export const getCaptureCloudConfigStatus = (): CaptureCloudConfigStatus => {
  const config = getConfig()
  const missing: string[] = []
  if (!config.supabaseUrl) missing.push('VITE_SUPABASE_URL')
  if (!config.supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY')

  return {
    enabled: config.enabled,
    missing,
    bucket: config.bucket,
    folderPrefix: config.folderPrefix,
    metadataTable: config.metadataTable,
  }
}

export const isCaptureCloudSyncEnabled = () => getCaptureCloudConfigStatus().enabled

const getSupabaseClient = (config: CaptureCloudConfig) => {
  const key = `${config.supabaseUrl}|${config.supabaseAnonKey}`
  if (!supabaseClient || supabaseClientKey !== key) {
    supabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: false },
    })
    supabaseClientKey = key
  }
  return supabaseClient
}

const computeRetryDelayMs = (attempts: number) => {
  const exponent = Math.max(0, attempts - 1)
  return Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** exponent)
}

const getFileExtension = (mimeType: string) => {
  const normalized = mimeType.toLowerCase()
  if (normalized.includes('png')) return 'png'
  if (normalized.includes('webp')) return 'webp'
  return 'jpg'
}

const buildRemotePath = (
  config: CaptureCloudConfig,
  item: CaptureUploadQueueRecord,
  cardName: string,
) => {
  const now = new Date(item.capturedAt).toISOString().replace(/[:.]/g, '-')
  const cardSlug = sanitizePathPart(cardName || `card-${item.cardId}`)
  const sampleId = sanitizePathPart(item.id)
  const ext = getFileExtension(item.mimeType || 'image/jpeg')
  return `${config.folderPrefix}/${String(item.cardId).padStart(2, '0')}-${cardSlug}/${item.orientation}/${now}-${sampleId}.${ext}`
}

const mapQueueStats = async (): Promise<CaptureUploadQueueSummary> => {
  const stats = await dbService.getCaptureUploadQueueStats()
  return {
    total: stats.total,
    pending: stats.pending,
    uploading: stats.uploading,
    failed: stats.failed,
    uploaded: stats.uploaded,
  }
}

const normalizeSupabaseErrorMessage = (error: unknown) =>
  String((error as { message?: string })?.message || '').toLowerCase()

const isOnConflictConstraintError = (error: unknown) => {
  const message = normalizeSupabaseErrorMessage(error)
  return (
    message.includes('there is no unique or exclusion constraint matching') &&
    message.includes('on conflict')
  )
}

const isDuplicateKeyError = (error: unknown) => {
  const typed = error as { code?: string; message?: string }
  if (typed?.code === '23505') return true
  const message = normalizeSupabaseErrorMessage(error)
  return message.includes('duplicate key')
}

const validateMetadataTableSchema = async (
  client: SupabaseClient,
  tableName: string,
): Promise<MetadataTableValidationResult> => {
  const columns = REQUIRED_METADATA_COLUMNS.join(',')
  const { error } = await client.from(tableName).select(columns).limit(1)

  if (error) {
    return {
      valid: false,
      message: `Tabela ${tableName} inválida: ${error.message}. Verifique colunas: ${REQUIRED_METADATA_COLUMNS.join(', ')}.`,
    }
  }

  return {
    valid: true,
    message: `Tabela ${tableName} validada para metadados de captura.`,
  }
}

const validateMetadataTableSchemaCached = async (
  client: SupabaseClient,
  config: CaptureCloudConfig,
): Promise<MetadataTableValidationResult> => {
  if (!config.metadataTable) {
    return {
      valid: true,
      message: 'Tabela de metadata não configurada.',
    }
  }

  const cacheKey = `${config.supabaseUrl}|${config.metadataTable}`
  const cached = metadataSchemaCache[cacheKey]
  if (cached?.valid) {
    return cached
  }

  const validation = await validateMetadataTableSchema(client, config.metadataTable)
  if (validation.valid) {
    metadataSchemaCache[cacheKey] = validation
  } else {
    delete metadataSchemaCache[cacheKey]
  }
  return validation
}

const upsertCaptureMetadata = async (
  client: SupabaseClient,
  tableName: string,
  row: CaptureMetadataRow,
) => {
  const upsertResult = await client
    .from(tableName)
    .upsert(row, { onConflict: 'queue_id', ignoreDuplicates: false })

  if (!upsertResult.error) return

  if (!isOnConflictConstraintError(upsertResult.error)) {
    throw new Error(upsertResult.error.message)
  }

  const existsResult = await client
    .from(tableName)
    .select('queue_id')
    .eq('queue_id', row.queue_id)
    .limit(1)

  if (existsResult.error) {
    throw new Error(
      `Falha ao validar duplicidade em ${tableName}: ${existsResult.error.message}`,
    )
  }

  const alreadyExists = Array.isArray(existsResult.data) && existsResult.data.length > 0
  if (alreadyExists) return

  const insertResult = await client.from(tableName).insert(row)
  if (insertResult.error && !isDuplicateKeyError(insertResult.error)) {
    throw new Error(insertResult.error.message)
  }
}

export const cleanupLocalSamplesFromUploadedQueue = async (
  limit = 500,
): Promise<CleanupLocalUploadedResult> => {
  const uploadedRows = await dbService.getCaptureUploadsByStatus('uploaded', limit)
  let cleaned = 0

  for (const row of uploadedRows) {
    const removed = await dbService.removeCardCaptureSample(
      row.cardId,
      row.orientation,
      row.capturedAt,
      row.byteSize,
    )
    if (removed) cleaned += 1
  }

  return {
    cleaned,
    checked: uploadedRows.length,
  }
}

export const enqueueCardCaptureRecordUploads = async (
  record: PersistedCardCaptureRecord,
): Promise<{ created: number; exists: number }> => {
  const now = Date.now()
  const allSamples: Array<{
    orientation: CardCaptureOrientation
    capturedAt: number
    byteSize: number
    mimeType: string
  }> = []

  record.vertical.forEach(sample => {
    allSamples.push({
      orientation: 'vertical',
      capturedAt: sample.capturedAt,
      byteSize: sample.blob.size,
      mimeType: sample.blob.type || 'image/jpeg',
    })
  })
  record.invertido.forEach(sample => {
    allSamples.push({
      orientation: 'invertido',
      capturedAt: sample.capturedAt,
      byteSize: sample.blob.size,
      mimeType: sample.blob.type || 'image/jpeg',
    })
  })

  let created = 0
  let exists = 0

  for (const sample of allSamples) {
    const id = buildCaptureUploadId(
      record.cardId,
      sample.orientation,
      sample.capturedAt,
      sample.byteSize,
    )
    const queueRow: CaptureUploadQueueRecord = {
      id,
      cardId: record.cardId,
      orientation: sample.orientation,
      capturedAt: sample.capturedAt,
      byteSize: sample.byteSize,
      mimeType: sample.mimeType,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
      lastError: null,
      remotePath: null,
    }
    const result = await dbService.ensureCaptureUpload(queueRow)
    if (result === 'created') {
      created += 1
    } else {
      exists += 1
    }
  }

  return { created, exists }
}

export const processCaptureUploadQueue = async ({
  cards,
  limit = 12,
  onUploadedSample,
}: ProcessQueueOptions): Promise<CaptureUploadProcessResult> => {
  const config = getConfig()

  if (!config.enabled) {
    return {
      enabled: false,
      uploadedNow: 0,
      failedNow: 0,
      queue: await mapQueueStats(),
      message:
        'Sincronização em nuvem desativada. Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.',
    }
  }

  await cleanupLocalSamplesFromUploadedQueue()
  await dbService.resetUploadingCaptureUploads()
  const pending = await dbService.getPendingCaptureUploads(limit)
  if (!pending.length) {
    return {
      enabled: true,
      uploadedNow: 0,
      failedNow: 0,
      queue: await mapQueueStats(),
      message: 'Fila de upload em dia.',
    }
  }

  const cardNameById = new Map<number, string>(cards.map(card => [card.id, card.nome]))
  const client = getSupabaseClient(config)
  let metadataValidation: MetadataTableValidationResult | null = null

  if (config.metadataTable) {
    metadataValidation = await validateMetadataTableSchemaCached(client, config)
    if (!metadataValidation.valid) {
      return {
        enabled: true,
        uploadedNow: 0,
        failedNow: 0,
        queue: await mapQueueStats(),
        message: metadataValidation.message,
      }
    }
  }

  let uploadedNow = 0
  let failedNow = 0

  for (const item of pending) {
    const claimed = await dbService.markCaptureUploadUploading(item.id)
    if (!claimed) continue

    try {
      const blob = await dbService.getCardCaptureSampleBlob(
        item.cardId,
        item.orientation,
        item.capturedAt,
        item.byteSize,
      )

      if (!blob) {
        throw new Error(
          'Amostra local não encontrada. Recarregue os dados desta carta para reenfileirar.',
        )
      }

      const cardName = cardNameById.get(item.cardId) || `card-${item.cardId}`
      const remotePath = buildRemotePath(config, item, cardName)
      const { error: uploadError } = await client.storage
        .from(config.bucket)
        .upload(remotePath, blob, {
          upsert: true,
          contentType: blob.type || item.mimeType || 'image/jpeg',
        })
      if (uploadError) throw new Error(uploadError.message)

      if (config.metadataTable) {
        await upsertCaptureMetadata(client, config.metadataTable, {
          queue_id: item.id,
          card_id: item.cardId,
          orientation: item.orientation,
          captured_at: new Date(item.capturedAt).toISOString(),
          byte_size: item.byteSize,
          mime_type: blob.type || item.mimeType || 'image/jpeg',
          storage_path: remotePath,
          uploaded_at: new Date().toISOString(),
        })
      }

      await dbService.markCaptureUploadUploaded(item.id, remotePath)
      await dbService.removeCardCaptureSample(
        item.cardId,
        item.orientation,
        item.capturedAt,
        item.byteSize,
      )
      onUploadedSample?.({
        cardId: item.cardId,
        orientation: item.orientation,
        capturedAt: item.capturedAt,
        byteSize: item.byteSize,
      })

      uploadedNow += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const attemptCount = item.attempts + 1
      const nextAttemptAt = Date.now() + computeRetryDelayMs(attemptCount)
      await dbService.markCaptureUploadFailed(item.id, message, nextAttemptAt)
      failedNow += 1
    }
  }

  return {
    enabled: true,
    uploadedNow,
    failedNow,
    queue: await mapQueueStats(),
    message: uploadedNow
      ? `${uploadedNow} captura(s) enviada(s) para a nuvem.${metadataValidation ? ` ${metadataValidation.message}` : ''}`
      : `Nenhuma captura enviada nesta rodada.${metadataValidation ? ` ${metadataValidation.message}` : ''}`,
  }
}

export const uploadCaptureBlobDirect = async ({
  cardId,
  cardName,
  orientation,
  capturedAt,
  blob,
  queueId,
}: DirectCaptureUploadInput): Promise<DirectCaptureUploadResult> => {
  const config = getConfig()
  const finalQueueId =
    queueId || buildCaptureUploadId(cardId, orientation, capturedAt, blob.size)

  if (!config.enabled) {
    return {
      enabled: false,
      uploaded: false,
      queueId: finalQueueId,
      remotePath: null,
      message:
        'Sincronização em nuvem desativada. Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.',
    }
  }

  const client = getSupabaseClient(config)
  const metadataValidation = await validateMetadataTableSchemaCached(client, config)
  if (!metadataValidation.valid) {
    return {
      enabled: true,
      uploaded: false,
      queueId: finalQueueId,
      remotePath: null,
      message: metadataValidation.message,
    }
  }

  const remotePath = buildRemotePath(
    config,
    {
      id: finalQueueId,
      cardId,
      orientation,
      capturedAt,
      byteSize: blob.size,
      mimeType: blob.type || 'image/jpeg',
      status: 'pending',
      attempts: 0,
      nextAttemptAt: capturedAt,
      createdAt: capturedAt,
      updatedAt: capturedAt,
      lastError: null,
      remotePath: null,
    },
    cardName,
  )

  const { error: uploadError } = await client.storage
    .from(config.bucket)
    .upload(remotePath, blob, {
      upsert: true,
      contentType: blob.type || 'image/jpeg',
    })
  if (uploadError) {
    return {
      enabled: true,
      uploaded: false,
      queueId: finalQueueId,
      remotePath: null,
      message: `Falha no upload para o bucket ${config.bucket}: ${uploadError.message}`,
    }
  }

  if (config.metadataTable) {
    await upsertCaptureMetadata(client, config.metadataTable, {
      queue_id: finalQueueId,
      card_id: cardId,
      orientation,
      captured_at: new Date(capturedAt).toISOString(),
      byte_size: blob.size,
      mime_type: blob.type || 'image/jpeg',
      storage_path: remotePath,
      uploaded_at: new Date().toISOString(),
    })
  }

  return {
    enabled: true,
    uploaded: true,
    queueId: finalQueueId,
    remotePath,
    message: `Captura enviada para nuvem (${config.bucket}/${config.folderPrefix}).`,
  }
}

export const fetchRemoteCardCaptureCounts = async (
  cardId: number,
): Promise<RemoteCardCaptureCountsResult> => {
  const config = getConfig()
  const emptyCounts: UploadedCardCaptureCounts = { vertical: 0, invertido: 0 }

  if (!config.enabled) {
    return {
      available: false,
      counts: emptyCounts,
      source: 'none',
      message:
        'Supabase não configurado para contador remoto. Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.',
    }
  }

  if (!config.metadataTable) {
    return {
      available: false,
      counts: emptyCounts,
      source: 'none',
      message:
        'Contador remoto desativado: configure VITE_SUPABASE_METADATA_TABLE para contagem real na nuvem.',
    }
  }

  const client = getSupabaseClient(config)
  const validation = await validateMetadataTableSchema(client, config.metadataTable)
  if (!validation.valid) {
    return {
      available: false,
      counts: emptyCounts,
      source: 'none',
      message: validation.message,
    }
  }

  const { data, error } = await client
    .from(config.metadataTable)
    .select('queue_id,orientation')
    .eq('card_id', cardId)

  if (error) {
    throw new Error(`Falha ao consultar ${config.metadataTable}: ${error.message}`)
  }

  const counts: UploadedCardCaptureCounts = { vertical: 0, invertido: 0 }
  const rows = Array.isArray(data) ? data : []
  const seenQueueIds = new Set<string>()

  rows.forEach((row, index) => {
    const queueId = String((row as { queue_id?: unknown }).queue_id || '').trim()
    if (queueId) {
      if (seenQueueIds.has(queueId)) return
      seenQueueIds.add(queueId)
    } else if (seenQueueIds.has(`__row-${index}`)) {
      return
    } else {
      seenQueueIds.add(`__row-${index}`)
    }

    const value = String((row as { orientation?: unknown }).orientation || '')
      .trim()
      .toLowerCase()
    if (
      value.includes('invert') ||
      value.includes('horiz') ||
      value.includes('revers')
    ) {
      counts.invertido += 1
      return
    }
    counts.vertical += 1
  })

  return {
    available: true,
    counts,
    source: 'metadata',
    message: `Contador remoto ativo via ${config.metadataTable} (deduplicado por queue_id).`,
  }
}
