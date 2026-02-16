import { RefObject, useCallback, useEffect, useRef, useState } from 'react'

interface MediaDevice {
  deviceId: string
  label: string
  kind: 'videoinput' | 'audioinput' | 'audiooutput'
}

export interface CameraResolution {
  width: number
  height: number
}

type FacingMode = 'user' | 'environment'

const DEFAULT_RESOLUTION: CameraResolution = {
  width: 1280,
  height: 720,
}

const isIOSDevice = () =>
  /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

const inferFacingModeFromLabel = (label: string): FacingMode | undefined => {
  const normalized = label.toLowerCase()
  if (
    normalized.includes('frontal') ||
    normalized.includes('front') ||
    normalized.includes('user')
  ) {
    return 'user'
  }
  if (
    normalized.includes('traseira') ||
    normalized.includes('traseiro') ||
    normalized.includes('rear') ||
    normalized.includes('back') ||
    normalized.includes('environment')
  ) {
    return 'environment'
  }
  return undefined
}

export const useCamera = (
  videoRef: RefObject<HTMLVideoElement>,
) => {
  const [devices, setDevices] = useState<MediaDevice[]>([])
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('')
  const [isActive, setIsActive] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const startRequestRef = useRef(0)

  const listDevices = useCallback(async () => {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devs.filter(
        (d): d is MediaDeviceInfo & { kind: 'videoinput' } => d.kind === 'videoinput',
      )
      const mappedDevices = videoDevices.map((d, idx) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${idx + 1}`,
        kind: 'videoinput' as const,
      }))

      setDevices(mappedDevices)
      if (videoDevices[0]) {
        const preferred =
          mappedDevices.find(device => inferFacingModeFromLabel(device.label) === 'environment')
            ?.deviceId || videoDevices[0].deviceId

        setCurrentDeviceId(prev => {
          if (!prev) return preferred
          const stillExists = mappedDevices.some(device => device.deviceId === prev)
          return stillExists ? prev : preferred
        })
      }
    } catch (err) {
      setError('Erro ao listar câmeras')
      console.error(err)
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsActive(false)
  }, [videoRef])

  useEffect(() => {
    void listDevices()

    const handleDeviceChange = () => {
      void listDevices()
    }

    navigator.mediaDevices.addEventListener?.('devicechange', handleDeviceChange)

    return () => {
      navigator.mediaDevices.removeEventListener?.('devicechange', handleDeviceChange)
    }
  }, [listDevices])

  const buildVideoConstraints = useCallback(
    (selectedDeviceId: string | undefined, resolution: CameraResolution) => {
      const selectedDevice = devices.find(device => device.deviceId === selectedDeviceId)
      const facingMode = selectedDevice
        ? inferFacingModeFromLabel(selectedDevice.label)
        : undefined

      const constraints: MediaTrackConstraints = {
        width: { ideal: resolution.width },
        height: { ideal: resolution.height },
      }

      if (selectedDeviceId) {
        constraints.deviceId = { exact: selectedDeviceId }
      }

      if (facingMode) {
        constraints.facingMode = { ideal: facingMode }
      }

      if (isIOSDevice() && facingMode) {
        delete constraints.deviceId
      }

      return constraints
    },
    [devices],
  )

  const getStream = useCallback(
    async (selectedDeviceId: string | undefined, resolution: CameraResolution) => {
      const primaryConstraints: MediaStreamConstraints = {
        video: buildVideoConstraints(selectedDeviceId, resolution),
        audio: false,
      }

      try {
        return await navigator.mediaDevices.getUserMedia(primaryConstraints)
      } catch (primaryError) {
        const selectedDevice = devices.find(device => device.deviceId === selectedDeviceId)
        const fallbackFacingMode = selectedDevice
          ? inferFacingModeFromLabel(selectedDevice.label)
          : undefined

        if (!fallbackFacingMode) {
          throw primaryError
        }

        const fallbackConstraints: MediaStreamConstraints = {
          video: {
            facingMode: { ideal: fallbackFacingMode },
            width: { ideal: resolution.width },
            height: { ideal: resolution.height },
          },
          audio: false,
        }

        return navigator.mediaDevices.getUserMedia(fallbackConstraints)
      }
    },
    [buildVideoConstraints, devices],
  )

  const startCamera = useCallback(
    async (
      selectedDeviceId?: string,
      resolution: CameraResolution = DEFAULT_RESOLUTION,
    ) => {
      const requestId = startRequestRef.current + 1
      startRequestRef.current = requestId

      try {
        setIsStarting(true)
        setError(null)
        stopCamera()

        const stream = await getStream(selectedDeviceId, resolution)
        if (requestId !== startRequestRef.current) {
          stream.getTracks().forEach(track => track.stop())
          return
        }

        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => undefined)
          setIsActive(true)
        }
        if (selectedDeviceId) {
          setCurrentDeviceId(selectedDeviceId)
        }
        await listDevices()
      } catch (err) {
        setError('Erro ao acessar câmera: ' + (err as Error).message)
        console.error('Camera error:', err)
      } finally {
        if (requestId === startRequestRef.current) {
          setIsStarting(false)
        }
      }
    },
    [getStream, listDevices, stopCamera, videoRef],
  )

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [stopCamera])

  const switchCamera = async (
    nextDeviceId: string,
    resolution: CameraResolution = DEFAULT_RESOLUTION,
  ) => {
    await startCamera(nextDeviceId, resolution)
  }

  return {
    devices,
    currentDeviceId,
    setCurrentDeviceId,
    isActive,
    isStarting,
    error,
    startCamera,
    stopCamera,
    switchCamera,
  }
}
