import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import { PianoRollVisualizer } from './components/PianoRoll/PianoRollVisualizer';
import { WaveformVisualizer } from './components/Waveform/WaveformVisualizer';
import { TransportControls } from './components/Transport/TransportControls';
import { SettingsPanel } from './components/Settings/SettingsPanel';
import { processMediaFile } from './utils/processMediaFile';
import type { MIDINote, ActiveNoteInfo } from '../shared/types';

const styles: Record<string, React.CSSProperties> = {
  app: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: '#1a1a2e',
    color: '#e0e0e0',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    background: '#16213e',
    borderBottom: '1px solid #0f3460',
    gap: 16,
  },
  title: { fontSize: 18, fontWeight: 700, color: '#e94560', marginRight: 'auto' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  pianoRollArea: { flex: 1, position: 'relative', overflow: 'hidden' },
  waveformArea: { height: 80, borderTop: '1px solid #0f3460' },
  statusBar: {
    display: 'flex',
    gap: 24,
    padding: '4px 16px',
    background: '#0f3460',
    fontSize: 12,
    color: '#a0a0b0',
  },
  select: {
    background: '#0f3460',
    color: '#e0e0e0',
    border: '1px solid #e94560',
    borderRadius: 4,
    padding: '4px 8px',
    fontSize: 13,
  },
};

