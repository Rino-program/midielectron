/// <reference types="vite/client" />

interface ElectronAPI {
  ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
    on(channel: string, listener: (...args: unknown[]) => void): void;
    off(channel: string, listener: (...args: unknown[]) => void): void;
  };
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}

export {};
