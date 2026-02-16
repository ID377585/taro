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

const DEFAULT_RESOLUTION: CameraResolution = {
  width: 1280,
  height: 720,
}

export const useCamera = (
  videoRef: RefObject<HTMLVideoElement>,
) => {
  const [devices, setDevices] = useState<MediaDevice[]>([])
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('')
  const [isActive, setIsActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

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
    const listDevices = async () => {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices()
        const videoDevices = devs.filter(
          (d): d is MediaDeviceInfo & { kind: 'videoinput' } =>
            d.kind === 'videoinput',
        )
        setDevices(
          videoDevices.map((d, idx) => ({
            deviceId: d.deviceId,
            label: d.label || `Camera ${idx + 1}`,
            kind: 'videoinput',
          })),
        )
        if (!currentDeviceId && videoDevices[0]) {
          setCurrentDeviceId(videoDevices[0].deviceId)
        }
      } catch (err) {
        setError('Erro ao listar câmeras')
        console.error(err)
      }
    }

    void listDevices()
  }, [currentDeviceId])

  const startCamera = useCallback(
    async (
      selectedDeviceId?: string,
      resolution: CameraResolution = DEFAULT_RESOLUTION,
    ) => {
      try {
        setError(null)
        stopCamera()

        const constraints: MediaStreamConstraints = {
          video: {
            deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
            width: { ideal: resolution.width },
            height: { ideal: resolution.height },
          },
          audio: false,
        }

        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          setIsActive(true)
        }
        if (selectedDeviceId) {
          setCurrentDeviceId(selectedDeviceId)
        }
      } catch (err) {
        setError('Erro ao acessar câmera: ' + (err as Error).message)
        console.error('Camera error:', err)
      }
    },
    [stopCamera, videoRef],
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
    error,
    startCamera,
    stopCamera,
    switchCamera,
  }
}
