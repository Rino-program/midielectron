import type { AppSettings, AudioDevice, PitchDetectionResult, MIDINote, AppError } from '../../shared/types';

export interface AudioLevelEvent {
  rms: number;
  timestamp: number;
}

export interface StartCaptureInput {
  deviceId: string;
  mode?: string;
}

export interface StartRecordingInput {
  outputPath?: string;
}

export interface IpcRouterContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any;
}

export type { AppSettings, AudioDevice, PitchDetectionResult, MIDINote, AppError };
