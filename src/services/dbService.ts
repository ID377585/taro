import { SpreadingSession } from '../types'

const DB_NAME = 'TaroAppDB'
const DB_VERSION = 3
const SESSIONS_STORE_NAME = 'sessions'
const CARD_CAPTURES_STORE_NAME = 'card-captures'
const CAPTURE_UPLOAD_QUEUE_STORE_NAME = 'capture-upload-queue'

export type CardCaptureOrientation = 'vertical' | 'invertido'
export type CaptureUploadStatus = 'pending' | 'uploading' | 'failed' | 'uploaded'

export interface PersistedCardCaptureItem {
  blob: Blob
  capturedAt: number
}

export interface PersistedCardCaptureRecord {
  cardId: number
  vertical: PersistedCardCaptureItem[]
  invertido: PersistedCardCaptureItem[]
  updatedAt: number
}

export interface CaptureUploadQueueRecord {
  id: string
  cardId: number
  orientation: CardCaptureOrientation
  capturedAt: number
  byteSize: number
  mimeType: string
  status: CaptureUploadStatus
  attempts: number
  nextAttemptAt: number
  createdAt: number
  updatedAt: number
  lastError: string | null
  remotePath: string | null
}

export interface CaptureUploadQueueStats {
  total: number
  pending: number
  uploading: number
  failed: number
  uploaded: number
}

export interface UploadedCardCaptureCounts {
  vertical: number
  invertido: number
}

export const buildCaptureUploadId = (
  cardId: number,
  orientation: CardCaptureOrientation,
  capturedAt: number,
  byteSize: number,
) => `${cardId}:${orientation}:${capturedAt}:${byteSize}`

