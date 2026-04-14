import type { DetectionMode, PitchDetectionResult, PitchInfo } from '../../shared/types';

function frequencyToMidi(frequency: number): number {
  if (frequency <= 0) return -1;
  return Math.round(69 + 12 * Math.log2(frequency / 440.0));
}

function frequencyToCentsOffset(frequency: number, midiNote: number): number {
  if (frequency <= 0) return 0;
  const exactMidi = 69 + 12 * Math.log2(frequency / 440.0);
  return (exactMidi - midiNote) * 100;
}

function computeRMS(buffer: Float32Array): number {
  let sum = 0;
  for (const s of buffer) sum += s * s;
  return Math.sqrt(sum / buffer.length);
}

// Pure TypeScript YIN pitch detection fallback
function yinPitch(buffer: Float32Array, sampleRate: number): { frequency: number; confidence: number } {
  const threshold = 0.1;
  const halfLen = Math.floor(buffer.length / 2);
  const yinBuffer = new Float32Array(halfLen);

  // Difference function
  for (let tau = 1; tau < halfLen; tau++) {
    let sum = 0;
    for (let i = 0; i < halfLen; i++) {
      const delta = buffer[i] - buffer[i + tau];
      sum += delta * delta;
    }
    yinBuffer[tau] = sum;
  }

  // Cumulative mean normalized difference
  yinBuffer[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < halfLen; tau++) {
    runningSum += yinBuffer[tau];
    yinBuffer[tau] *= tau / runningSum;
  }

  // Absolute threshold
  let tauEstimate = -1;
  for (let tau = 2; tau < halfLen; tau++) {
    if (yinBuffer[tau] < threshold) {
      while (tau + 1 < halfLen && yinBuffer[tau + 1] < yinBuffer[tau]) {
        tau++;
      }
      tauEstimate = tau;
      break;
    }
  }

  if (tauEstimate === -1) {
    return { frequency: 0, confidence: 0 };
  }

  // Parabolic interpolation
  const x0 = tauEstimate < 1 ? tauEstimate : tauEstimate - 1;
  const x2 = tauEstimate + 1 < halfLen ? tauEstimate + 1 : tauEstimate;
  let betterTau: number;
  if (x0 === tauEstimate) {
    betterTau = yinBuffer[tauEstimate] <= yinBuffer[x2] ? tauEstimate : x2;
  } else if (x2 === tauEstimate) {
    betterTau = yinBuffer[tauEstimate] <= yinBuffer[x0] ? tauEstimate : x0;
  } else {
    const s0 = yinBuffer[x0];
    const s1 = yinBuffer[tauEstimate];
    const s2 = yinBuffer[x2];
    betterTau = tauEstimate + (s2 - s0) / (2 * (2 * s1 - s2 - s0));
  }

  const frequency = sampleRate / betterTau;
  const confidence = 1 - yinBuffer[tauEstimate];
  return { frequency, confidence: Math.max(0, Math.min(1, confidence)) };
}

export class PitchDetectionEngine {
  private mode: DetectionMode = 'low-latency';
  private sampleRate = 44100;
  private silenceThreshold = 0.01;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private essentiaInstance: any = null;

  async initialize(mode: DetectionMode, sampleRate = 44100): Promise<void> {
    this.mode = mode;
    this.sampleRate = sampleRate;

    if (mode === 'polyphonic') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const EssentiaWASM = require('essentia.js');
        this.essentiaInstance = await EssentiaWASM.EssentiaWASM();
      } catch {
        // Fall back to YIN
      }
    }
  }

  processFrame(buffer: Float32Array): PitchDetectionResult {
    const rms = computeRMS(buffer);
    const isSilent = rms < this.silenceThreshold;
    const timestamp = Date.now();

    if (isSilent) {
      return { timestamp, pitches: [], rms, isSilent: true };
    }

    const pitches: PitchInfo[] = [];

    if (this.mode === 'polyphonic' && this.essentiaInstance) {
      pitches.push(...this.processPolyphonic(buffer));
    } else {
      // YIN fallback for low-latency and high-accuracy without CREPE loaded
      const { frequency, confidence } = yinPitch(buffer, this.sampleRate);
      if (frequency > 0 && confidence > 0) {
        const midiNote = frequencyToMidi(frequency);
        if (midiNote >= 0 && midiNote <= 127) {
          pitches.push({
            frequency,
            confidence,
            midiNote,
            centsOffset: frequencyToCentsOffset(frequency, midiNote),
          });
        }
      }
    }

    return { timestamp, pitches, rms, isSilent: false };
  }

  private processPolyphonic(buffer: Float32Array): PitchInfo[] {
    const pitches: PitchInfo[] = [];
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const essentia = this.essentiaInstance as any;
      const vectorSignal = essentia.arrayToVector(Array.from(buffer));
      const result = essentia.MultiPitchMelodia(vectorSignal);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const freqs: number[] = essentia.vectorToArray(result.pitch) as any;
      for (const freq of freqs) {
        if (freq > 0) {
          const midiNote = frequencyToMidi(freq);
          if (midiNote >= 0 && midiNote <= 127) {
            pitches.push({
              frequency: freq,
              confidence: 0.8,
              midiNote,
              centsOffset: frequencyToCentsOffset(freq, midiNote),
            });
          }
        }
      }
    } catch {
      // ignore
    }
    return pitches;
  }

  setSilenceThreshold(threshold: number): void {
    this.silenceThreshold = threshold;
  }
}
