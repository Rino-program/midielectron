import type { AppSettings } from './types';

export const DEFAULT_SETTINGS: AppSettings = {
  audio: {
    inputDeviceId: '',
    captureMode: 'microphone',
    sampleRate: 44100,
    frameSize: 1024,
    silenceThreshold: 0.01,
  },
  pitch: {
    detectionMode: 'low-latency',
    minConfidence: 0.5,
    minFrequency: 40,
    maxFrequency: 4200,
    onsetSensitivity: 0.5,
    smoothingWindowMs: 20,
  },
  midi: {
    outputPortIndex: 0,
    channel: 1,
    velocityMode: 'dynamic',
    fixedVelocity: 100,
    minNoteDurationMs: 50,
    maxPolyphony: 6,
    pitchBendEnabled: false,
    transposeOctaves: 0,
    transposeNotes: 0,
  },
  visualizer: {
    scrollSpeedPxPerSec: 100,
    displayRangeMin: 21,
    displayRangeMax: 108,
    showVelocity: true,
    theme: 'dark',
  },
  recording: {
    defaultSavePath: '',
    tempo: 120,
    autoSave: false,
  },
};

export const MELODIA_CONFIG = {
  sampleRate: 44100,
  frameSize: 2048,
  hopSize: 128,
  minFrequency: 40,
  maxFrequency: 4200,
  magnitudeThreshold: 0.000001,
  peakFrameThreshold: 0.9,
  pitchContinuity: 27.5625,
  voicingTolerance: 0.2,
};

export enum AudioMIDIErrorCode {
  AUDIO_DEVICE_NOT_FOUND = 'AUDIO_001',
  AUDIO_PERMISSION_DENIED = 'AUDIO_002',
  AUDIO_STREAM_INTERRUPTED = 'AUDIO_003',
  LOOPBACK_NOT_SUPPORTED = 'AUDIO_004',
  WASM_LOAD_FAILED = 'PITCH_001',
  MODEL_LOAD_FAILED = 'PITCH_002',
  DETECTION_TIMEOUT = 'PITCH_003',
  MIDI_PORT_NOT_FOUND = 'MIDI_001',
  MIDI_SEND_FAILED = 'MIDI_002',
  VIRTUAL_PORT_CREATION_FAILED = 'MIDI_003',
  SMF_WRITE_FAILED = 'FILE_001',
  INSUFFICIENT_DISK_SPACE = 'FILE_002',
}
