import type { MIDINote } from '../../shared/types';
import { AudioMIDIErrorCode } from '../../shared/constants';
import log from 'electron-log';

interface MidiOutput {
  getPortCount(): number;
  getPortName(port: number): string;
  openPort(port: number): void;
  openVirtualPort(name: string): void;
  sendMessage(msg: number[]): void;
  closePort(): void;
}

function getMidi(): { Output: new () => MidiOutput } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('midi');
  } catch {
    return null;
  }
}

export class MIDIOutputManager {
  private output: MidiOutput | null = null;
  private portOpen = false;

  initialize(): void {
    const midi = getMidi();
    if (!midi) {
      log.warn('node-midi not available; MIDI output disabled');
      return;
    }
    this.output = new midi.Output();
  }

  listPorts(): string[] {
    if (!this.output) return [];
    const count = this.output.getPortCount();
    const ports: string[] = [];
    for (let i = 0; i < count; i++) {
      ports.push(this.output.getPortName(i));
    }
    return ports;
  }

  openPort(portIndex: number): void {
    if (!this.output) {
      throw new Error(AudioMIDIErrorCode.MIDI_PORT_NOT_FOUND);
    }
    if (this.portOpen) {
      this.output.closePort();
      this.portOpen = false;
    }
    const count = this.output.getPortCount();
    if (portIndex < 0 || portIndex >= count) {
      throw new Error(`${AudioMIDIErrorCode.MIDI_PORT_NOT_FOUND}: port ${portIndex} not found`);
    }
    this.output.openPort(portIndex);
    this.portOpen = true;
    log.info(`Opened MIDI port ${portIndex}: ${this.output.getPortName(portIndex)}`);
  }

  openVirtualPort(name = 'AudioMIDI Bridge'): void {
    if (!this.output) {
      throw new Error(AudioMIDIErrorCode.VIRTUAL_PORT_CREATION_FAILED);
    }
    if (this.portOpen) {
      this.output.closePort();
      this.portOpen = false;
    }
    this.output.openVirtualPort(name);
    this.portOpen = true;
    log.info(`Opened virtual MIDI port: ${name}`);
  }

  sendNote(note: MIDINote): void {
    if (!this.output || !this.portOpen) return;
    try {
      const statusByte = note.type === 'noteOn'
        ? 0x90 | ((note.channel - 1) & 0x0f)
        : 0x80 | ((note.channel - 1) & 0x0f);
      this.output.sendMessage([statusByte, note.note & 0x7f, note.velocity & 0x7f]);
    } catch (err) {
      log.error(`MIDI send failed: ${err}`);
    }
  }

  sendAllNotesOff(): void {
    if (!this.output || !this.portOpen) return;
    for (let ch = 0; ch < 16; ch++) {
      // CC 123 = All Notes Off
      this.output.sendMessage([0xb0 | ch, 123, 0]);
    }
  }

  close(): void {
    if (this.output && this.portOpen) {
      this.sendAllNotesOff();
      this.output.closePort();
      this.portOpen = false;
    }
  }
}