export class DBService {
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = e => {
        const db = (e.target as IDBOpenDBRequest).result

        if (!db.objectStoreNames.contains(SESSIONS_STORE_NAME)) {
          const store = db.createObjectStore(SESSIONS_STORE_NAME, { keyPath: 'id' })
          store.createIndex('timestamp', 'timestamp', { unique: false })
          store.createIndex('spreadId', 'spreadId', { unique: false })
        }

        if (!db.objectStoreNames.contains(CARD_CAPTURES_STORE_NAME)) {
          const store = db.createObjectStore(CARD_CAPTURES_STORE_NAME, {
            keyPath: 'cardId',
          })
          store.createIndex('updatedAt', 'updatedAt', { unique: false })
        }

        if (!db.objectStoreNames.contains(CAPTURE_UPLOAD_QUEUE_STORE_NAME)) {
          const store = db.createObjectStore(CAPTURE_UPLOAD_QUEUE_STORE_NAME, {
            keyPath: 'id',
          })
          store.createIndex('status', 'status', { unique: false })
          store.createIndex('nextAttemptAt', 'nextAttemptAt', { unique: false })
          store.createIndex('cardId', 'cardId', { unique: false })
          store.createIndex('updatedAt', 'updatedAt', { unique: false })
        }
      }
    })
  }

  async saveSession(session: SpreadingSession): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([SESSIONS_STORE_NAME], 'readwrite')
      const store = transaction.objectStore(SESSIONS_STORE_NAME)
      const request = store.put(session)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async getSession(id: string): Promise<SpreadingSession | null> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([SESSIONS_STORE_NAME], 'readonly')
      const store = transaction.objectStore(SESSIONS_STORE_NAME)
      const request = store.get(id)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result || null)
    })
  }

  async getAllSessions(): Promise<SpreadingSession[]> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([SESSIONS_STORE_NAME], 'readonly')
      const store = transaction.objectStore(SESSIONS_STORE_NAME)
      const request = store.getAll()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }

  async deleteSession(id: string): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([SESSIONS_STORE_NAME], 'readwrite')
      const store = transaction.objectStore(SESSIONS_STORE_NAME)
      const request = store.delete(id)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async saveCardCapture(record: PersistedCardCaptureRecord): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CARD_CAPTURES_STORE_NAME], 'readwrite')
      const store = transaction.objectStore(CARD_CAPTURES_STORE_NAME)
      const request = store.put(record)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async getCardCapture(cardId: number): Promise<PersistedCardCaptureRecord | null> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CARD_CAPTURES_STORE_NAME], 'readonly')
      const store = transaction.objectStore(CARD_CAPTURES_STORE_NAME)
      const request = store.get(cardId)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result || null)
    })
  }

  async getAllCardCaptures(): Promise<PersistedCardCaptureRecord[]> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CARD_CAPTURES_STORE_NAME], 'readonly')
      const store = transaction.objectStore(CARD_CAPTURES_STORE_NAME)
      const request = store.getAll()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }

  async deleteCardCapture(cardId: number): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CARD_CAPTURES_STORE_NAME], 'readwrite')
      const store = transaction.objectStore(CARD_CAPTURES_STORE_NAME)
      const request = store.delete(cardId)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async getCardCaptureSampleBlob(
    cardId: number,
    orientation: CardCaptureOrientation,
    capturedAt: number,
    byteSize?: number,
  ): Promise<Blob | null> {
    const record = await this.getCardCapture(cardId)
    if (!record) return null

    const item = record[orientation].find(sample => {
      if (sample.capturedAt !== capturedAt) return false
      if (byteSize === undefined) return true
      return sample.blob.size === byteSize
    })

    return item?.blob || null
  }

  async removeCardCaptureSample(
    cardId: number,
    orientation: CardCaptureOrientation,
    capturedAt: number,
    byteSize?: number,
  ): Promise<boolean> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CARD_CAPTURES_STORE_NAME], 'readwrite')
      const store = transaction.objectStore(CARD_CAPTURES_STORE_NAME)
      const getRequest = store.get(cardId)

      getRequest.onerror = () => reject(getRequest.error)
      getRequest.onsuccess = () => {
        const record = getRequest.result as PersistedCardCaptureRecord | undefined
        if (!record) {
          resolve(false)
          return
        }

        const targetList = [...record[orientation]]
        const index = targetList.findIndex(sample => {
          if (sample.capturedAt !== capturedAt) return false
          if (byteSize === undefined) return true
          return sample.blob.size === byteSize
        })

        if (index < 0) {
          resolve(false)
          return
        }

        targetList.splice(index, 1)
        const nextRecord: PersistedCardCaptureRecord = {
          ...record,
          [orientation]: targetList,
          updatedAt: Date.now(),
        }

        const hasRemaining =
          nextRecord.vertical.length > 0 || nextRecord.invertido.length > 0
        const nextRequest = hasRemaining
          ? store.put(nextRecord)
          : store.delete(cardId)

        nextRequest.onerror = () => reject(nextRequest.error)
        nextRequest.onsuccess = () => resolve(true)
      }
    })
  }

  async ensureCaptureUpload(
    record: CaptureUploadQueueRecord,
  ): Promise<'created' | 'exists'> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CAPTURE_UPLOAD_QUEUE_STORE_NAME], 'readwrite')
      const store = transaction.objectStore(CAPTURE_UPLOAD_QUEUE_STORE_NAME)
      const getRequest = store.get(record.id)

      getRequest.onerror = () => reject(getRequest.error)
      getRequest.onsuccess = () => {
        if (getRequest.result) {
          resolve('exists')
          return
        }

        const addRequest = store.add(record)
        addRequest.onerror = () => reject(addRequest.error)
        addRequest.onsuccess = () => resolve('created')
      }
    })
  }

  async getPendingCaptureUploads(
    limit = 24,
    now = Date.now(),
  ): Promise<CaptureUploadQueueRecord[]> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CAPTURE_UPLOAD_QUEUE_STORE_NAME], 'readonly')
      const store = transaction.objectStore(CAPTURE_UPLOAD_QUEUE_STORE_NAME)
      const request = store.getAll()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const rows = (request.result as CaptureUploadQueueRecord[])
          .filter(item => {
            if (item.status === 'pending') return true
            if (item.status === 'failed') return item.nextAttemptAt <= now
            return false
          })
          .sort((a, b) => {
            if (a.nextAttemptAt !== b.nextAttemptAt) {
              return a.nextAttemptAt - b.nextAttemptAt
            }
            return a.createdAt - b.createdAt
          })
          .slice(0, limit)

        resolve(rows)
      }
    })
  }

  async getCaptureUploadsByStatus(
    status: CaptureUploadStatus,
    limit = 500,
  ): Promise<CaptureUploadQueueRecord[]> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CAPTURE_UPLOAD_QUEUE_STORE_NAME], 'readonly')
      const store = transaction.objectStore(CAPTURE_UPLOAD_QUEUE_STORE_NAME)
      const request = store.getAll()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const rows = (request.result as CaptureUploadQueueRecord[])
          .filter(item => item.status === status)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, limit)
        resolve(rows)
      }
    })
  }

  async resetUploadingCaptureUploads(now = Date.now()): Promise<number> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CAPTURE_UPLOAD_QUEUE_STORE_NAME], 'readwrite')
      const store = transaction.objectStore(CAPTURE_UPLOAD_QUEUE_STORE_NAME)
      const request = store.getAll()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const rows = request.result as CaptureUploadQueueRecord[]
        const uploading = rows.filter(item => item.status === 'uploading')
        if (!uploading.length) {
          resolve(0)
          return
        }

        let completed = 0
        uploading.forEach(item => {
          const nextItem: CaptureUploadQueueRecord = {
            ...item,
            status: 'failed',
            updatedAt: now,
            nextAttemptAt: now,
            lastError: item.lastError || 'Upload interrompido. Reagendado automaticamente.',
          }
          const putRequest = store.put(nextItem)
          putRequest.onerror = () => reject(putRequest.error)
          putRequest.onsuccess = () => {
            completed += 1
            if (completed === uploading.length) {
              resolve(uploading.length)
            }
          }
        })
      }
    })
  }

  async markCaptureUploadUploading(id: string, now = Date.now()): Promise<boolean> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CAPTURE_UPLOAD_QUEUE_STORE_NAME], 'readwrite')
      const store = transaction.objectStore(CAPTURE_UPLOAD_QUEUE_STORE_NAME)
      const getRequest = store.get(id)

      getRequest.onerror = () => reject(getRequest.error)
      getRequest.onsuccess = () => {
        const row = getRequest.result as CaptureUploadQueueRecord | undefined
        if (!row) {
          resolve(false)
          return
        }
        if (row.status === 'uploaded') {
          resolve(false)
          return
        }

        const nextRow: CaptureUploadQueueRecord = {
          ...row,
          status: 'uploading',
          attempts: row.attempts + 1,
          updatedAt: now,
        }
        const putRequest = store.put(nextRow)
        putRequest.onerror = () => reject(putRequest.error)
        putRequest.onsuccess = () => resolve(true)
      }
    })
  }

  async markCaptureUploadUploaded(
    id: string,
    remotePath: string,
    now = Date.now(),
  ): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CAPTURE_UPLOAD_QUEUE_STORE_NAME], 'readwrite')
      const store = transaction.objectStore(CAPTURE_UPLOAD_QUEUE_STORE_NAME)
      const getRequest = store.get(id)

      getRequest.onerror = () => reject(getRequest.error)
      getRequest.onsuccess = () => {
        const row = getRequest.result as CaptureUploadQueueRecord | undefined
        if (!row) {
          resolve()
          return
        }

        const nextRow: CaptureUploadQueueRecord = {
          ...row,
          status: 'uploaded',
          updatedAt: now,
          nextAttemptAt: now,
          lastError: null,
          remotePath,
        }
        const putRequest = store.put(nextRow)
        putRequest.onerror = () => reject(putRequest.error)
        putRequest.onsuccess = () => resolve()
      }
    })
  }

  async markCaptureUploadFailed(
    id: string,
    errorMessage: string,
    nextAttemptAt: number,
    now = Date.now(),
  ): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CAPTURE_UPLOAD_QUEUE_STORE_NAME], 'readwrite')
      const store = transaction.objectStore(CAPTURE_UPLOAD_QUEUE_STORE_NAME)
      const getRequest = store.get(id)

      getRequest.onerror = () => reject(getRequest.error)
      getRequest.onsuccess = () => {
        const row = getRequest.result as CaptureUploadQueueRecord | undefined
        if (!row) {
          resolve()
          return
        }

        const nextRow: CaptureUploadQueueRecord = {
          ...row,
          status: 'failed',
          updatedAt: now,
          nextAttemptAt,
          lastError: errorMessage,
        }
        const putRequest = store.put(nextRow)
        putRequest.onerror = () => reject(putRequest.error)
        putRequest.onsuccess = () => resolve()
      }
    })
  }

  async getCaptureUploadQueueStats(): Promise<CaptureUploadQueueStats> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CAPTURE_UPLOAD_QUEUE_STORE_NAME], 'readonly')
      const store = transaction.objectStore(CAPTURE_UPLOAD_QUEUE_STORE_NAME)
      const request = store.getAll()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const stats: CaptureUploadQueueStats = {
          total: 0,
          pending: 0,
          uploading: 0,
          failed: 0,
          uploaded: 0,
        }
        const rows = request.result as CaptureUploadQueueRecord[]
        rows.forEach(row => {
          stats.total += 1
          stats[row.status] += 1
        })
        resolve(stats)
      }
    })
  }

  async getCaptureUploadCountsByCard(
    statuses: CaptureUploadStatus[],
  ): Promise<Record<number, UploadedCardCaptureCounts>> {
    if (!this.db) await this.init()

    const statusSet = new Set<CaptureUploadStatus>(statuses)
    if (statusSet.size === 0) return {}

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CAPTURE_UPLOAD_QUEUE_STORE_NAME], 'readonly')
      const store = transaction.objectStore(CAPTURE_UPLOAD_QUEUE_STORE_NAME)
      const request = store.getAll()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const map: Record<number, UploadedCardCaptureCounts> = {}
        const rows = request.result as CaptureUploadQueueRecord[]
        rows.forEach(row => {
          if (!statusSet.has(row.status)) return
          if (!map[row.cardId]) {
            map[row.cardId] = { vertical: 0, invertido: 0 }
          }
          map[row.cardId][row.orientation] += 1
        })
        resolve(map)
      }
    })
  }

  async getUploadedCaptureCountsByCard(): Promise<Record<number, UploadedCardCaptureCounts>> {
    return this.getCaptureUploadCountsByCard(['uploaded'])
  }
}

export const dbService = new DBService()
