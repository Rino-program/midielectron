import type {
  PitchDetectionResult,
  OnsetEvent,
  MIDINote,
  ActiveNoteInfo,
} from '../../shared/types';

/** Cents deviation above which an active note is re-triggered (half-semitone). */
const RETRIGGER_CENTS_THRESHOLD = 50;
/** Scale factor used in dynamic velocity calculation. */
const VELOCITY_DYNAMIC_SCALE = 4;

export function frequencyToMidi(frequency: number): number {
  if (frequency <= 0) return -1;
  return Math.round(69 + 12 * Math.log2(frequency / 440.0));
}

export function frequencyToCentsOffset(frequency: number, midiNote: number): number {
  if (frequency <= 0) return 0;
  const exactMidi = 69 + 12 * Math.log2(frequency / 440.0);
  return (exactMidi - midiNote) * 100;
}

export interface MIDIConverterConfig {
  channel: number;
  velocityMode: 'fixed' | 'dynamic';
  fixedVelocity: number;
  minConfidence: number;
  maxPolyphony: number;
  pitchBendEnabled: boolean;
  transposeOctaves: number;
  transposeNotes: number;
  minNoteDurationMs: number;
}

export const DEFAULT_CONVERTER_CONFIG: MIDIConverterConfig = {
  channel: 1,
  velocityMode: 'dynamic',
  fixedVelocity: 100,
  minConfidence: 0.5,
  maxPolyphony: 6,
  pitchBendEnabled: false,
  transposeOctaves: 0,
  transposeNotes: 0,
  minNoteDurationMs: 50,
};

export class MIDIConverter {
  private config: MIDIConverterConfig;
  private activeNotes = new Map<number, ActiveNoteInfo>();

  constructor(config: Partial<MIDIConverterConfig> = {}) {
    this.config = { ...DEFAULT_CONVERTER_CONFIG, ...config };
  }

  updateConfig(config: Partial<MIDIConverterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getActiveNotes(): Map<number, ActiveNoteInfo> {
    return new Map(this.activeNotes);
  }

  convert(
    result: PitchDetectionResult,
    onset?: OnsetEvent | null
  ): MIDINote[] {
    const now = result.timestamp;
    const events: MIDINote[] = [];
    const ch = this.config.channel;

    // Silence: send NoteOff for all active notes
    if (result.isSilent || result.pitches.length === 0) {
      for (const [note] of this.activeNotes) {
        events.push({ type: 'noteOff', channel: ch, note, velocity: 0, timestamp: now });
      }
      this.activeNotes.clear();
      return events;
    }

    const transpose = this.config.transposeOctaves * 12 + this.config.transposeNotes;

    // Filter pitches by confidence and map to MIDI notes
    const wantedNotes = new Set<number>();
    for (const pitch of result.pitches) {
      if (pitch.confidence < this.config.minConfidence) continue;
      const raw = frequencyToMidi(pitch.frequency);
      const note = raw + transpose;
      if (note < 0 || note > 127) continue;
      wantedNotes.add(note);
    }

    // Enforce polyphony limit (keep highest-confidence pitches)
    const sortedByConfidence = result.pitches
      .filter((p) => p.confidence >= this.config.minConfidence)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.config.maxPolyphony);

    const allowedNotes = new Set(
      sortedByConfidence.map((p) => frequencyToMidi(p.frequency) + transpose).filter((n) => n >= 0 && n <= 127)
    );

    // Stop notes that are no longer wanted
    for (const [note] of this.activeNotes) {
      if (!allowedNotes.has(note)) {
        // Check minimum duration
        const info = this.activeNotes.get(note)!;
        if (now - info.startTime >= this.config.minNoteDurationMs) {
          events.push({ type: 'noteOff', channel: ch, note, velocity: 0, timestamp: now });
          this.activeNotes.delete(note);
        }
      }
    }

    // Start new notes or handle pitch shifts
    for (const pitch of sortedByConfidence) {
      const raw = frequencyToMidi(pitch.frequency);
      const note = raw + transpose;
      if (note < 0 || note > 127) continue;

      const existing = this.activeNotes.get(note);
      if (existing) {
        // Note is already active - check for large pitch deviation (>50 cents)
        const cents = Math.abs(frequencyToCentsOffset(pitch.frequency, raw));
        if (cents > RETRIGGER_CENTS_THRESHOLD) {
          // Re-trigger
          events.push({ type: 'noteOff', channel: ch, note, velocity: 0, timestamp: now });
          const velocity = this.calcVelocity(pitch.confidence, result.rms);
          events.push({ type: 'noteOn', channel: ch, note, velocity, timestamp: now });
          this.activeNotes.set(note, { note, velocity, startTime: now, channel: ch });
        }
      } else {
        // New note - apply onset correction
        const velocity = this.calcVelocity(
          pitch.confidence,
          onset ? onset.strength : result.rms
        );
        events.push({ type: 'noteOn', channel: ch, note, velocity, timestamp: now });
        this.activeNotes.set(note, { note, velocity, startTime: now, channel: ch });
      }
    }

    return events;
  }

  allNotesOff(): MIDINote[] {
    const now = Date.now();
    const events: MIDINote[] = [];
    for (const [note] of this.activeNotes) {
      events.push({ type: 'noteOff', channel: this.config.channel, note, velocity: 0, timestamp: now });
    }
    this.activeNotes.clear();
    return events;
  }

  private calcVelocity(confidence: number, rms: number): number {
    if (this.config.velocityMode === 'fixed') {
      return this.config.fixedVelocity;
    }
    // Dynamic: combine confidence and RMS amplitude
    const vel = Math.round(confidence * rms * VELOCITY_DYNAMIC_SCALE * 127);
    return Math.max(1, Math.min(127, vel));
  }
}
