import { ChangeEvent, FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card } from '../types'
import { useCamera } from '../hooks/useCamera'
import { normalizeLabelValue } from '../services/labelService'
import {
  CardCaptureOrientation,
  dbService,
  PersistedCardCaptureRecord,
  UploadedCardCaptureCounts,
} from '../services/dbService'
import {
  CaptureUploadQueueSummary,
  cleanupLocalSamplesFromUploadedQueue,
  fetchRemoteCardCaptureCounts,
  getCaptureCloudConfigStatus,
  processCaptureUploadQueue,
  enqueueCardCaptureRecordUploads,
} from '../services/captureUploadService'
import CameraView from './CameraView'
import './CardRegistrationView.css'

type Orientation = 'vertical' | 'invertido'

interface CaptureItem {
  id: string
  blob: Blob
  objectUrl: string
  capturedAt: number
}

interface CardCaptureBucket {
  vertical: CaptureItem[]
  invertido: CaptureItem[]
}

interface CardRegistrationViewProps {
  cards: Card[]
  onBack: () => void
}

type LocalSyncState = 'idle' | 'saving' | 'saved' | 'error'
type CloudSyncState = 'idle' | 'syncing' | 'disabled' | 'error'
type CloudCounterSource = 'metadata' | 'local-queue'

const TARGET_PER_ORIENTATION = 60
const ACCEPTED_IMAGE_EXTENSIONS = [
  '.heic',
  '.heif',
  '.hevc',
  '.jpg',
  '.jpeg',
  '.png',
  '.zip',
]
const IMAGE_FILE_EXTENSIONS = ['.heic', '.heif', '.hevc', '.jpg', '.jpeg', '.png']

const createEmptyBucket = (): CardCaptureBucket => ({
  vertical: [],
  invertido: [],
})
const EMPTY_CAPTURE_COUNTS: UploadedCardCaptureCounts = { vertical: 0, invertido: 0 }

const isHeifLike = (name: string, mime: string) => {
  const lowerName = name.toLowerCase()
  const lowerMime = mime.toLowerCase()
  return (
    lowerName.endsWith('.heic') ||
    lowerName.endsWith('.heif') ||
    lowerName.endsWith('.hevc') ||
    lowerMime.includes('heic') ||
    lowerMime.includes('heif') ||
    lowerMime.includes('hevc')
  )
}

const isZipFile = (file: File) => {
  const lowerName = file.name.toLowerCase()
  const lowerMime = file.type.toLowerCase()
  return (
    lowerName.endsWith('.zip') ||
    lowerMime === 'application/zip' ||
    lowerMime === 'application/x-zip-compressed'
  )
}

const getExtension = (name: string) => {
  const lowerName = name.toLowerCase()
  const dotIndex = lowerName.lastIndexOf('.')
  return dotIndex >= 0 ? lowerName.slice(dotIndex) : ''
}

const inferOrientationFromZipEntry = (entryName: string): Orientation | null => {
  const normalized = normalizeLabelValue(entryName)
  const hasHorizontalToken =
    normalized.includes('invertido') ||
    normalized.includes('horizontal') ||
    normalized.includes('inverted') ||
    normalized.includes('reversed')
  if (hasHorizontalToken) return 'invertido'

  const hasVerticalToken =
    normalized.includes('vertical') ||
    normalized.includes('upright') ||
    normalized.includes('normal')
  if (hasVerticalToken) return 'vertical'

  return null
}

const convertImageBlobToJpeg = async (blob: Blob) => {
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('Falha ao converter imagem para JPEG.')
  }
  context.drawImage(bitmap, 0, 0)
  bitmap.close()

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      result => {
        if (!result) {
          reject(new Error('Falha ao gerar JPEG da imagem importada.'))
          return
        }
        resolve(result)
      },
      'image/jpeg',
      0.92,
    )
  })
}

const revokeBucketUrls = (bucket: CardCaptureBucket) => {
  bucket.vertical.forEach(item => URL.revokeObjectURL(item.objectUrl))
  bucket.invertido.forEach(item => URL.revokeObjectURL(item.objectUrl))
}

const createCaptureItemFromBlob = (blob: Blob, capturedAt = Date.now()): CaptureItem => ({
  id: crypto.randomUUID(),
  blob,
  objectUrl: URL.createObjectURL(blob),
  capturedAt,
})

const isBucketEmpty = (bucket: CardCaptureBucket) =>
  bucket.vertical.length === 0 && bucket.invertido.length === 0

const getBucketFingerprint = (bucket: CardCaptureBucket) =>
  [
    `v:${bucket.vertical.length}:${bucket.vertical.map(item => item.capturedAt).join(',')}`,
    `i:${bucket.invertido.length}:${bucket.invertido.map(item => item.capturedAt).join(',')}`,
  ].join('|')

const serializeBucket = (
  cardId: number,
  bucket: CardCaptureBucket,
): PersistedCardCaptureRecord => ({
  cardId,
  vertical: bucket.vertical.map(item => ({
    blob: item.blob,
    capturedAt: item.capturedAt,
  })),
  invertido: bucket.invertido.map(item => ({
    blob: item.blob,
    capturedAt: item.capturedAt,
  })),
  updatedAt: Date.now(),
})

const hydrateBucket = (record: PersistedCardCaptureRecord): CardCaptureBucket => ({
  vertical: record.vertical
    .map(item => createCaptureItemFromBlob(item.blob, item.capturedAt))
    .sort((a, b) => a.capturedAt - b.capturedAt),
  invertido: record.invertido
    .map(item => createCaptureItemFromBlob(item.blob, item.capturedAt))
    .sort((a, b) => a.capturedAt - b.capturedAt),
})

