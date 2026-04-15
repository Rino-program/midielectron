import type { AppSettings } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/constants';
import log from 'electron-log';

function getElectronStore(): { get: (key: string, def: unknown) => unknown; set: (key: string, val: unknown) => void } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Store = require('electron-store');
    return new Store();
  } catch {
    return null;
  }
}

export class AppState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private store: any;
  private memorySettings: AppSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

  constructor() {
    this.store = getElectronStore();
    if (!this.store) {
      log.warn('electron-store not available; settings will not persist');
    }
  }

  getSettings(): AppSettings {
    if (!this.store) return this.memorySettings;
    try {
      const saved = this.store.get('settings', {}) as Partial<AppSettings>;
      // Deep-merge so newly added default keys are always present
      return {
        audio: { ...DEFAULT_SETTINGS.audio, ...(saved.audio ?? {}) },
        pitch: { ...DEFAULT_SETTINGS.pitch, ...(saved.pitch ?? {}) },
        midi: { ...DEFAULT_SETTINGS.midi, ...(saved.midi ?? {}) },
        visualizer: { ...DEFAULT_SETTINGS.visualizer, ...(saved.visualizer ?? {}) },
        recording: { ...DEFAULT_SETTINGS.recording, ...(saved.recording ?? {}) },
      };
    } catch {
      return this.memorySettings;
    }
  }

  saveSettings(settings: AppSettings): void {
    this.memorySettings = settings;
    if (!this.store) return;
    try {
      this.store.set('settings', settings);
    } catch (err) {
      log.error(`Failed to save settings: ${err}`);
    }
  }
}
