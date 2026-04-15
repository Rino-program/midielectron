import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// electron-log is an Electron-only package; mock it for unit tests
vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { SMFWriter } from './SMFWriter';
import type { MIDINote } from '../../shared/types';

/** Byte offset at which track event data starts in the exported SMF buffer. */
const SMF_HEADER_CHUNK_SIZE = 14;  // MThd (4) + length field (4) + format+tracks+ppq (6)
const SMF_TRACK_HEADER_SIZE = 8;   // MTrk (4) + length field (4)
const TRACK_DATA_START = SMF_HEADER_CHUNK_SIZE + SMF_TRACK_HEADER_SIZE;

function makeNote(
  type: 'noteOn' | 'noteOff',
  note: number,
  velocity: number,
  timestamp: number,
  channel = 1,
): MIDINote {
  return { type, channel, note, velocity, timestamp };
}

describe('SMFWriter', () => {
  let writer: SMFWriter;
  const startTime = 1000; // ms

  beforeEach(() => {
    writer = new SMFWriter(120, 480);
  });

  it('getEventCount returns 0 before recording', () => {
    expect(writer.getEventCount()).toBe(0);
  });

  it('getEventCount returns 0 when notes added without recording started', () => {
    writer.addNote(makeNote('noteOn', 60, 100, startTime));
    expect(writer.getEventCount()).toBe(0);
  });

  it('records notes after startRecording', () => {
    writer.startRecording(startTime);
    writer.addNote(makeNote('noteOn', 60, 100, startTime));
    writer.addNote(makeNote('noteOff', 60, 0, startTime + 500));
    expect(writer.getEventCount()).toBe(2);
  });

  it('stops recording after stopRecording; further notes ignored', () => {
    writer.startRecording(startTime);
    writer.addNote(makeNote('noteOn', 60, 100, startTime));
    writer.stopRecording();
    writer.addNote(makeNote('noteOn', 64, 100, startTime + 100));
    expect(writer.getEventCount()).toBe(1);
  });

  it('startRecording resets previous events', () => {
    writer.startRecording(startTime);
    writer.addNote(makeNote('noteOn', 60, 100, startTime));
    writer.stopRecording();
    // Start a new recording — old events should be cleared
    writer.startRecording(startTime + 1000);
    expect(writer.getEventCount()).toBe(0);
  });

  it('exports a valid SMF file with correct header magic bytes', () => {
    const filePath = join(tmpdir(), `test_${Date.now()}.mid`);
    try {
      writer.startRecording(startTime);
      writer.addNote(makeNote('noteOn', 60, 100, startTime));
      writer.addNote(makeNote('noteOff', 60, 0, startTime + 500));
      writer.stopRecording();
      writer.export(filePath);

      const buf = readFileSync(filePath);
      // SMF header: MThd
      expect(buf.slice(0, 4).toString('ascii')).toBe('MThd');
      // Header chunk length = 6
      expect(buf.readUInt32BE(4)).toBe(6);
      // Format 0
      expect(buf.readUInt16BE(8)).toBe(0);
      // 1 track
      expect(buf.readUInt16BE(10)).toBe(1);
      // PPQ = 480
      expect(buf.readUInt16BE(12)).toBe(480);
      // Track header: MTrk
      expect(buf.slice(14, 18).toString('ascii')).toBe('MTrk');
    } finally {
      if (existsSync(filePath)) unlinkSync(filePath);
    }
  });

  it('exportToDefault generates a timestamped .mid filename', () => {
    writer.startRecording(startTime);
    writer.addNote(makeNote('noteOn', 69, 80, startTime));
    writer.stopRecording();
    const filePath = writer.exportToDefault(tmpdir());
    try {
      expect(filePath).toMatch(/recording_\d{8}_\d{6}\.mid$/);
      expect(existsSync(filePath)).toBe(true);
    } finally {
      if (existsSync(filePath)) unlinkSync(filePath);
    }
  });

  it('throws on export to invalid path', () => {
    writer.startRecording(startTime);
    writer.stopRecording();
    expect(() => writer.export('/nonexistent/path/file.mid')).toThrow();
  });

  it('encodes note events with correct MIDI status bytes', () => {
    const filePath = join(tmpdir(), `test_status_${Date.now()}.mid`);
    try {
      writer.startRecording(startTime);
      writer.addNote(makeNote('noteOn', 60, 100, startTime));
      writer.addNote(makeNote('noteOff', 60, 0, startTime + 200));
      writer.stopRecording();
      writer.export(filePath);

      const buf = readFileSync(filePath);
      const data = buf.slice(TRACK_DATA_START);
      const allBytes = Array.from(data);
      expect(allBytes).toContain(0x90); // noteOn ch1
      expect(allBytes).toContain(0x80); // noteOff ch1
    } finally {
      if (existsSync(filePath)) unlinkSync(filePath);
    }
  });
});
