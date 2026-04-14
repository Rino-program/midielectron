import React from 'react';
import type { AppSettings } from '../../../shared/types';

interface Props {
  midi: AppSettings['midi'];
  onChange(midi: AppSettings['midi']): void;
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

const inputStyle: React.CSSProperties = {
  ...selectStyle,
  width: '100%',
};

export function MIDISettings({ midi, onChange }: Props): React.ReactElement {
  return (
    <div>
      <label style={fieldStyle}>
        Channel (1-16):
        <input
          type="number"
          min="1"
          max="16"
          value={midi.channel}
          style={inputStyle}
          onChange={(e) => onChange({ ...midi, channel: parseInt(e.target.value) || 1 })}
        />
      </label>
      <label style={fieldStyle}>
        Velocity Mode:
        <select
          style={selectStyle}
          value={midi.velocityMode}
          onChange={(e) =>
            onChange({ ...midi, velocityMode: e.target.value as 'fixed' | 'dynamic' })
          }
        >
          <option value="fixed">Fixed</option>
          <option value="dynamic">Dynamic</option>
        </select>
      </label>
      {midi.velocityMode === 'fixed' && (
        <label style={fieldStyle}>
          Fixed Velocity: {midi.fixedVelocity}
          <input
            type="range"
            min="1"
            max="127"
            value={midi.fixedVelocity}
            style={{ display: 'block', width: '100%', marginTop: 4 }}
            onChange={(e) => onChange({ ...midi, fixedVelocity: parseInt(e.target.value) })}
          />
        </label>
      )}
      <label style={fieldStyle}>
        Max Polyphony: {midi.maxPolyphony}
        <input
          type="range"
          min="1"
          max="16"
          value={midi.maxPolyphony}
          style={{ display: 'block', width: '100%', marginTop: 4 }}
          onChange={(e) => onChange({ ...midi, maxPolyphony: parseInt(e.target.value) })}
        />
      </label>
      <label style={fieldStyle}>
        Transpose Octaves:
        <input
          type="number"
          min="-4"
          max="4"
          value={midi.transposeOctaves}
          style={inputStyle}
          onChange={(e) => onChange({ ...midi, transposeOctaves: parseInt(e.target.value) || 0 })}
        />
      </label>
      <label style={fieldStyle}>
        Transpose Semitones:
        <input
          type="number"
          min="-12"
          max="12"
          value={midi.transposeNotes}
          style={inputStyle}
          onChange={(e) => onChange({ ...midi, transposeNotes: parseInt(e.target.value) || 0 })}
        />
      </label>
      <label style={fieldStyle}>
        <input
          type="checkbox"
          checked={midi.pitchBendEnabled}
          onChange={(e) => onChange({ ...midi, pitchBendEnabled: e.target.checked })}
          style={{ marginRight: 8 }}
        />
        Enable Pitch Bend
      </label>
    </div>
  );
}