export default function App(): React.ReactElement {
  const {
    isCapturing,
    isRecording,
    activeNotes,
    audioLevel,
    latencyMs,
    settings,
    startCapture,
    stopCapture,
    startRecording,
    stopRecording,
    updateSettings,
    setAudioLevel,
    setActiveNote,
    removeActiveNote,
  } = useAppStore();

  const [showSettings, setShowSettings] = useState(false);
  const [audioDevices, setAudioDevices] = useState<{ id: string; name: string }[]>([]);
  const [midiPorts, setMidiPorts] = useState<string[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const ipc = window.electron?.ipcRenderer;
    if (ipc) {
      ipc.invoke('listAudioDevices').then((devs: unknown) => {
        const devices = devs as { id: string; name: string }[];
        setAudioDevices(devices);
        // Auto-select first device if none is persisted in settings
        if (devices.length > 0 && !settings.audio.inputDeviceId) {
          updateSettings({ audio: { ...settings.audio, inputDeviceId: devices[0].id } });
        }
      }).catch(console.error);
      ipc.invoke('listMIDIPorts').then((ports: unknown) => {
        setMidiPorts(ports as string[]);
      }).catch(console.error);
    }
  }, []);

  const handleMidiSave = useCallback(async () => {
    const ipc = window.electron?.ipcRenderer;
    if (!ipc) return;
    await ipc.invoke('saveRecording');
  }, []);

  const handleMediaFileSelected = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || isConverting) return;

    const ipc = window.electron?.ipcRenderer;
    if (!ipc) return;

    setIsConverting(true);
    setConversionProgress(0);
    try {
      await ipc.invoke('stopCapture');
      await ipc.invoke('startRecording');
      await processMediaFile({
        file,
        frameSize: settings.audio.frameSize,
        sampleRate: settings.audio.sampleRate,
        onProgress: setConversionProgress,
        onFrame: async (frame) => {
          await ipc.invoke('processAudioFrame', Array.from(frame));
        },
      });
      await ipc.invoke('stopRecording');
      await ipc.invoke('saveRecording');
    } catch (err) {
      console.error(err);
    } finally {
      setIsConverting(false);
      setConversionProgress(0);
    }
  }, [isConverting, settings.audio.frameSize, settings.audio.sampleRate]);

  useEffect(() => {
    const handleAudioLevel = (e: Event) => {
      const detail = (e as CustomEvent<{ rms: number }>).detail;
      setAudioLevel(detail.rms);
    };
    const handleMIDINote = (e: Event) => {
      const note = (e as CustomEvent<MIDINote>).detail;
      if (note.type === 'noteOn') {
        const info: ActiveNoteInfo = {
          note: note.note,
          velocity: note.velocity,
          startTime: note.timestamp,
          channel: note.channel,
        };
        setActiveNote(note.note, info);
      } else {
        removeActiveNote(note.note);
      }
    };

    window.addEventListener('audioLevel', handleAudioLevel);
    window.addEventListener('midiNote', handleMIDINote);
    return () => {
      window.removeEventListener('audioLevel', handleAudioLevel);
      window.removeEventListener('midiNote', handleMIDINote);
    };
  }, [setAudioLevel, setActiveNote, removeActiveNote]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.code === 'Space') {
      e.preventDefault();
      isCapturing ? stopCapture() : startCapture();
    } else if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) {
      isRecording ? stopRecording() : startRecording();
    } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
      e.preventDefault();
      if (isRecording) stopRecording();
    } else if ((e.ctrlKey || e.metaKey) && e.code === 'Comma') {
      e.preventDefault();
      setShowSettings((v) => !v);
    } else if (e.code === 'Escape') {
      setShowSettings(false);
    }
  }, [isCapturing, isRecording, startCapture, stopCapture, startRecording, stopRecording]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <span style={styles.title}>AudioMIDI Bridge</span>
        <select
          style={styles.select}
          value={settings.audio.inputDeviceId}
          onChange={(e) => updateSettings({ audio: { ...settings.audio, inputDeviceId: e.target.value } })}
        >
          {audioDevices.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
          {audioDevices.length === 0 && <option value="">No devices</option>}
        </select>
        <select
          style={styles.select}
          value={settings.midi.outputPortIndex}
          onChange={(e) => updateSettings({ midi: { ...settings.midi, outputPortIndex: Number(e.target.value) } })}
        >
          {midiPorts.map((p, i) => (
            <option key={i} value={i}>{p}</option>
          ))}
          {midiPorts.length === 0 && <option value="0">Virtual Port</option>}
        </select>
        <select
          style={styles.select}
          value={settings.pitch.detectionMode}
          onChange={(e) => updateSettings({
            pitch: { ...settings.pitch, detectionMode: e.target.value as import('../shared/types').DetectionMode }
          })}
        >
          <option value="low-latency">Low Latency</option>
          <option value="polyphonic">Polyphonic</option>
          <option value="high-accuracy">High Accuracy</option>
        </select>
        <button
          style={{ ...styles.select, cursor: 'pointer' }}
          onClick={() => setShowSettings((v) => !v)}
        >
          ⚙ Settings
        </button>
        <button
          style={{ ...styles.select, cursor: 'pointer', opacity: isConverting ? 0.6 : 1 }}
          onClick={() => fileInputRef.current?.click()}
          disabled={isConverting}
        >
          {isConverting ? `変換中... ${conversionProgress.toFixed(0)}%` : 'Audio/Videoファイル'}
        </button>
        <button
          style={{ ...styles.select, cursor: 'pointer' }}
          onClick={handleMidiSave}
        >
          MIDI保存
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,video/*"
          style={{ display: 'none' }}
          onChange={handleMediaFileSelected}
        />
      </header>
      <main style={styles.main}>
        <div style={styles.pianoRollArea}>
          <PianoRollVisualizer
            activeNotes={activeNotes}
            displayRangeMin={settings.visualizer.displayRangeMin}
            displayRangeMax={settings.visualizer.displayRangeMax}
          />
        </div>
        <div style={styles.waveformArea}>
          <WaveformVisualizer audioLevel={audioLevel} />
        </div>
        <TransportControls
          isCapturing={isCapturing}
          isRecording={isRecording}
          onStart={startCapture}
          onStop={stopCapture}
          onRecord={startRecording}
          onStopRecord={stopRecording}
          onSave={() => {
            stopRecording();
          }}
        />
      </main>
      <div style={styles.statusBar}>
        <span>Latency: {latencyMs.toFixed(1)}ms</span>
        <span>Active notes: {activeNotes.size}</span>
        <span>Level: {(audioLevel * 100).toFixed(1)}%</span>
        <span>{isCapturing ? '🔴 Capturing' : '⏹ Stopped'}</span>
        {isRecording && <span>⏺ Recording</span>}
        {isConverting && <span>Converting: {conversionProgress.toFixed(0)}%</span>}
      </div>
      {isConverting && (
        <div style={{ height: 6, background: '#0b1220' }}>
          <div
            style={{
              height: '100%',
              width: `${conversionProgress}%`,
              background: 'linear-gradient(90deg, #2ecc71, #3498db)',
              transition: 'width 120ms linear',
            }}
          />
        </div>
      )}
      {showSettings && (
        <SettingsPanel
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSave={(s) => updateSettings(s)}
        />
      )}
    </div>
  );
}