const captureFromVideo = async (video: HTMLVideoElement) => {
  const sourceWidth = video.videoWidth
  const sourceHeight = video.videoHeight
  if (!sourceWidth || !sourceHeight) {
    throw new Error('A câmera ainda não está pronta para capturar.')
  }

  const targetWidth = 360
  const targetHeight = 540
  const targetRatio = targetWidth / targetHeight
  const sourceRatio = sourceWidth / sourceHeight

  let sx = 0
  let sy = 0
  let sw = sourceWidth
  let sh = sourceHeight

  if (sourceRatio > targetRatio) {
    sw = Math.floor(sourceHeight * targetRatio)
    sx = Math.floor((sourceWidth - sw) / 2)
  } else {
    sh = Math.floor(sourceWidth / targetRatio)
    sy = Math.floor((sourceHeight - sh) / 2)
  }

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Não foi possível inicializar o canvas de captura.')

  context.drawImage(video, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (!blob) {
          reject(new Error('Falha ao capturar imagem da câmera.'))
          return
        }
        resolve(blob)
      },
      'image/jpeg',
      0.92,
    )
  })
}

const waitForVideoReady = async (video: HTMLVideoElement, timeoutMs = 1500) => {
  if (video.videoWidth > 0 && video.videoHeight > 0) return

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup()
      reject(new Error('A câmera ainda não está pronta para captura.'))
    }, timeoutMs)

    const onReady = () => {
      if (!video.videoWidth || !video.videoHeight) return
      cleanup()
      resolve()
    }

    const cleanup = () => {
      window.clearTimeout(timeoutId)
      video.removeEventListener('loadedmetadata', onReady)
      video.removeEventListener('canplay', onReady)
      video.removeEventListener('playing', onReady)
    }

    video.addEventListener('loadedmetadata', onReady)
    video.addEventListener('canplay', onReady)
    video.addEventListener('playing', onReady)
    onReady()
  })
}

interface ZipExtractionResult {
  vertical: Blob[]
  invertido: Blob[]
  unknownOrientation: number
  errors: number
}

