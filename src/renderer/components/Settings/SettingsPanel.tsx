import React, { useState } from 'react';
import { AudioSettings } from './AudioSettings';
import { MIDISettings } from './MIDISettings';
import type { AppSettings } from '../../../shared/types';

interface Props {
  settings: AppSettings;
  onClose(): void;
  onSave(settings: Partial<AppSettings>): void;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  width: 400,
  background: '#16213e',
  borderLeft: '2px solid #0f3460',
  display: 'flex',
  flexDirection: 'column',
  zIndex: 100,
  boxShadow: '-8px 0 24px rgba(0,0,0,0.5)',
};

export function SettingsPanel({ settings, onClose, onSave }: Props): React.ReactElement {
  const [tab, setTab] = useState<'audio' | 'midi' | 'pitch' | 'visual'>('audio');

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 14px',
    border: 'none',
    background: active ? '#e94560' : 'transparent',
    color: '#e0e0e0',
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
  });

  return (
    <div style={overlayStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #0f3460' }}>
        <h2 style={{ fontSize: 16, color: '#e94560' }}>Settings</h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#e0e0e0', cursor: 'pointer', fontSize: 18 }}>✕</button>
      </div>
      <div style={{ display: 'flex', borderBottom: '1px solid #0f3460' }}>
        <button style={tabStyle(tab === 'audio')} onClick={() => setTab('audio')}>Audio</button>
        <button style={tabStyle(tab === 'midi')} onClick={() => setTab('midi')}>MIDI</button>
        <button style={tabStyle(tab === 'pitch')} onClick={() => setTab('pitch')}>Pitch</button>
        <button style={tabStyle(tab === 'visual')} onClick={() => setTab('visual')}>Visual</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {tab === 'audio' && (
          <AudioSettings
            audio={settings.audio}
            onChange={(audio) => onSave({ audio })}
          />
        )}
        {tab === 'midi' && (
          <MIDISettings
            midi={settings.midi}
            onChange={(midi) => onSave({ midi })}
          />
        )}
        {tab === 'pitch' && (
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>
              Min Confidence: {settings.pitch.minConfidence}
              <input type="range" min="0" max="1" step="0.05" value={settings.pitch.minConfidence}
                style={{ display: 'block', width: '100%', marginTop: 4 }}
                onChange={(e) => onSave({ pitch: { ...settings.pitch, minConfidence: parseFloat(e.target.value) } })}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>
              Onset Sensitivity: {settings.pitch.onsetSensitivity}
              <input type="range" min="0" max="1" step="0.05" value={settings.pitch.onsetSensitivity}
                style={{ display: 'block', width: '100%', marginTop: 4 }}
                onChange={(e) => onSave({ pitch: { ...settings.pitch, onsetSensitivity: parseFloat(e.target.value) } })}
              />
            </label>
          </div>
        )}
        {tab === 'visual' && (
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>
              Scroll Speed: {settings.visualizer.scrollSpeedPxPerSec}px/s
              <input type="range" min="20" max="500" step="10" value={settings.visualizer.scrollSpeedPxPerSec}
                style={{ display: 'block', width: '100%', marginTop: 4 }}
                onChange={(e) => onSave({ visualizer: { ...settings.visualizer, scrollSpeedPxPerSec: parseFloat(e.target.value) } })}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>
              Theme:
              <select value={settings.visualizer.theme}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, background: '#0f3460', color: '#e0e0e0', border: '1px solid #e94560' }}
                onChange={(e) => onSave({ visualizer: { ...settings.visualizer, theme: e.target.value as 'dark' | 'light' } })}
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
