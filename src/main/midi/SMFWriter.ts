import * as fs from 'fs';
import * as path from 'path';
import type { MIDINote } from '../../shared/types';
import { AudioMIDIErrorCode } from '../../shared/constants';
import log from 'electron-log';

interface TimedNote extends MIDINote {
  tick: number;
}

export class SMFWriter {
  private events: TimedNote[] = [];
  private startTime = 0;
  private recording = false;
  private tempo: number;
  private ppq: number;

  constructor(tempo = 120, ppq = 480) {
    this.tempo = tempo;
    this.ppq = ppq;
  }

  setTempo(tempo: number): void {
    this.tempo = tempo;
  }

  startRecording(startTime?: number): void {
    this.events = [];
    this.startTime = startTime ?? Date.now();
    this.recording = true;
  }

  stopRecording(): void {
    this.recording = false;
  }

  addNote(note: MIDINote): void {
    if (!this.recording) return;
    const elapsedMs = note.timestamp - this.startTime;
    const tick = Math.round((elapsedMs / 1000) * (this.tempo / 60) * this.ppq);
    this.events.push({ ...note, tick });
  }

  getEventCount(): number {
    return this.events.length;
  }

  export(filePath: string): void {
    try {
      // Build a minimal SMF Format 0 file manually
      const header = this.buildHeader();
      const track = this.buildTrack();
      const buf = Buffer.concat([header, track]);
      fs.writeFileSync(filePath, buf);
      log.info(`SMF exported to ${filePath}`);
    } catch (err) {
      log.error(`SMF write failed: ${err}`);
      throw new Error(`${AudioMIDIErrorCode.SMF_WRITE_FAILED}: ${err}`);
    }
  }

  exportToDefault(dir: string): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const name = `recording_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.mid`;
    const filePath = path.join(dir, name);
    this.export(filePath);
    return filePath;
  }

  private buildHeader(): Buffer {
    // MThd chunk
    const buf = Buffer.alloc(14);
    buf.write('MThd', 0, 'ascii');
    buf.writeUInt32BE(6, 4);       // chunk length
    buf.writeUInt16BE(0, 8);       // format 0
    buf.writeUInt16BE(1, 10);      // 1 track
    buf.writeUInt16BE(this.ppq, 12); // ticks per quarter
    return buf;
  }

  private buildTrack(): Buffer {
    const events: Buffer[] = [];

    // Tempo meta event
    const bpm = this.tempo;
    const usPerBeat = Math.round(60000000 / bpm);
    const tempo = Buffer.alloc(7);
    tempo.writeUInt8(0x00, 0);   // delta time
    tempo.writeUInt8(0xff, 1);
    tempo.writeUInt8(0x51, 2);
    tempo.writeUInt8(0x03, 3);
    tempo.writeUInt8((usPerBeat >> 16) & 0xff, 4);
    tempo.writeUInt8((usPerBeat >> 8) & 0xff, 5);
    tempo.writeUInt8(usPerBeat & 0xff, 6);
    events.push(tempo);

    // Sort events by tick
    const sorted = [...this.events].sort((a, b) => a.tick - b.tick);
    let prevTick = 0;
    for (const ev of sorted) {
      const delta = ev.tick - prevTick;
      prevTick = ev.tick;
      const deltaBytes = this.encodeVarLen(delta);
      const statusByte = ev.type === 'noteOn'
        ? 0x90 | ((ev.channel - 1) & 0x0f)
        : 0x80 | ((ev.channel - 1) & 0x0f);
      events.push(Buffer.concat([deltaBytes, Buffer.from([statusByte, ev.note & 0x7f, ev.velocity & 0x7f])]));
    }

    // End of track
    events.push(Buffer.from([0x00, 0xff, 0x2f, 0x00]));

    const trackData = Buffer.concat(events);
    const header = Buffer.alloc(8);
    header.write('MTrk', 0, 'ascii');
    header.writeUInt32BE(trackData.length, 4);
    return Buffer.concat([header, trackData]);
  }

  private encodeVarLen(value: number): Buffer {
    const bytes: number[] = [];
    bytes.push(value & 0x7f);
    value >>= 7;
    while (value > 0) {
      bytes.push((value & 0x7f) | 0x80);
      value >>= 7;
    }
    return Buffer.from(bytes.reverse());
  }
}
