import { EventEmitter } from 'events';
import type { AudioDevice } from '../../shared/types';
import { AudioMIDIErrorCode } from '../../shared/constants';

interface NaudiodonDevice {
  id: number;
  name: string;
  maxInputChannels: number;
  maxOutputChannels: number;
  defaultSampleRate: number;
  hostAPIName: string;
}

interface AudioIOOptions {
  inOptions: {
    channelCount: number;
    sampleFormat: number;
    sampleRate: number;
    deviceId: number;
    closeOnError: boolean;
  };
}

interface AudioIO {
  on(event: string, listener: (...args: unknown[]) => void): this;
  start(): void;
  quit(): void;
}

// Lazy-load naudiodon so missing native module doesn't crash startup
function getNaudiodon(): { getDeviceList: () => NaudiodonDevice[]; AudioIO: new (opts: AudioIOOptions) => AudioIO; SampleFormat16Bit: number } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('naudiodon');
  } catch {
    return null;
  }
}

export interface CaptureConfig {
  deviceId: number;
  sampleRate: 44100 | 48000;
  frameSize: 512 | 1024 | 2048;
  channels?: number;
}

const RING_BUFFER_SIZE = 4;

export class AudioCaptureEngine extends EventEmitter {
  private stream: AudioIO | null = null;
  private ringBuffer: Float32Array[] = [];
  private ringWriteIdx = 0;
  private running = false;
  private config: CaptureConfig | null = null;

  listDevices(): AudioDevice[] {
    const naudiodon = getNaudiodon();
    if (!naudiodon) {
      return [];
    }
    try {
      return naudiodon.getDeviceList().map((d) => ({
        id: String(d.id),
        name: d.name,
        maxInputChannels: d.maxInputChannels,
        maxOutputChannels: d.maxOutputChannels,
        defaultSampleRate: d.defaultSampleRate,
        isLoopback: d.hostAPIName?.toLowerCase().includes('wasapi') ?? false,
      }));
    } catch (err) {
      this.emit('error', {
        code: AudioMIDIErrorCode.AUDIO_DEVICE_NOT_FOUND,
        message: String(err),
        timestamp: Date.now(),
      });
      return [];
    }
  }

  initialize(config: CaptureConfig): void {
    this.config = config;
    // Pre-allocate ring buffer slots
    for (let i = 0; i < RING_BUFFER_SIZE; i++) {
      this.ringBuffer.push(new Float32Array(config.frameSize));
    }
  }

  start(): void {
    if (this.running) return;
    if (!this.config) {
      this.emit('error', {
        code: AudioMIDIErrorCode.AUDIO_DEVICE_NOT_FOUND,
        message: 'AudioCaptureEngine not initialized',
        timestamp: Date.now(),
      });
      return;
    }

    const naudiodon = getNaudiodon();
    if (!naudiodon) {
      this.emit('error', {
        code: AudioMIDIErrorCode.AUDIO_DEVICE_NOT_FOUND,
        message: 'naudiodon native module not available',
        timestamp: Date.now(),
      });
      return;
    }

    try {
      const channels = this.config.channels ?? 1;
      this.stream = new naudiodon.AudioIO({
        inOptions: {
          channelCount: channels,
          sampleFormat: naudiodon.SampleFormat16Bit,
          sampleRate: this.config.sampleRate,
          deviceId: this.config.deviceId,
          closeOnError: false,
        },
      });

      this.stream.on('data', (...args: unknown[]) => {
        this.handleData(args[0] as Buffer, channels);
      });

      this.stream.on('error', (...args: unknown[]) => {
        const err = args[0] as Error;
        this.emit('error', {
          code: AudioMIDIErrorCode.AUDIO_STREAM_INTERRUPTED,
          message: err.message,
          timestamp: Date.now(),
        });
      });

      this.stream.start();
      this.running = true;
    } catch (err) {
      this.emit('error', {
        code: AudioMIDIErrorCode.AUDIO_STREAM_INTERRUPTED,
        message: String(err),
        timestamp: Date.now(),
      });
    }
  }

  stop(): void {
    if (!this.running || !this.stream) return;
    try {
      this.stream.quit();
    } catch {
      // Ignore quit errors
    }
    this.stream = null;
    this.running = false;
  }

  private handleData(chunk: Buffer, channels: number): void {
    const frameSize = this.config!.frameSize;
    // 16-bit samples → 2 bytes per sample per channel
    const bytesPerSample = 2;
    const totalSamples = chunk.length / (bytesPerSample * channels);

    for (let offset = 0; offset < totalSamples; offset += frameSize) {
      const slot = this.ringBuffer[this.ringWriteIdx % RING_BUFFER_SIZE];
      const count = Math.min(frameSize, totalSamples - offset);

      for (let i = 0; i < count; i++) {
        if (channels === 1) {
          const bytePos = (offset + i) * bytesPerSample;
          const sample = chunk.readInt16LE(bytePos);
          slot[i] = sample / 32768.0;
        } else {
          // Stereo to mono downmix
          const bytePos = (offset + i) * bytesPerSample * channels;
          const left = chunk.readInt16LE(bytePos);
          const right = chunk.readInt16LE(bytePos + bytesPerSample);
          slot[i] = (left + right) / (2 * 32768.0);
        }
      }

      if (count === frameSize) {
        this.emit('audioFrame', slot.slice(0));
        this.ringWriteIdx++;
      }
    }
  }
}
