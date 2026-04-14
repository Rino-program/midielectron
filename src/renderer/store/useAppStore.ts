import { create } from 'zustand';
import type { DetectionMode, ActiveNoteInfo, AppSettings } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/constants';

interface AppStore {
  isCapturing: boolean;
  isRecording: boolean;
  detectionMode: DetectionMode;
  activeNotes: Map<number, ActiveNoteInfo>;
  audioLevel: number;
  latencyMs: number;
  settings: AppSettings;
  startCapture(): void;
  stopCapture(): void;
  startRecording(): void;
  stopRecording(): void;
  updateSettings(partial: Partial<AppSettings>): void;
  setAudioLevel(level: number): void;
  setLatency(ms: number): void;
  setActiveNote(note: number, info: ActiveNoteInfo): void;
  removeActiveNote(note: number): void;
  clearActiveNotes(): void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  isCapturing: false,
  isRecording: false,
  detectionMode: DEFAULT_SETTINGS.pitch.detectionMode,
  activeNotes: new Map(),
  audioLevel: 0,
  latencyMs: 0,
  settings: DEFAULT_SETTINGS,

  startCapture() {
    const { settings } = get();
    window.electron?.ipcRenderer?.invoke('startCapture', settings.audio.inputDeviceId);
    set({ isCapturing: true });
  },

  stopCapture() {
    window.electron?.ipcRenderer?.invoke('stopCapture');
    set({ isCapturing: false });
  },

  startRecording() {
    window.electron?.ipcRenderer?.invoke('startRecording');
    set({ isRecording: true });
  },

  stopRecording() {
    window.electron?.ipcRenderer?.invoke('stopRecording');
    set({ isRecording: false });
  },

  updateSettings(partial) {
    const current = get().settings;
    const updated = { ...current, ...partial };
    set({ settings: updated });
    window.electron?.ipcRenderer?.invoke('updateSettings', updated);
  },

  setAudioLevel(level) {
    set({ audioLevel: level });
  },

  setLatency(ms) {
    set({ latencyMs: ms });
  },

  setActiveNote(note, info) {
    set((state) => {
      const next = new Map(state.activeNotes);
      next.set(note, info);
      return { activeNotes: next };
    });
  },

  removeActiveNote(note) {
    set((state) => {
      const next = new Map(state.activeNotes);
      next.delete(note);
      return { activeNotes: next };
    });
  },

  clearActiveNotes() {
    set({ activeNotes: new Map() });
  },
}));