const CardRegistrationView: FC<CardRegistrationViewProps> = ({ cards, onBack }) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const capturesRef = useRef<Record<number, CardCaptureBucket>>({})
  const persistedSnapshotRef = useRef<Map<number, string>>(new Map())
  const uploadedCountsRef = useRef<Record<number, UploadedCardCaptureCounts>>({})
  const isProcessingCloudQueueRef = useRef(false)

  const [selectedCardId, setSelectedCardId] = useState<string>('')
  const [orientation, setOrientation] = useState<Orientation>('vertical')
  const [capturesByCard, setCapturesByCard] = useState<Record<number, CardCaptureBucket>>(
    {},
  )
  const [feedback, setFeedback] = useState<string>('')
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isHydratingCaptures, setIsHydratingCaptures] = useState(true)
  const [localSyncState, setLocalSyncState] = useState<LocalSyncState>('idle')
  const [lastLocalSyncAt, setLastLocalSyncAt] = useState<number | null>(null)
  const [uploadedCountsByCard, setUploadedCountsByCard] = useState<
    Record<number, UploadedCardCaptureCounts>
  >({})
  const [pendingCountsByCard, setPendingCountsByCard] = useState<
    Record<number, UploadedCardCaptureCounts>
  >({})
  const [selectedCardCloudCounts, setSelectedCardCloudCounts] =
    useState<UploadedCardCaptureCounts | null>(null)
  const [cloudCounterSource, setCloudCounterSource] =
    useState<CloudCounterSource>('local-queue')
  const [cloudCounterHint, setCloudCounterHint] = useState('')
  const [cloudSyncState, setCloudSyncState] = useState<CloudSyncState>('idle')
  const [cloudQueueStats, setCloudQueueStats] = useState<CaptureUploadQueueSummary>({
    total: 0,
    pending: 0,
    uploading: 0,
    failed: 0,
    uploaded: 0,
  })
  const [cloudSyncMessage, setCloudSyncMessage] = useState('')
  const [isPanelExpanded, setIsPanelExpanded] = useState(false)
  const [showCaptureGuidance, setShowCaptureGuidance] = useState(true)
  const [cloudUploadKick, setCloudUploadKick] = useState(0)
  const importInputRef = useRef<HTMLInputElement>(null)

  const {
    devices,
    currentDeviceId,
    isActive,
    isStarting,
    error: cameraError,
    startCamera,
    switchCamera,
  } = useCamera(videoRef)

  const selectedCard = useMemo(
    () => cards.find(card => card.id === Number(selectedCardId)) || null,
    [cards, selectedCardId],
  )

  const currentBucket = useMemo(() => {
    if (!selectedCard) return createEmptyBucket()
    return capturesByCard[selectedCard.id] ?? createEmptyBucket()
  }, [capturesByCard, selectedCard])

  const localUploadedCountForSelectedCard = useMemo(
    () =>
      selectedCard
        ? uploadedCountsByCard[selectedCard.id] || EMPTY_CAPTURE_COUNTS
        : EMPTY_CAPTURE_COUNTS,
    [selectedCard, uploadedCountsByCard],
  )

  const localPendingCountForSelectedCard = useMemo(
    () =>
      selectedCard
        ? pendingCountsByCard[selectedCard.id] || EMPTY_CAPTURE_COUNTS
        : EMPTY_CAPTURE_COUNTS,
    [pendingCountsByCard, selectedCard],
  )

  const getMetadataBasedCount = useCallback(
    (
      targetOrientation: Orientation,
      bucketOverride?: CardCaptureBucket,
      pendingOverride?: UploadedCardCaptureCounts,
      cloudOverride?: UploadedCardCaptureCounts | null,
    ) => {
      const cloudCounts = cloudOverride || selectedCardCloudCounts || EMPTY_CAPTURE_COUNTS
      const pendingCounts = pendingOverride || localPendingCountForSelectedCard
      const inMemoryCount = (bucketOverride || currentBucket)[targetOrientation].length
      const queuedLocalCount = pendingCounts[targetOrientation]
      return cloudCounts[targetOrientation] + Math.max(queuedLocalCount, inMemoryCount)
    },
    [currentBucket, localPendingCountForSelectedCard, selectedCardCloudCounts],
  )

  const getLocalQueueBasedCount = useCallback(
    (targetOrientation: Orientation, bucketOverride?: CardCaptureBucket) =>
      (bucketOverride || currentBucket)[targetOrientation].length +
      localUploadedCountForSelectedCard[targetOrientation],
    [currentBucket, localUploadedCountForSelectedCard],
  )

  const currentVerticalCount =
    cloudCounterSource === 'metadata'
      ? getMetadataBasedCount('vertical')
      : getLocalQueueBasedCount('vertical')
  const currentInvertedCount =
    cloudCounterSource === 'metadata'
      ? getMetadataBasedCount('invertido')
      : getLocalQueueBasedCount('invertido')
  const isCardReady =
    currentVerticalCount >= TARGET_PER_ORIENTATION &&
    currentInvertedCount >= TARGET_PER_ORIENTATION
  const orientationLabel = orientation === 'vertical' ? 'vertical' : 'horizontal'

  useEffect(() => {
    if (
      orientation === 'vertical' &&
      currentVerticalCount >= TARGET_PER_ORIENTATION &&
      currentInvertedCount < TARGET_PER_ORIENTATION
    ) {
      setOrientation('invertido')
      setFeedback(
        `Vertical ${TARGET_PER_ORIENTATION}/${TARGET_PER_ORIENTATION} concluída. Continue na horizontal.`,
      )
    }
  }, [currentInvertedCount, currentVerticalCount, orientation])

  useEffect(() => {
    setShowCaptureGuidance(true)
    const timerId = window.setTimeout(() => {
      setShowCaptureGuidance(false)
    }, 2000)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [orientation])

  useEffect(() => {
    capturesRef.current = capturesByCard
  }, [capturesByCard])

  useEffect(() => {
    uploadedCountsRef.current = uploadedCountsByCard
  }, [uploadedCountsByCard])

  const dropLocalUploadedSample = useCallback(
    ({
      cardId,
      orientation,
      capturedAt,
      byteSize,
    }: {
      cardId: number
      orientation: CardCaptureOrientation
      capturedAt: number
      byteSize: number
    }) => {
      setCapturesByCard(prev => {
        const bucket = prev[cardId]
        if (!bucket) return prev

        const list = bucket[orientation]
        const index = list.findIndex(
          item => item.capturedAt === capturedAt && item.blob.size === byteSize,
        )
        if (index < 0) return prev

        const removed = list[index]
        URL.revokeObjectURL(removed.objectUrl)
        const nextList = [...list.slice(0, index), ...list.slice(index + 1)]
        const nextBucket: CardCaptureBucket = {
          ...bucket,
          [orientation]: nextList,
        }

        if (isBucketEmpty(nextBucket)) {
          const next = { ...prev }
          delete next[cardId]
          return next
        }

        return {
          ...prev,
          [cardId]: nextBucket,
        }
      })
    },
    [],
  )

  useEffect(() => {
    let isMounted = true

    const loadPersistedCaptures = async () => {
      setIsHydratingCaptures(true)
      try {
        await dbService.init()
        await cleanupLocalSamplesFromUploadedQueue()
        const [records, uploadedCounts, pendingCounts, queueStats] = await Promise.all([
          dbService.getAllCardCaptures(),
          dbService.getUploadedCaptureCountsByCard(),
          dbService.getCaptureUploadCountsByCard(['pending', 'uploading', 'failed']),
          dbService.getCaptureUploadQueueStats(),
        ])
        if (!isMounted) return

        const hydrated: Record<number, CardCaptureBucket> = {}
        const nextSnapshot = new Map<number, string>()

        records.forEach(record => {
          const bucket = hydrateBucket(record)
          if (isBucketEmpty(bucket)) return
          hydrated[record.cardId] = bucket
          nextSnapshot.set(record.cardId, getBucketFingerprint(bucket))
        })

        setCapturesByCard(hydrated)
        setUploadedCountsByCard(uploadedCounts)
        setPendingCountsByCard(pendingCounts)
        setCloudQueueStats({
          total: queueStats.total,
          pending: queueStats.pending,
          uploading: queueStats.uploading,
          failed: queueStats.failed,
          uploaded: queueStats.uploaded,
        })

        const cloudConfig = getCaptureCloudConfigStatus()
        if (!cloudConfig.enabled) {
          setCloudSyncState('disabled')
          setCloudCounterSource('local-queue')
          setCloudCounterHint(
            `Contador remoto indisponível: configure ${cloudConfig.missing.join(', ')}.`,
          )
          setCloudSyncMessage(
            `Nuvem desativada: configure ${cloudConfig.missing.join(', ')}.`,
          )
        } else {
          setCloudSyncState('idle')
          setCloudCounterHint(
            cloudConfig.metadataTable
              ? `Contador remoto usando ${cloudConfig.metadataTable}.`
              : 'Contador remoto desativado: configure VITE_SUPABASE_METADATA_TABLE.',
          )
          setCloudSyncMessage(
            `Supabase ativo no bucket "${cloudConfig.bucket}" (${cloudConfig.folderPrefix}).`,
          )
        }
        persistedSnapshotRef.current = nextSnapshot
      } catch (err) {
        console.error('Erro ao carregar capturas salvas:', err)
        if (isMounted) {
          setFeedback('Não foi possível carregar as capturas salvas no dispositivo.')
          setLocalSyncState('error')
        }
      } finally {
        if (isMounted) {
          setIsHydratingCaptures(false)
        }
      }
    }

    void loadPersistedCaptures()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (isHydratingCaptures) return

    let isMounted = true

    const refreshRemoteCounter = async () => {
      const cardId = Number(selectedCardId)
      if (!Number.isFinite(cardId)) {
        if (isMounted) {
          setSelectedCardCloudCounts(null)
          setCloudCounterSource('local-queue')
          setCloudCounterHint('')
        }
        return
      }

      try {
        const result = await fetchRemoteCardCaptureCounts(cardId)
        if (!isMounted) return

        if (result.available) {
          setSelectedCardCloudCounts(result.counts)
          setCloudCounterSource('metadata')
          setCloudCounterHint(result.message)
          return
        }

        setSelectedCardCloudCounts(null)
        setCloudCounterSource('local-queue')
        setCloudCounterHint(result.message)
      } catch (error) {
        console.error('Falha ao consultar contador remoto no Supabase:', error)
        if (!isMounted) return
        setSelectedCardCloudCounts(previous => previous || EMPTY_CAPTURE_COUNTS)
        setCloudCounterSource('metadata')
        setCloudCounterHint(
          error instanceof Error
            ? `Falha ao consultar contador remoto: ${error.message}`
            : 'Falha ao consultar contador remoto.',
        )
      }
    }

    const refreshSafe = () => {
      void refreshRemoteCounter()
    }

    refreshSafe()
    const intervalId = window.setInterval(refreshSafe, 5_000)
    window.addEventListener('focus', refreshSafe)
    window.addEventListener('online', refreshSafe)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
      window.removeEventListener('focus', refreshSafe)
      window.removeEventListener('online', refreshSafe)
    }
  }, [isHydratingCaptures, selectedCardId])

  useEffect(() => {
    if (isHydratingCaptures) return

    const timerId = window.setTimeout(() => {
      void (async () => {
        try {
          await dbService.init()
          const nextSnapshot = new Map<number, string>()
          const currentSnapshot = persistedSnapshotRef.current
          const activeCardIds = new Set<number>()
          let hasChangesToPersist = false

          const markSyncStarted = () => {
            if (hasChangesToPersist) return
            hasChangesToPersist = true
            setLocalSyncState('saving')
          }

          for (const [cardIdKey, bucket] of Object.entries(capturesByCard)) {
            const cardId = Number(cardIdKey)
            if (!Number.isFinite(cardId)) continue

            activeCardIds.add(cardId)
            if (isBucketEmpty(bucket)) {
              if (currentSnapshot.has(cardId)) {
                markSyncStarted()
                await dbService.deleteCardCapture(cardId)
              }
              continue
            }

            const fingerprint = getBucketFingerprint(bucket)
            nextSnapshot.set(cardId, fingerprint)

            if (currentSnapshot.get(cardId) !== fingerprint) {
              markSyncStarted()
              const serialized = serializeBucket(cardId, bucket)
              await dbService.saveCardCapture(serialized)
              await enqueueCardCaptureRecordUploads(serialized)
            }
          }

          for (const previousCardId of currentSnapshot.keys()) {
            if (!activeCardIds.has(previousCardId)) {
              markSyncStarted()
              await dbService.deleteCardCapture(previousCardId)
            }
          }

          persistedSnapshotRef.current = nextSnapshot

          if (hasChangesToPersist) {
            const [uploadedCounts, pendingCounts] = await Promise.all([
              dbService.getUploadedCaptureCountsByCard(),
              dbService.getCaptureUploadCountsByCard(['pending', 'uploading', 'failed']),
            ])
            setUploadedCountsByCard(uploadedCounts)
            setPendingCountsByCard(pendingCounts)
            setLocalSyncState('saved')
            setLastLocalSyncAt(Date.now())
          }
        } catch (err) {
          console.error('Erro ao sincronizar capturas no IndexedDB:', err)
          setLocalSyncState('error')
          setFeedback('Falha ao salvar capturas localmente. Verifique espaço do navegador.')
        }
      })()
    }, 250)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [capturesByCard, isHydratingCaptures])

  useEffect(() => {
    if (isHydratingCaptures) return

    let isMounted = true

    const runQueue = async () => {
      if (isProcessingCloudQueueRef.current) return
      isProcessingCloudQueueRef.current = true

      try {
        setCloudSyncState(prev => (prev === 'disabled' ? prev : 'syncing'))
        const result = await processCaptureUploadQueue({
          cards,
          onUploadedSample: payload => {
            if (!isMounted) return
            dropLocalUploadedSample(payload)
          },
        })
        if (!isMounted) return

        setCloudQueueStats(result.queue)
        setCloudSyncMessage(result.message)
        setCloudSyncState(() => {
          if (!result.enabled) return 'disabled'
          if (result.failedNow > 0) return 'error'
          return 'idle'
        })

        const [uploadedCounts, pendingCounts] = await Promise.all([
          dbService.getUploadedCaptureCountsByCard(),
          dbService.getCaptureUploadCountsByCard(['pending', 'uploading', 'failed']),
        ])
        if (!isMounted) return
        setUploadedCountsByCard(uploadedCounts)
        setPendingCountsByCard(pendingCounts)
      } catch (error) {
        console.error('Falha ao processar fila de upload para Supabase:', error)
        if (isMounted) {
          setCloudSyncState('error')
          setCloudSyncMessage(
            error instanceof Error
              ? error.message
              : 'Erro ao sincronizar capturas com a nuvem.',
          )
        }
      } finally {
        isProcessingCloudQueueRef.current = false
      }
    }

    const runQueueSafe = () => {
      void runQueue()
    }

    runQueueSafe()
    const intervalId = window.setInterval(runQueueSafe, 6_000)
    window.addEventListener('online', runQueueSafe)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
      window.removeEventListener('online', runQueueSafe)
    }
  }, [cards, cloudUploadKick, dropLocalUploadedSample, isHydratingCaptures])

  useEffect(() => {
    if (!selectedCardId && cards.length > 0) {
      setSelectedCardId(String(cards[0].id))
    }
  }, [cards, selectedCardId])

  useEffect(() => {
    if (!isActive && !isStarting && devices.length > 0) {
      void startCamera(currentDeviceId || devices[0].deviceId)
    }
  }, [currentDeviceId, devices, isActive, isStarting, startCamera])

  useEffect(() => {
    return () => {
      Object.values(capturesRef.current).forEach(bucket => revokeBucketUrls(bucket))
    }
  }, [])

  const getCloudCountForOrientation = (
    targetOrientation: Orientation,
    bucketOverride?: CardCaptureBucket,
  ) => getMetadataBasedCount(targetOrientation, bucketOverride)

  const saveCapture = (blob: Blob) => {
    if (!selectedCard) return

    setCapturesByCard(prev => {
      const current = prev[selectedCard.id] ?? createEmptyBucket()
      const uploadedCounts =
        uploadedCountsRef.current[selectedCard.id] || EMPTY_CAPTURE_COUNTS
      const currentCount =
        cloudCounterSource === 'metadata'
          ? getCloudCountForOrientation(orientation, current)
          : current[orientation].length + uploadedCounts[orientation]
      if (currentCount >= TARGET_PER_ORIENTATION) {
        setFeedback(
          `A orientação ${orientationLabel} já atingiu ${TARGET_PER_ORIENTATION} fotos.`,
        )
        return prev
      }

      const nextItem: CaptureItem = createCaptureItemFromBlob(blob)

      return {
        ...prev,
        [selectedCard.id]: {
          ...current,
          [orientation]: [...current[orientation], nextItem],
        },
      }
    })
  }

  const appendCaptures = (blobs: Blob[]) => {
    if (!selectedCard) return 0
    let addedCount = 0

    setCapturesByCard(prev => {
      const current = prev[selectedCard.id] ?? createEmptyBucket()
      const uploadedCounts =
        uploadedCountsRef.current[selectedCard.id] || EMPTY_CAPTURE_COUNTS
      const totalForOrientation =
        cloudCounterSource === 'metadata'
          ? getCloudCountForOrientation(orientation, current)
          : current[orientation].length + uploadedCounts[orientation]
      const remaining = TARGET_PER_ORIENTATION - totalForOrientation
      if (remaining <= 0) return prev

      const toAdd = blobs.slice(0, remaining).map(blob => ({
        ...createCaptureItemFromBlob(blob),
      }))

      addedCount = toAdd.length

      return {
        ...prev,
        [selectedCard.id]: {
          ...current,
          [orientation]: [...current[orientation], ...toAdd],
        },
      }
    })

    return addedCount
  }

  const appendCapturesToOrientation = (targetOrientation: Orientation, blobs: Blob[]) => {
    if (!selectedCard) return 0
    let addedCount = 0

    setCapturesByCard(prev => {
      const current = prev[selectedCard.id] ?? createEmptyBucket()
      const uploadedCounts =
        uploadedCountsRef.current[selectedCard.id] || EMPTY_CAPTURE_COUNTS
      const totalForOrientation =
        cloudCounterSource === 'metadata'
          ? getCloudCountForOrientation(targetOrientation, current)
          : current[targetOrientation].length + uploadedCounts[targetOrientation]
      const remaining = TARGET_PER_ORIENTATION - totalForOrientation
      if (remaining <= 0) return prev

      const toAdd = blobs.slice(0, remaining).map(blob => ({
        ...createCaptureItemFromBlob(blob),
      }))

      addedCount = toAdd.length

      return {
        ...prev,
        [selectedCard.id]: {
          ...current,
          [targetOrientation]: [...current[targetOrientation], ...toAdd],
        },
      }
    })

    return addedCount
  }

  const handleCapture = async () => {
    if (!selectedCard) {
      setFeedback('Selecione uma carta para começar a captura.')
      return
    }

    const currentCount =
      orientation === 'vertical' ? currentVerticalCount : currentInvertedCount
    if (currentCount >= TARGET_PER_ORIENTATION) {
      setFeedback(
        `A orientação ${orientationLabel} já atingiu ${TARGET_PER_ORIENTATION} fotos.`,
      )
      return
    }

    if (!videoRef.current) {
      setFeedback('A câmera não está pronta.')
      return
    }

    try {
      await waitForVideoReady(videoRef.current)
      const blob = await captureFromVideo(videoRef.current)
      saveCapture(blob)
      setFeedback('Foto capturada com sucesso.')
      window.setTimeout(() => {
        setCloudUploadKick(previous => previous + 1)
      }, 450)
    } catch (err) {
      console.error(err)
      setFeedback(err instanceof Error ? err.message : 'Falha ao capturar foto.')
    }
  }

  const normalizeImportedBlob = async (blob: Blob, sourceName: string) => {
    if (isHeifLike(sourceName, blob.type)) {
      const heic2anyModule = await import('heic2any')
      const converted = await heic2anyModule.default({
        blob,
        toType: 'image/jpeg',
        quality: 0.92,
      })
      const firstBlob = Array.isArray(converted)
        ? (converted[0] as Blob)
        : (converted as Blob)
      return firstBlob.type === 'image/jpeg'
        ? firstBlob
        : convertImageBlobToJpeg(firstBlob)
    }

    if (blob.type === 'image/jpeg' || blob.type === 'image/jpg') {
      return blob
    }

    return convertImageBlobToJpeg(blob)
  }

  const extractImagesFromZip = async (zipFile: File): Promise<ZipExtractionResult> => {
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(zipFile)

    const result: ZipExtractionResult = {
      vertical: [],
      invertido: [],
      unknownOrientation: 0,
      errors: 0,
    }

    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue

      const entryName = entry.name
      const extension = getExtension(entryName)
      if (!IMAGE_FILE_EXTENSIONS.includes(extension)) continue

      const inferredOrientation = inferOrientationFromZipEntry(entryName)
      if (!inferredOrientation) {
        result.unknownOrientation += 1
        continue
      }

      try {
        const rawBlob = await entry.async('blob')
        const normalizedBlob = await normalizeImportedBlob(rawBlob, entryName)
        result[inferredOrientation].push(normalizedBlob)
      } catch (err) {
        result.errors += 1
        console.error('Falha ao processar imagem do ZIP:', entryName, err)
      }
    }

    return result
  }

  const handleImportFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return
    if (!selectedCard) {
      setFeedback('Selecione uma carta antes de importar.')
      return
    }

    setIsImporting(true)
    setFeedback('')

    let failed = 0
    let zipCount = 0
    let zipUnknownOrientation = 0
    const normalizedBlobs: Blob[] = []
    const zipVerticalBlobs: Blob[] = []
    const zipInvertedBlobs: Blob[] = []

    for (const file of files) {
      if (isZipFile(file)) {
        zipCount += 1
        try {
          const zipExtraction = await extractImagesFromZip(file)
          zipVerticalBlobs.push(...zipExtraction.vertical)
          zipInvertedBlobs.push(...zipExtraction.invertido)
          zipUnknownOrientation += zipExtraction.unknownOrientation
          failed += zipExtraction.errors
        } catch (err) {
          failed += 1
          console.error('Falha ao importar ZIP:', file.name, err)
        }
        continue
      }

      try {
        const blob = await normalizeImportedBlob(file, file.name)
        normalizedBlobs.push(blob)
      } catch (err) {
        failed += 1
        console.error('Falha ao importar arquivo:', file.name, err)
      }
    }

    const addedCount = appendCaptures(normalizedBlobs)
    const zipVerticalAdded = appendCapturesToOrientation('vertical', zipVerticalBlobs)
    const zipInvertedAdded = appendCapturesToOrientation('invertido', zipInvertedBlobs)
    const ignoredCount = Math.max(0, normalizedBlobs.length - addedCount)
    const zipVerticalIgnored = Math.max(0, zipVerticalBlobs.length - zipVerticalAdded)
    const zipInvertedIgnored = Math.max(0, zipInvertedBlobs.length - zipInvertedAdded)

    const parts: string[] = []
    if (normalizedBlobs.length > 0) {
      parts.push(
        `Importadas ${addedCount} foto(s) na orientação ${orientationLabel}`,
      )
    }

    if (zipCount > 0) {
      parts.push(
        `ZIP: +${zipVerticalAdded} vertical, +${zipInvertedAdded} horizontal`,
      )
    }

    if (ignoredCount > 0) {
      parts.push(`${ignoredCount} excederam o limite da orientação atual`)
    }
    if (zipVerticalIgnored > 0 || zipInvertedIgnored > 0) {
      parts.push(
        `${zipVerticalIgnored + zipInvertedIgnored} do ZIP excederam o limite por orientação`,
      )
    }
    if (zipUnknownOrientation > 0) {
      parts.push(
        `${zipUnknownOrientation} no ZIP sem orientação identificada (use vertical/invertido no nome)`,
      )
    }
    if (failed > 0) {
      parts.push(`${failed} com erro de conversão`)
    }
    if (!parts.length) {
      parts.push('Nenhuma foto válida encontrada para importar.')
    }

    setFeedback(parts.join(' | '))
    setIsImporting(false)
    window.setTimeout(() => {
      setCloudUploadKick(previous => previous + 1)
    }, 450)
  }

  const removeLastCapture = () => {
    if (!selectedCard) return

    setCapturesByCard(prev => {
      const current = prev[selectedCard.id] ?? createEmptyBucket()
      const orientationCaptures = current[orientation]
      if (!orientationCaptures.length) return prev

      const lastCapture = orientationCaptures[orientationCaptures.length - 1]
      URL.revokeObjectURL(lastCapture.objectUrl)

      const nextBucket: CardCaptureBucket = {
        ...current,
        [orientation]: orientationCaptures.slice(0, -1),
      }

      if (isBucketEmpty(nextBucket)) {
        const next = { ...prev }
        delete next[selectedCard.id]
        return next
      }

      return {
        ...prev,
        [selectedCard.id]: nextBucket,
      }
    })
  }

  const clearCurrentCard = () => {
    if (!selectedCard) return
    const current = capturesByCard[selectedCard.id]
    if (!current) return

    revokeBucketUrls(current)
    setCapturesByCard(prev => {
      const next = { ...prev }
      delete next[selectedCard.id]
      return next
    })
    setFeedback('Registros da carta atual foram limpos.')
  }

  const exportCurrentCard = async () => {
    if (!selectedCard) return
    const bucket = capturesByCard[selectedCard.id]
    if (!bucket || (!bucket.vertical.length && !bucket.invertido.length)) {
      setFeedback('Nenhuma captura para exportar nesta carta.')
      return
    }

    setIsExporting(true)
    setFeedback('')
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      const imageBase =
        selectedCard.imagemUrl.split('/').pop()?.replace(/\.[^/.]+$/, '') ||
        normalizeLabelValue(selectedCard.nome)

      const cardFolder = zip.folder(imageBase) || zip
      const verticalFolder = cardFolder.folder('vertical')
      const reversedFolder = cardFolder.folder('invertido')

      bucket.vertical.forEach((capture, index) => {
        verticalFolder?.file(
          `${imageBase}_vertical_${String(index + 1).padStart(2, '0')}.jpg`,
          capture.blob,
        )
      })

      bucket.invertido.forEach((capture, index) => {
        reversedFolder?.file(
          `${imageBase}_invertido_${String(index + 1).padStart(2, '0')}.jpg`,
          capture.blob,
        )
      })

      cardFolder.file(
        'metadata.json',
        JSON.stringify(
          {
            cardId: selectedCard.id,
            cardName: selectedCard.nome,
            imageBaseName: imageBase,
            targetPerOrientation: TARGET_PER_ORIENTATION,
            capturedAt: new Date().toISOString(),
            counts: {
              vertical: bucket.vertical.length,
              invertido: bucket.invertido.length,
            },
            recommendedModelLabels: {
              vertical: `${imageBase}_vertical`,
              invertido: `${imageBase}_invertido`,
            },
          },
          null,
          2,
        ),
      )

      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${imageBase}_dataset.zip`
      link.click()
      URL.revokeObjectURL(url)

      setFeedback('Exportação concluída.')
    } catch (err) {
      console.error(err)
      setFeedback('Erro ao exportar a carta atual.')
    } finally {
      setIsExporting(false)
    }
  }

  const goToNextCard = () => {
    if (!selectedCard) return
    const currentIndex = cards.findIndex(card => card.id === selectedCard.id)
    if (currentIndex < 0 || currentIndex >= cards.length - 1) return
    setSelectedCardId(String(cards[currentIndex + 1].id))
    setOrientation('vertical')
  }

  const localSyncMessage = useMemo(() => {
    if (localSyncState === 'saving') return 'Sincronizando no armazenamento local...'
    if (localSyncState === 'saved') {
      if (!lastLocalSyncAt) return 'Salvo localmente.'
      const formattedTime = new Date(lastLocalSyncAt).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
      return `Salvo localmente às ${formattedTime}.`
    }
    if (localSyncState === 'error') {
      return 'Falha ao salvar localmente. Tente novamente.'
    }
    return ''
  }, [lastLocalSyncAt, localSyncState])

  const cloudSyncStatusClass = useMemo(() => {
    if (cloudSyncState === 'syncing') return 'saving'
    if (cloudSyncState === 'error') return 'error'
    if (cloudSyncState === 'disabled') return 'disabled'
    return 'saved'
  }, [cloudSyncState])

  const cloudSyncStatusMessage = useMemo(() => {
    const queueCounts = `fila pendente: ${cloudQueueStats.pending}, falhas: ${cloudQueueStats.failed}`
    const counterSourceLabel =
      cloudCounterSource === 'metadata'
        ? 'contador: nuvem (tabela metadata)'
        : 'contador: fallback local'
    if (cloudSyncState === 'syncing') {
      return `Sincronizando com Supabase... (${queueCounts} | ${counterSourceLabel})`
    }
    if (cloudSyncState === 'disabled') {
      return cloudSyncMessage || 'Supabase não configurado neste ambiente.'
    }
    if (cloudSyncState === 'error') {
      return `Falha na nuvem: ${cloudSyncMessage || 'tente novamente.'} (${queueCounts} | ${counterSourceLabel})`
    }
    if (cloudCounterHint) {
      return `Supabase ativo. ${queueCounts} | ${counterSourceLabel}. ${cloudCounterHint}`
    }
    return `Supabase ativo. ${queueCounts} | ${counterSourceLabel}.`
  }, [
    cloudCounterHint,
    cloudCounterSource,
    cloudQueueStats.failed,
    cloudQueueStats.pending,
    cloudSyncMessage,
    cloudSyncState,
  ])

  return (
    <div className="card-registration-view">
      <CameraView
        videoRef={videoRef}
        devices={devices}
        currentDeviceId={currentDeviceId}
        overlayOrientation={orientation === 'vertical' ? 'vertical' : 'horizontal'}
        dimOutsideOverlay
        isActive={isActive}
        isStarting={isStarting}
        error={cameraError}
        onStart={() => startCamera(currentDeviceId || devices[0]?.deviceId)}
        onSwitch={switchCamera}
        toolbarActions={
          <button
            className="camera-capture-btn"
            onClick={() => void handleCapture()}
            disabled={!isActive || isStarting || !selectedCard}
            title="Capturar foto da carta"
            aria-label="Capturar foto da carta"
          >
            Capturar
          </button>
        }
      >
        {showCaptureGuidance && (
          <div
            className={`capture-guidance ${
              orientation === 'vertical'
                ? 'capture-guidance--vertical'
                : 'capture-guidance--horizontal'
            }`}
            aria-live="polite"
          >
            <strong>Posicione a carta no quadro ({orientationLabel})</strong>
            <span>Mantenha a carta completa, sem reflexo e com boa iluminação.</span>
          </div>
        )}
      </CameraView>

      <div
        className={`registration-panel ${isPanelExpanded ? 'expanded' : 'collapsed'}`}
      >
        <button
          className="panel-toggle"
          onClick={() => setIsPanelExpanded(prev => !prev)}
          aria-expanded={isPanelExpanded}
          aria-controls="registration-panel-content"
        >
          <span className="panel-toggle-title">Registrar Cartas</span>
          <span className="panel-toggle-state">
            {isPanelExpanded ? 'Ocultar funções' : 'Mostrar funções'}
          </span>
        </button>

        {isPanelExpanded && (
          <div id="registration-panel-content" className="registration-panel-content">
            <div className="registration-topline">
              <h2>Registrar Cartas</h2>
              <button className="secondary" onClick={onBack}>
                Voltar
              </button>
            </div>

            <div className="registration-controls">
              <div className="control-group">
                <label htmlFor="card-selector">Carta</label>
                <select
                  id="card-selector"
                  value={selectedCardId}
                  onChange={event => setSelectedCardId(event.target.value)}
                >
                  {cards.map(card => (
                    <option key={card.id} value={card.id}>
                      {card.id.toString().padStart(2, '0')} - {card.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div className="control-group">
                <label>Orientação</label>
                <div className="orientation-buttons">
                  <button
                    className={orientation === 'vertical' ? 'secondary active' : 'secondary'}
                    onClick={() => setOrientation('vertical')}
                  >
                    Vertical
                  </button>
                  <button
                    className={orientation === 'invertido' ? 'secondary active' : 'secondary'}
                    onClick={() => setOrientation('invertido')}
                  >
                    Horizontal
                  </button>
                </div>
              </div>
            </div>

            <div className="counter-grid">
              <div>
                <small>Vertical</small>
                <strong>
                  {currentVerticalCount}/{TARGET_PER_ORIENTATION}
                </strong>
              </div>
              <div>
                <small>Horizontal</small>
                <strong>
                  {currentInvertedCount}/{TARGET_PER_ORIENTATION}
                </strong>
              </div>
              <div>
                <small>Status</small>
                <strong>{isCardReady ? 'Pronta para treino' : 'Em captura'}</strong>
              </div>
            </div>

            <div className="capture-actions">
              <button onClick={handleCapture}>Capturar foto</button>
              <button
                className="secondary"
                onClick={() => importInputRef.current?.click()}
                disabled={isImporting}
              >
                {isImporting ? 'Importando...' : 'Importar fotos'}
              </button>
              <button className="secondary" onClick={removeLastCapture}>
                Desfazer última
              </button>
              <button className="secondary" onClick={clearCurrentCard}>
                Limpar carta
              </button>
              <button className="secondary" onClick={goToNextCard}>
                Próxima carta
              </button>
              <button onClick={exportCurrentCard} disabled={isExporting}>
                {isExporting ? 'Exportando...' : 'Exportar carta (ZIP)'}
              </button>
            </div>

            <p className="registration-supported">
              Formatos aceitos: ZIP, HEIF/HEIC/HEVC, PNG e JPEG (convertidos para
              JPEG quando necessário).
            </p>

            {isHydratingCaptures && (
              <p className="registration-supported">
                Carregando capturas salvas localmente...
              </p>
            )}

            {!isHydratingCaptures && localSyncMessage && (
              <p className={`registration-local-sync ${localSyncState}`}>
                {localSyncMessage}
              </p>
            )}

            {!isHydratingCaptures && (
              <p className={`registration-cloud-sync ${cloudSyncStatusClass}`}>
                {cloudSyncStatusMessage}
              </p>
            )}

            {feedback && <p className="registration-feedback">{feedback}</p>}

            <div className="preview-grid">
              <div>
                <h3>Prévias verticais</h3>
                <div className="thumb-list">
                  {currentBucket.vertical.map(item => (
                    <img key={item.id} src={item.objectUrl} alt="Vertical" />
                  ))}
                </div>
              </div>
              <div>
                <h3>Prévias horizontais</h3>
                <div className="thumb-list">
                  {currentBucket.invertido.map(item => (
                    <img key={item.id} src={item.objectUrl} alt="Horizontal" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <input
        ref={importInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_EXTENSIONS.join(',')}
        multiple
        onChange={handleImportFiles}
        hidden
      />
    </div>
  )
}

export default CardRegistrationView
