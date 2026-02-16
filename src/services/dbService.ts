import { SpreadingSession } from '../types'

const DB_NAME = 'TaroAppDB'
const DB_VERSION = 2
const SESSIONS_STORE_NAME = 'sessions'
const CARD_CAPTURES_STORE_NAME = 'card-captures'

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
}

export const dbService = new DBService()
