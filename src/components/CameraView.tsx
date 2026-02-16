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
  overlayOrientation?: 'vertical' | 'horizontal'
  isActive: boolean
  isStarting?: boolean
  error: string | null
  onStart: () => void
  onSwitch: (deviceId: string) => void
  toolbarActions?: ReactNode
  children?: ReactNode
}

const CameraView: FC<CameraViewProps> = ({
  videoRef,
  devices,
  currentDeviceId,
  overlayOrientation = 'vertical',
  isActive,
  isStarting = false,
  error,
  onStart,
  onSwitch,
  toolbarActions,
  children,
}) => {
  return (
    <div className="camera-container">
      <video ref={videoRef} className="camera-feed" autoPlay playsInline muted />
      <div
        className={`camera-overlay${
          overlayOrientation === 'horizontal' ? ' camera-overlay--horizontal' : ''
        }`}
      />

      <div className="camera-toolbar">
        <div className="camera-toolbar-left">
          {!isActive && (
            <button className="camera-btn" onClick={onStart}>
              Ativar câmera
            </button>
          )}
        </div>

        <div className="camera-toolbar-right">
          {devices.length > 0 && (
            <select
              className="camera-select"
              value={currentDeviceId}
              disabled={isStarting}
              onChange={event => onSwitch(event.target.value)}
            >
              {devices.map(device => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || 'Câmera'}
                </option>
              ))}
            </select>
          )}
          {toolbarActions}
        </div>
      </div>

      {error && <p className="camera-error">{error}</p>}
      {children}
    </div>
  )
}

export default CameraView
