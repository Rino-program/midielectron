import { describe, it, expect, beforeEach } from 'vitest';
import { MIDIConverter, frequencyToMidi, frequencyToCentsOffset } from './MIDIConverter';
import type { PitchDetectionResult } from '../../shared/types';

function makePitchResult(frequency: number, confidence = 0.9, rms = 0.5): PitchDetectionResult {
  const midiNote = frequencyToMidi(frequency);
  return {
    timestamp: Date.now(),
    pitches: [
      {
        frequency,
        confidence,
        midiNote,
        centsOffset: frequencyToCentsOffset(frequency, midiNote),
      },
    ],
    rms,
    isSilent: false,
  };
}

describe('frequencyToMidi', () => {
  it('converts 440Hz to MIDI note 69 (A4)', () => {
    expect(frequencyToMidi(440)).toBe(69);
  });

  it('converts 261.63Hz to MIDI note 60 (C4)', () => {
    expect(frequencyToMidi(261.63)).toBe(60);
  });

  it('returns -1 for non-positive frequency', () => {
    expect(frequencyToMidi(0)).toBe(-1);
    expect(frequencyToMidi(-10)).toBe(-1);
  });

  it('converts 880Hz to MIDI note 81 (A5)', () => {
    expect(frequencyToMidi(880)).toBe(81);
  });

  it('converts 220Hz to MIDI note 57 (A3)', () => {
    expect(frequencyToMidi(220)).toBe(57);
  });
});

describe('frequencyToCentsOffset', () => {
  it('returns 0 for exact MIDI note frequency', () => {
    expect(frequencyToCentsOffset(440, 69)).toBeCloseTo(0, 1);
  });

  it('calculates cents offset correctly', () => {
    // 441Hz is slightly sharp from A4=440Hz
    const cents = frequencyToCentsOffset(441, 69);
    expect(cents).toBeGreaterThan(0);
    expect(cents).toBeLessThan(10);
  });

  it('returns 0 for non-positive frequency', () => {
    expect(frequencyToCentsOffset(0, 69)).toBe(0);
  });
});

describe('MIDIConverter', () => {
  let converter: MIDIConverter;

  beforeEach(() => {
    converter = new MIDIConverter({
      channel: 1,
      velocityMode: 'fixed',
      fixedVelocity: 100,
      minConfidence: 0.5,
      maxPolyphony: 6,
      minNoteDurationMs: 0,
    });
  });

  it('converts 440Hz to MIDI NoteOn 69', () => {
    const result = makePitchResult(440);
    const events = converter.convert(result);
    const noteOns = events.filter((e) => e.type === 'noteOn');
    expect(noteOns.length).toBeGreaterThan(0);
    expect(noteOns[0].note).toBe(69);
  });

  it('converts 261.63Hz to MIDI NoteOn 60', () => {
    const result = makePitchResult(261.63);
    const events = converter.convert(result);
    const noteOns = events.filter((e) => e.type === 'noteOn');
    expect(noteOns.length).toBeGreaterThan(0);
    expect(noteOns[0].note).toBe(60);
  });

  it('ignores pitches below confidence threshold', () => {
    const result = makePitchResult(440, 0.3); // below 0.5 threshold
    const events = converter.convert(result);
    const noteOns = events.filter((e) => e.type === 'noteOn');
    expect(noteOns.length).toBe(0);
  });

  it('sends NoteOff for all active notes when silent', () => {
    // First, create an active note
    converter.convert(makePitchResult(440));

    // Then send a silent frame
    const silentResult: PitchDetectionResult = {
      timestamp: Date.now(),
      pitches: [],
      rms: 0,
      isSilent: true,
    };
    const events = converter.convert(silentResult);
    const noteOffs = events.filter((e) => e.type === 'noteOff');
    expect(noteOffs.length).toBeGreaterThan(0);
    expect(noteOffs[0].note).toBe(69);
  });

  it('respects maxPolyphony limit', () => {
    converter = new MIDIConverter({ maxPolyphony: 2, minConfidence: 0.5, minNoteDurationMs: 0 });
    const result: PitchDetectionResult = {
      timestamp: Date.now(),
      pitches: [
        { frequency: 261.63, confidence: 0.9, midiNote: 60, centsOffset: 0 },
        { frequency: 329.63, confidence: 0.8, midiNote: 64, centsOffset: 0 },
        { frequency: 392.0, confidence: 0.7, midiNote: 67, centsOffset: 0 },
        { frequency: 523.25, confidence: 0.6, midiNote: 72, centsOffset: 0 },
      ],
      rms: 0.5,
      isSilent: false,
    };
    const events = converter.convert(result);
    const noteOns = events.filter((e) => e.type === 'noteOn');
    expect(noteOns.length).toBeLessThanOrEqual(2);
  });

  it('uses fixed velocity when configured', () => {
    const result = makePitchResult(440);
    const events = converter.convert(result);
    const noteOn = events.find((e) => e.type === 'noteOn');
    expect(noteOn?.velocity).toBe(100);
  });

  it('handles boundary MIDI note 21 (A0)', () => {
    expect(frequencyToMidi(27.5)).toBe(21);
  });

  it('handles boundary MIDI note 108 (C8)', () => {
    expect(frequencyToMidi(4186.01)).toBe(108);
  });

  it('allNotesOff clears active notes', () => {
    converter.convert(makePitchResult(440));
    const events = converter.allNotesOff();
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe('noteOff');
    expect(converter.getActiveNotes().size).toBe(0);
  });
});
