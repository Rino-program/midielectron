import React from 'react';
import type { AppSettings } from '../../../shared/types';

interface Props {
  audio: AppSettings['audio'];
  onChange(audio: AppSettings['audio']): void;
}

const fieldStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 12,
  fontSize: 13,
};

const selectStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 4,
  padding: '6px 8px',
  background: '#0f3460',
  color: '#e0e0e0',
  border: '1px solid #e94560',
  borderRadius: 4,
};

export function AudioSettings({ audio, onChange }: Props): React.ReactElement {
  return (
    <div>
      <label style={fieldStyle}>
        Capture Mode:
        <select
          style={selectStyle}
          value={audio.captureMode}
          onChange={(e) =>
            onChange({ ...audio, captureMode: e.target.value as AppSettings['audio']['captureMode'] })
          }
        >
          <option value="microphone">Microphone</option>
          <option value="loopback">Loopback</option>
          <option value="virtual-device">Virtual Device</option>
        </select>
      </label>
      <label style={fieldStyle}>
        Sample Rate:
        <select
          style={selectStyle}
          value={audio.sampleRate}
          onChange={(e) =>
            onChange({ ...audio, sampleRate: parseInt(e.target.value) as 44100 | 48000 })
          }
        >
          <option value="44100">44100 Hz</option>
          <option value="48000">48000 Hz</option>
        </select>
      </label>
      <label style={fieldStyle}>
        Frame Size:
        <select
          style={selectStyle}
          value={audio.frameSize}
          onChange={(e) =>
            onChange({ ...audio, frameSize: parseInt(e.target.value) as 512 | 1024 | 2048 })
          }
        >
          <option value="512">512 (low latency)</option>
          <option value="1024">1024 (balanced)</option>
          <option value="2048">2048 (high quality)</option>
        </select>
      </label>
      <label style={fieldStyle}>
        Silence Threshold: {audio.silenceThreshold.toFixed(3)}
        <input
          type="range"
          min="0.001"
          max="0.1"
          step="0.001"
          value={audio.silenceThreshold}
          style={{ display: 'block', width: '100%', marginTop: 4 }}
          onChange={(e) => onChange({ ...audio, silenceThreshold: parseFloat(e.target.value) })}
        />
      </label>
    </div>
  );
}
