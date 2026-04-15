export type CaptureMode = 'loopback' | 'microphone' | 'virtual-device';
export type DetectionMode = 'high-accuracy' | 'polyphonic' | 'low-latency';
export type VelocityMode = 'fixed' | 'dynamic';

export interface AudioDevice {
  id: string;
  name: string;
  maxInputChannels: number;
  maxOutputChannels: number;
  defaultSampleRate: number;
  isLoopback: boolean;
}

export interface PitchInfo {
  frequency: number;
  confidence: number;
  midiNote: number;
  centsOffset: number;
}

export interface PitchDetectionResult {
  timestamp: number;
  pitches: PitchInfo[];
  rms: number;
  isSilent: boolean;
}

export interface OnsetEvent {
  timestamp: number;
  strength: number;
}

export interface MIDINote {
  type: 'noteOn' | 'noteOff';
  channel: number;
  note: number;
  velocity: number;
  timestamp: number;
}

export interface AppSettings {
  audio: {
    inputDeviceId: string;
    captureMode: CaptureMode;
    sampleRate: 44100 | 48000;
    frameSize: 512 | 1024 | 2048;
    silenceThreshold: number;
  };
  pitch: {
    detectionMode: DetectionMode;
    minConfidence: number;
    minFrequency: number;
    maxFrequency: number;
    onsetSensitivity: number;
    smoothingWindowMs: number;
  };
  midi: {
    outputPortIndex: number;
    channel: number;
    velocityMode: VelocityMode;
    fixedVelocity: number;
    minNoteDurationMs: number;
    maxPolyphony: number;
    pitchBendEnabled: boolean;
    transposeOctaves: number;
    transposeNotes: number;
  };
  visualizer: {
    scrollSpeedPxPerSec: number;
    displayRangeMin: number;
    displayRangeMax: number;
    showVelocity: boolean;
    theme: 'dark' | 'light';
  };
  recording: {
    defaultSavePath: string;
    tempo: number;
    autoSave: boolean;
  };
}

export interface AppError {
  code: string;
  message: string;
  timestamp: number;
}

export interface ActiveNoteInfo {
  note: number;
  velocity: number;
  startTime: number;
  channel: number;
}
