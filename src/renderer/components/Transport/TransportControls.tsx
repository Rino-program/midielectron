import React from 'react';

interface Props {
  isCapturing: boolean;
  isRecording: boolean;
  onStart(): void;
  onStop(): void;
  onRecord(): void;
  onStopRecord(): void;
  onSave(): void;
}

const btnStyle = (color: string, disabled = false): React.CSSProperties => ({
  padding: '8px 18px',
  borderRadius: 6,
  border: 'none',
  background: color,
  color: '#fff',
  fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
  fontSize: 14,
});

export function TransportControls({
  isCapturing,
  isRecording,
  onStart,
  onStop,
  onRecord,
  onStopRecord,
  onSave,
}: Props): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: '10px 16px',
        background: '#16213e',
        borderTop: '1px solid #0f3460',
        alignItems: 'center',
      }}
    >
      {!isCapturing ? (
        <button style={btnStyle('#2ecc71')} onClick={onStart}>
          ▶ Start
        </button>
      ) : (
        <button style={btnStyle('#e74c3c')} onClick={onStop}>
          ⏹ Stop
        </button>
      )}

      {!isRecording ? (
        <button style={btnStyle('#e94560', !isCapturing)} onClick={onRecord} disabled={!isCapturing}>
          ⏺ Record
        </button>
      ) : (
        <button style={btnStyle('#f39c12')} onClick={onStopRecord}>
          ⏹ Stop Recording
        </button>
      )}

      <button style={btnStyle('#3498db', isRecording)} onClick={onSave} disabled={isRecording}>
        💾 Save MIDI
      </button>

      <span style={{ marginLeft: 'auto', fontSize: 12, color: '#a0a0b0' }}>
        Space: Start/Stop | R: Record | Ctrl+,: Settings
      </span>
    </div>
  );
}
