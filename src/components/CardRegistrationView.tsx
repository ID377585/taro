import { ChangeEvent, FC, useEffect, useMemo, useRef, useState } from 'react'
import { Card } from '../types'
import { useCamera } from '../hooks/useCamera'
import { normalizeLabelValue } from '../services/labelService'
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

const TARGET_PER_ORIENTATION = 10
const ACCEPTED_IMAGE_EXTENSIONS = ['.heic', '.heif', '.hevc', '.jpg', '.jpeg', '.png']

const createEmptyBucket = (): CardCaptureBucket => ({
  vertical: [],
  invertido: [],
})

const isHeifLike = (file: File) => {
  const lowerName = file.name.toLowerCase()
  const mime = file.type.toLowerCase()
  return (
    lowerName.endsWith('.heic') ||
    lowerName.endsWith('.heif') ||
    lowerName.endsWith('.hevc') ||
    mime.includes('heic') ||
    mime.includes('heif') ||
    mime.includes('hevc')
  )
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

const CardRegistrationView: FC<CardRegistrationViewProps> = ({ cards, onBack }) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const capturesRef = useRef<Record<number, CardCaptureBucket>>({})

  const [selectedCardId, setSelectedCardId] = useState<string>('')
  const [orientation, setOrientation] = useState<Orientation>('vertical')
  const [capturesByCard, setCapturesByCard] = useState<Record<number, CardCaptureBucket>>(
    {},
  )
  const [feedback, setFeedback] = useState<string>('')
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
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

  const currentVerticalCount = currentBucket.vertical.length
  const currentInvertedCount = currentBucket.invertido.length
  const isCardReady =
    currentVerticalCount >= TARGET_PER_ORIENTATION &&
    currentInvertedCount >= TARGET_PER_ORIENTATION

  useEffect(() => {
    capturesRef.current = capturesByCard
  }, [capturesByCard])

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

  const saveCapture = (blob: Blob) => {
    if (!selectedCard) return

    setCapturesByCard(prev => {
      const current = prev[selectedCard.id] ?? createEmptyBucket()
      const currentCount = current[orientation].length
      if (currentCount >= TARGET_PER_ORIENTATION) {
        setFeedback(
          `A orientação ${orientation} já atingiu ${TARGET_PER_ORIENTATION} fotos.`,
        )
        return prev
      }

      const objectUrl = URL.createObjectURL(blob)
      const nextItem: CaptureItem = {
        id: crypto.randomUUID(),
        blob,
        objectUrl,
        capturedAt: Date.now(),
      }

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
      const remaining = TARGET_PER_ORIENTATION - current[orientation].length
      if (remaining <= 0) return prev

      const toAdd = blobs.slice(0, remaining).map(blob => ({
        id: crypto.randomUUID(),
        blob,
        objectUrl: URL.createObjectURL(blob),
        capturedAt: Date.now(),
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

  const handleCapture = async () => {
    if (!videoRef.current) {
      setFeedback('A câmera não está pronta.')
      return
    }

    try {
      const blob = await captureFromVideo(videoRef.current)
      saveCapture(blob)
      setFeedback('Foto capturada com sucesso.')
    } catch (err) {
      console.error(err)
      setFeedback(err instanceof Error ? err.message : 'Falha ao capturar foto.')
    }
  }

  const normalizeImportedFile = async (file: File) => {
    if (isHeifLike(file)) {
      const heic2anyModule = await import('heic2any')
      const converted = await heic2anyModule.default({
        blob: file,
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

    if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
      return file
    }

    return convertImageBlobToJpeg(file)
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
    const normalizedBlobs: Blob[] = []

    for (const file of files) {
      try {
        const blob = await normalizeImportedFile(file)
        normalizedBlobs.push(blob)
      } catch (err) {
        failed += 1
        console.error('Falha ao importar arquivo:', file.name, err)
      }
    }

    const addedCount = appendCaptures(normalizedBlobs)
    const ignoredCount = Math.max(0, normalizedBlobs.length - addedCount)

    const parts = [`Importadas ${addedCount} foto(s)`]
    if (ignoredCount > 0) {
      parts.push(`${ignoredCount} excederam o limite da orientação atual`)
    }
    if (failed > 0) {
      parts.push(`${failed} com erro de conversão`)
    }
    setFeedback(parts.join(' | '))
    setIsImporting(false)
  }

  const removeLastCapture = () => {
    if (!selectedCard) return

    setCapturesByCard(prev => {
      const current = prev[selectedCard.id] ?? createEmptyBucket()
      const orientationCaptures = current[orientation]
      if (!orientationCaptures.length) return prev

      const lastCapture = orientationCaptures[orientationCaptures.length - 1]
      URL.revokeObjectURL(lastCapture.objectUrl)

      return {
        ...prev,
        [selectedCard.id]: {
          ...current,
          [orientation]: orientationCaptures.slice(0, -1),
        },
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

  return (
    <div className="card-registration-view">
      <CameraView
        videoRef={videoRef}
        devices={devices}
        currentDeviceId={currentDeviceId}
        isActive={isActive}
        isStarting={isStarting}
        error={cameraError}
        onStart={() => startCamera(currentDeviceId || devices[0]?.deviceId)}
        onSwitch={switchCamera}
      >
        <div className="capture-guidance">
          <strong>Posicione a carta dentro do quadro</strong>
          <span>Mantenha a carta completa, sem reflexo e com boa iluminação.</span>
        </div>
      </CameraView>

      <div className="registration-panel">
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
                Invertida
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
            <small>Invertida</small>
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
          Formatos aceitos: HEIF/HEIC/HEVC/PNG/JPEG (convertidos para JPEG quando
          necessário).
        </p>

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
            <h3>Prévias invertidas</h3>
            <div className="thumb-list">
              {currentBucket.invertido.map(item => (
                <img key={item.id} src={item.objectUrl} alt="Invertida" />
              ))}
            </div>
          </div>
        </div>
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
