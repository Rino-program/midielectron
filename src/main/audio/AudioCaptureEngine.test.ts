import { describe, it, expect } from 'vitest';
import { AudioCaptureEngine } from './AudioCaptureEngine';

describe('AudioCaptureEngine', () => {
  it('creates an instance', () => {
    const engine = new AudioCaptureEngine();
    expect(engine).toBeDefined();
  });

  it('listDevices returns empty array when naudiodon unavailable', () => {
    const engine = new AudioCaptureEngine();
    const devices = engine.listDevices();
    expect(Array.isArray(devices)).toBe(true);
  });

  it('emits error when started without initialization', () => {
    const engine = new AudioCaptureEngine();
    const errors: unknown[] = [];
    engine.on('error', (e) => errors.push(e));
    engine.start();
    expect(errors.length).toBeGreaterThan(0);
  });

  it('initializes with config', () => {
    const engine = new AudioCaptureEngine();
    expect(() =>
      engine.initialize({ deviceId: 0, sampleRate: 44100, frameSize: 1024 })
    ).not.toThrow();
  });

  it('stop is safe to call when not running', () => {
    const engine = new AudioCaptureEngine();
    expect(() => engine.stop()).not.toThrow();
  });
});
