import { FC, ReactNode, RefObject } from 'react'
import './CameraView.css'

interface CameraDevice {
  deviceId: string
  label: string
}

interface CameraViewProps {
  videoRef: RefObject<HTMLVideoElement>
  devices: CameraDevice[]
  currentDeviceId: string
  isActive: boolean
  error: string | null
  onStart: () => void
  onSwitch: (deviceId: string) => void
  children?: ReactNode
}

const CameraView: FC<CameraViewProps> = ({
  videoRef,
  devices,
  currentDeviceId,
  isActive,
  error,
  onStart,
  onSwitch,
  children,
}) => {
  return (
    <div className="camera-container">
      <video ref={videoRef} className="camera-feed" autoPlay playsInline muted />
      <div className="camera-overlay" />

      <div className="camera-toolbar">
        {!isActive && (
          <button className="camera-btn" onClick={onStart}>
            Ativar câmera
          </button>
        )}

        {devices.length > 0 && (
          <select
            className="camera-select"
            value={currentDeviceId}
            onChange={event => onSwitch(event.target.value)}
          >
            {devices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || 'Câmera'}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="camera-error">{error}</p>}
      {children}
    </div>
  )
}

export default CameraView
