import type { OnsetEvent } from '../../shared/types';

/** Maximum threshold value when sensitivity is 0 (least sensitive). */
const ONSET_THRESHOLD_MAX = 0.15;
/** Minimum threshold value when sensitivity is 1 (most sensitive). */
const ONSET_THRESHOLD_MIN = 0.005;

function computeRMS(buffer: Float32Array): number {
  let sum = 0;
  for (const s of buffer) sum += s * s;
  return Math.sqrt(sum / buffer.length);
}

export class OnsetDetector {
  private sensitivity = 0.5;
  private prevRMS = 0;
  private prevFlux = 0;
  private threshold = 0.05;

  setSensitivity(value: number): void {
    this.sensitivity = Math.max(0, Math.min(1, value));
    this.threshold = ONSET_THRESHOLD_MAX * (1 - this.sensitivity) + ONSET_THRESHOLD_MIN;
  }

  processFrame(buffer: Float32Array): OnsetEvent | null {
    const rms = computeRMS(buffer);

    // Spectral flux approximation using RMS difference
    const flux = Math.max(0, rms - this.prevRMS);
    const onset = flux > this.threshold && flux > this.prevFlux * 1.5;

    this.prevFlux = flux;
    this.prevRMS = rms;

    if (onset) {
      return {
        timestamp: Date.now(),
        strength: Math.min(1, flux / (this.threshold * 4)),
      };
    }
    return null;
  }

  reset(): void {
    this.prevRMS = 0;
    this.prevFlux = 0;
  }
}
