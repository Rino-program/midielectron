"use strict";
const electron = require("electron");
const path = require("path");
const log = require("electron-log");
const zod = require("zod");
const events = require("events");
const fs = require("fs");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const path__namespace = /* @__PURE__ */ _interopNamespaceDefault(path);
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs);
const DEFAULT_SETTINGS = {
  audio: {
    inputDeviceId: "",
    captureMode: "microphone",
    sampleRate: 44100,
    frameSize: 1024,
    silenceThreshold: 0.01
  },
  pitch: {
    detectionMode: "low-latency",
    minConfidence: 0.5,
    minFrequency: 40,
    maxFrequency: 4200,
    onsetSensitivity: 0.5,
    smoothingWindowMs: 20
  },
  midi: {
    outputPortIndex: 0,
    channel: 1,
    velocityMode: "dynamic",
    fixedVelocity: 100,
    minNoteDurationMs: 50,
    maxPolyphony: 6,
    pitchBendEnabled: false,
    transposeOctaves: 0,
    transposeNotes: 0
  },
  visualizer: {
    scrollSpeedPxPerSec: 100,
    displayRangeMin: 21,
    displayRangeMax: 108,
    showVelocity: true,
    theme: "dark"
  },
  recording: {
    defaultSavePath: "",
    tempo: 120,
    autoSave: false
  }
};
var AudioMIDIErrorCode = /* @__PURE__ */ ((AudioMIDIErrorCode2) => {
  AudioMIDIErrorCode2["AUDIO_DEVICE_NOT_FOUND"] = "AUDIO_001";
  AudioMIDIErrorCode2["AUDIO_PERMISSION_DENIED"] = "AUDIO_002";
  AudioMIDIErrorCode2["AUDIO_STREAM_INTERRUPTED"] = "AUDIO_003";
  AudioMIDIErrorCode2["LOOPBACK_NOT_SUPPORTED"] = "AUDIO_004";
  AudioMIDIErrorCode2["WASM_LOAD_FAILED"] = "PITCH_001";
  AudioMIDIErrorCode2["MODEL_LOAD_FAILED"] = "PITCH_002";
  AudioMIDIErrorCode2["DETECTION_TIMEOUT"] = "PITCH_003";
  AudioMIDIErrorCode2["MIDI_PORT_NOT_FOUND"] = "MIDI_001";
  AudioMIDIErrorCode2["MIDI_SEND_FAILED"] = "MIDI_002";
  AudioMIDIErrorCode2["VIRTUAL_PORT_CREATION_FAILED"] = "MIDI_003";
  AudioMIDIErrorCode2["SMF_WRITE_FAILED"] = "FILE_001";
  AudioMIDIErrorCode2["INSUFFICIENT_DISK_SPACE"] = "FILE_002";
  return AudioMIDIErrorCode2;
})(AudioMIDIErrorCode || {});
function getNaudiodon() {
  try {
    return require("naudiodon");
  } catch {
    return null;
  }
}
const RING_BUFFER_SIZE = 4;
class AudioCaptureEngine extends events.EventEmitter {
  stream = null;
  ringBuffer = [];
  ringWriteIdx = 0;
  running = false;
  config = null;
  listDevices() {
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
        isLoopback: d.hostAPIName?.toLowerCase().includes("wasapi") ?? false
      }));
    } catch (err) {
      this.emit("error", {
        code: AudioMIDIErrorCode.AUDIO_DEVICE_NOT_FOUND,
        message: String(err),
        timestamp: Date.now()
      });
      return [];
    }
  }
  initialize(config) {
    if (this.running) {
      this.stop();
    }
    this.config = config;
    this.ringBuffer = [];
    this.ringWriteIdx = 0;
    for (let i = 0; i < RING_BUFFER_SIZE; i++) {
      this.ringBuffer.push(new Float32Array(config.frameSize));
    }
  }
  start() {
    if (this.running) return;
    if (!this.config) {
      this.emit("error", {
        code: AudioMIDIErrorCode.AUDIO_DEVICE_NOT_FOUND,
        message: "AudioCaptureEngine not initialized",
        timestamp: Date.now()
      });
      return;
    }
    const naudiodon = getNaudiodon();
    if (!naudiodon) {
      this.emit("error", {
        code: AudioMIDIErrorCode.AUDIO_DEVICE_NOT_FOUND,
        message: "naudiodon native module not available",
        timestamp: Date.now()
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
          closeOnError: false
        }
      });
      this.stream.on("data", (...args) => {
        this.handleData(args[0], channels);
      });
      this.stream.on("error", (...args) => {
        const err = args[0];
        this.emit("error", {
          code: AudioMIDIErrorCode.AUDIO_STREAM_INTERRUPTED,
          message: err.message,
          timestamp: Date.now()
        });
      });
      this.stream.start();
      this.running = true;
    } catch (err) {
      this.emit("error", {
        code: AudioMIDIErrorCode.AUDIO_STREAM_INTERRUPTED,
        message: String(err),
        timestamp: Date.now()
      });
    }
  }
  stop() {
    if (!this.running || !this.stream) return;
    try {
      this.stream.quit();
    } catch {
    }
    this.stream = null;
    this.running = false;
  }
  handleData(chunk, channels) {
    const frameSize = this.config.frameSize;
    const bytesPerSample = 2;
    const totalSamples = chunk.length / (bytesPerSample * channels);
    for (let offset = 0; offset < totalSamples; offset += frameSize) {
      const slot = this.ringBuffer[this.ringWriteIdx % RING_BUFFER_SIZE];
      const count = Math.min(frameSize, totalSamples - offset);
      for (let i = 0; i < count; i++) {
        if (channels === 1) {
          const bytePos = (offset + i) * bytesPerSample;
          const sample = chunk.readInt16LE(bytePos);
          slot[i] = sample / 32768;
        } else {
          const bytePos = (offset + i) * bytesPerSample * channels;
          const left = chunk.readInt16LE(bytePos);
          const right = chunk.readInt16LE(bytePos + bytesPerSample);
          slot[i] = (left + right) / (2 * 32768);
        }
      }
      if (count === frameSize) {
        this.emit("audioFrame", slot.slice(0));
        this.ringWriteIdx++;
      }
    }
  }
}
const RETRIGGER_CENTS_THRESHOLD = 50;
const VELOCITY_DYNAMIC_SCALE = 4;
function frequencyToMidi(frequency) {
  if (frequency <= 0) return -1;
  return Math.round(69 + 12 * Math.log2(frequency / 440));
}
function frequencyToCentsOffset(frequency, midiNote) {
  if (frequency <= 0) return 0;
  const exactMidi = 69 + 12 * Math.log2(frequency / 440);
  return (exactMidi - midiNote) * 100;
}
const DEFAULT_CONVERTER_CONFIG = {
  channel: 1,
  velocityMode: "dynamic",
  fixedVelocity: 100,
  minConfidence: 0.5,
  maxPolyphony: 6,
  pitchBendEnabled: false,
  transposeOctaves: 0,
  transposeNotes: 0,
  minNoteDurationMs: 50
};
class MIDIConverter {
  config;
  activeNotes = /* @__PURE__ */ new Map();
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONVERTER_CONFIG, ...config };
  }
  updateConfig(config) {
    this.config = { ...this.config, ...config };
  }
  getActiveNotes() {
    return new Map(this.activeNotes);
  }
  convert(result, onset) {
    const now = result.timestamp;
    const events2 = [];
    const ch = this.config.channel;
    if (result.isSilent || result.pitches.length === 0) {
      for (const [note] of this.activeNotes) {
        events2.push({ type: "noteOff", channel: ch, note, velocity: 0, timestamp: now });
      }
      this.activeNotes.clear();
      return events2;
    }
    const transpose = this.config.transposeOctaves * 12 + this.config.transposeNotes;
    const sortedByConfidence = result.pitches.filter((p) => p.confidence >= this.config.minConfidence).sort((a, b) => b.confidence - a.confidence).slice(0, this.config.maxPolyphony);
    const allowedNotes = new Set(
      sortedByConfidence.map((p) => frequencyToMidi(p.frequency) + transpose).filter((n) => n >= 0 && n <= 127)
    );
    for (const [note] of this.activeNotes) {
      if (!allowedNotes.has(note)) {
        const info = this.activeNotes.get(note);
        if (now - info.startTime >= this.config.minNoteDurationMs) {
          events2.push({ type: "noteOff", channel: ch, note, velocity: 0, timestamp: now });
          this.activeNotes.delete(note);
        }
      }
    }
    for (const pitch of sortedByConfidence) {
      const raw = frequencyToMidi(pitch.frequency);
      const note = raw + transpose;
      if (note < 0 || note > 127) continue;
      const existing = this.activeNotes.get(note);
      if (existing) {
        const cents = Math.abs(frequencyToCentsOffset(pitch.frequency, raw));
        if (cents > RETRIGGER_CENTS_THRESHOLD) {
          events2.push({ type: "noteOff", channel: ch, note, velocity: 0, timestamp: now });
          const velocity = this.calcVelocity(pitch.confidence, result.rms);
          events2.push({ type: "noteOn", channel: ch, note, velocity, timestamp: now });
          this.activeNotes.set(note, { note, velocity, startTime: now, channel: ch });
        }
      } else {
        const velocity = this.calcVelocity(
          pitch.confidence,
          onset ? onset.strength : result.rms
        );
        events2.push({ type: "noteOn", channel: ch, note, velocity, timestamp: now });
        this.activeNotes.set(note, { note, velocity, startTime: now, channel: ch });
      }
    }
    return events2;
  }
  allNotesOff() {
    const now = Date.now();
    const events2 = [];
    for (const [note] of this.activeNotes) {
      events2.push({ type: "noteOff", channel: this.config.channel, note, velocity: 0, timestamp: now });
    }
    this.activeNotes.clear();
    return events2;
  }
  calcVelocity(confidence, rms) {
    if (this.config.velocityMode === "fixed") {
      return this.config.fixedVelocity;
    }
    const vel = Math.round(confidence * rms * VELOCITY_DYNAMIC_SCALE * 127);
    return Math.max(1, Math.min(127, vel));
  }
}
function computeRMS$1(buffer) {
  let sum = 0;
  for (const s of buffer) sum += s * s;
  return Math.sqrt(sum / buffer.length);
}
function yinPitch(buffer, sampleRate) {
  const threshold = 0.1;
  const halfLen = Math.floor(buffer.length / 2);
  const yinBuffer = new Float32Array(halfLen);
  for (let tau = 1; tau < halfLen; tau++) {
    let sum = 0;
    for (let i = 0; i < halfLen; i++) {
      const delta = buffer[i] - buffer[i + tau];
      sum += delta * delta;
    }
    yinBuffer[tau] = sum;
  }
  yinBuffer[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < halfLen; tau++) {
    runningSum += yinBuffer[tau];
    yinBuffer[tau] *= tau / runningSum;
  }
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
  const x0 = tauEstimate < 1 ? tauEstimate : tauEstimate - 1;
  const x2 = tauEstimate + 1 < halfLen ? tauEstimate + 1 : tauEstimate;
  let betterTau;
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
class PitchDetectionEngine {
  mode = "low-latency";
  sampleRate = 44100;
  silenceThreshold = 0.01;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  essentiaInstance = null;
  async initialize(mode, sampleRate = 44100) {
    this.mode = mode;
    this.sampleRate = sampleRate;
    if (mode === "polyphonic") {
      try {
        const EssentiaWASM = require("essentia.js");
        this.essentiaInstance = await EssentiaWASM.EssentiaWASM();
      } catch {
      }
    }
  }
  processFrame(buffer) {
    const rms = computeRMS$1(buffer);
    const isSilent = rms < this.silenceThreshold;
    const timestamp = Date.now();
    if (isSilent) {
      return { timestamp, pitches: [], rms, isSilent: true };
    }
    const pitches = [];
    if (this.mode === "polyphonic" && this.essentiaInstance) {
      pitches.push(...this.processPolyphonic(buffer));
    } else {
      const { frequency, confidence } = yinPitch(buffer, this.sampleRate);
      if (frequency > 0 && confidence > 0) {
        const midiNote = frequencyToMidi(frequency);
        if (midiNote >= 0 && midiNote <= 127) {
          pitches.push({
            frequency,
            confidence,
            midiNote,
            centsOffset: frequencyToCentsOffset(frequency, midiNote)
          });
        }
      }
    }
    return { timestamp, pitches, rms, isSilent: false };
  }
  processPolyphonic(buffer) {
    const pitches = [];
    try {
      const essentia = this.essentiaInstance;
      const vectorSignal = essentia.arrayToVector(Array.from(buffer));
      const result = essentia.MultiPitchMelodia(vectorSignal);
      const freqs = essentia.vectorToArray(result.pitch);
      for (const freq of freqs) {
        if (freq > 0) {
          const midiNote = frequencyToMidi(freq);
          if (midiNote >= 0 && midiNote <= 127) {
            pitches.push({
              frequency: freq,
              confidence: 0.8,
              midiNote,
              centsOffset: frequencyToCentsOffset(freq, midiNote)
            });
          }
        }
      }
    } catch {
    }
    return pitches;
  }
  setSilenceThreshold(threshold) {
    this.silenceThreshold = threshold;
  }
}
const ONSET_THRESHOLD_MAX = 0.15;
const ONSET_THRESHOLD_MIN = 5e-3;
function computeRMS(buffer) {
  let sum = 0;
  for (const s of buffer) sum += s * s;
  return Math.sqrt(sum / buffer.length);
}
class OnsetDetector {
  sensitivity = 0.5;
  prevRMS = 0;
  prevFlux = 0;
  // Initialize threshold consistently with default sensitivity=0.5
  threshold = ONSET_THRESHOLD_MAX * (1 - 0.5) + ONSET_THRESHOLD_MIN;
  setSensitivity(value) {
    this.sensitivity = Math.max(0, Math.min(1, value));
    this.threshold = ONSET_THRESHOLD_MAX * (1 - this.sensitivity) + ONSET_THRESHOLD_MIN;
  }
  processFrame(buffer) {
    const rms = computeRMS(buffer);
    const flux = Math.max(0, rms - this.prevRMS);
    const onset = flux > this.threshold && flux > this.prevFlux * 1.5;
    this.prevFlux = flux;
    this.prevRMS = rms;
    if (onset) {
      return {
        timestamp: Date.now(),
        strength: Math.min(1, flux / (this.threshold * 4))
      };
    }
    return null;
  }
  reset() {
    this.prevRMS = 0;
    this.prevFlux = 0;
  }
}
function getMidi() {
  try {
    return require("midi");
  } catch {
    return null;
  }
}
class MIDIOutputManager {
  output = null;
  portOpen = false;
  initialize() {
    const midi = getMidi();
    if (!midi) {
      log.warn("node-midi not available; MIDI output disabled");
      return;
    }
    this.output = new midi.Output();
  }
  listPorts() {
    if (!this.output) return [];
    const count = this.output.getPortCount();
    const ports = [];
    for (let i = 0; i < count; i++) {
      ports.push(this.output.getPortName(i));
    }
    return ports;
  }
  openPort(portIndex) {
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
  openVirtualPort(name = "AudioMIDI Bridge") {
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
  sendNote(note) {
    if (!this.output || !this.portOpen) return;
    try {
      const statusByte = note.type === "noteOn" ? 144 | note.channel - 1 & 15 : 128 | note.channel - 1 & 15;
      this.output.sendMessage([statusByte, note.note & 127, note.velocity & 127]);
    } catch (err) {
      log.error(`MIDI send failed: ${err}`);
    }
  }
  sendAllNotesOff() {
    if (!this.output || !this.portOpen) return;
    for (let ch = 0; ch < 16; ch++) {
      this.output.sendMessage([176 | ch, 123, 0]);
    }
  }
  close() {
    if (this.output && this.portOpen) {
      this.sendAllNotesOff();
      this.output.closePort();
      this.portOpen = false;
    }
  }
}
class SMFWriter {
  events = [];
  startTime = 0;
  recording = false;
  tempo;
  ppq;
  constructor(tempo = 120, ppq = 480) {
    this.tempo = tempo;
    this.ppq = ppq;
  }
  setTempo(tempo) {
    this.tempo = tempo;
  }
  startRecording(startTime) {
    this.events = [];
    this.startTime = startTime ?? Date.now();
    this.recording = true;
  }
  stopRecording() {
    this.recording = false;
  }
  addNote(note) {
    if (!this.recording) return;
    const elapsedMs = note.timestamp - this.startTime;
    const tick = Math.round(elapsedMs / 1e3 * (this.tempo / 60) * this.ppq);
    this.events.push({ ...note, tick });
  }
  getEventCount() {
    return this.events.length;
  }
  export(filePath) {
    try {
      const header = this.buildHeader();
      const track = this.buildTrack();
      const buf = Buffer.concat([header, track]);
      fs__namespace.writeFileSync(filePath, buf);
      log.info(`SMF exported to ${filePath}`);
    } catch (err) {
      log.error(`SMF write failed: ${err}`);
      throw new Error(`${AudioMIDIErrorCode.SMF_WRITE_FAILED}: ${err}`);
    }
  }
  exportToDefault(dir) {
    const now = /* @__PURE__ */ new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const name = `recording_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.mid`;
    const filePath = path__namespace.join(dir, name);
    this.export(filePath);
    return filePath;
  }
  buildHeader() {
    const buf = Buffer.alloc(14);
    buf.write("MThd", 0, "ascii");
    buf.writeUInt32BE(6, 4);
    buf.writeUInt16BE(0, 8);
    buf.writeUInt16BE(1, 10);
    buf.writeUInt16BE(this.ppq, 12);
    return buf;
  }
  buildTrack() {
    const events2 = [];
    const bpm = this.tempo;
    const usPerBeat = Math.round(6e7 / bpm);
    const tempo = Buffer.alloc(7);
    tempo.writeUInt8(0, 0);
    tempo.writeUInt8(255, 1);
    tempo.writeUInt8(81, 2);
    tempo.writeUInt8(3, 3);
    tempo.writeUInt8(usPerBeat >> 16 & 255, 4);
    tempo.writeUInt8(usPerBeat >> 8 & 255, 5);
    tempo.writeUInt8(usPerBeat & 255, 6);
    events2.push(tempo);
    const sorted = [...this.events].sort((a, b) => a.tick - b.tick);
    let prevTick = 0;
    for (const ev of sorted) {
      const delta = ev.tick - prevTick;
      prevTick = ev.tick;
      const deltaBytes = this.encodeVarLen(delta);
      const statusByte = ev.type === "noteOn" ? 144 | ev.channel - 1 & 15 : 128 | ev.channel - 1 & 15;
      events2.push(Buffer.concat([deltaBytes, Buffer.from([statusByte, ev.note & 127, ev.velocity & 127])]));
    }
    events2.push(Buffer.from([0, 255, 47, 0]));
    const trackData = Buffer.concat(events2);
    const header = Buffer.alloc(8);
    header.write("MTrk", 0, "ascii");
    header.writeUInt32BE(trackData.length, 4);
    return Buffer.concat([header, trackData]);
  }
  encodeVarLen(value) {
    const bytes = [];
    bytes.push(value & 127);
    value >>= 7;
    while (value > 0) {
      bytes.push(value & 127 | 128);
      value >>= 7;
    }
    return Buffer.from(bytes.reverse());
  }
}
function getElectronStore() {
  try {
    const Store = require("electron-store");
    return new Store();
  } catch {
    return null;
  }
}
class AppState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  store;
  memorySettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  constructor() {
    this.store = getElectronStore();
    if (!this.store) {
      log.warn("electron-store not available; settings will not persist");
    }
  }
  getSettings() {
    if (!this.store) return this.memorySettings;
    try {
      const saved = this.store.get("settings", {});
      return {
        audio: { ...DEFAULT_SETTINGS.audio, ...saved.audio ?? {} },
        pitch: { ...DEFAULT_SETTINGS.pitch, ...saved.pitch ?? {} },
        midi: { ...DEFAULT_SETTINGS.midi, ...saved.midi ?? {} },
        visualizer: { ...DEFAULT_SETTINGS.visualizer, ...saved.visualizer ?? {} },
        recording: { ...DEFAULT_SETTINGS.recording, ...saved.recording ?? {} }
      };
    } catch {
      return this.memorySettings;
    }
  }
  saveSettings(settings) {
    this.memorySettings = settings;
    if (!this.store) return;
    try {
      this.store.set("settings", settings);
    } catch (err) {
      log.error(`Failed to save settings: ${err}`);
    }
  }
}
const TELEMETRY_THROTTLE_MS = 33;
const settingsUpdateSchema = zod.z.object({
  audio: zod.z.object({
    inputDeviceId: zod.z.string(),
    captureMode: zod.z.enum(["loopback", "microphone", "virtual-device"]),
    sampleRate: zod.z.union([zod.z.literal(44100), zod.z.literal(48e3)]),
    frameSize: zod.z.union([zod.z.literal(512), zod.z.literal(1024), zod.z.literal(2048)]),
    silenceThreshold: zod.z.number().min(0).max(1)
  }),
  pitch: zod.z.object({
    detectionMode: zod.z.enum(["high-accuracy", "polyphonic", "low-latency"]),
    minConfidence: zod.z.number().min(0).max(1),
    minFrequency: zod.z.number().positive(),
    maxFrequency: zod.z.number().positive(),
    onsetSensitivity: zod.z.number().min(0).max(1),
    smoothingWindowMs: zod.z.number().nonnegative()
  }),
  midi: zod.z.object({
    outputPortIndex: zod.z.number().int(),
    channel: zod.z.number().int().min(1).max(16),
    velocityMode: zod.z.enum(["fixed", "dynamic"]),
    fixedVelocity: zod.z.number().int().min(0).max(127),
    minNoteDurationMs: zod.z.number().nonnegative(),
    maxPolyphony: zod.z.number().int().positive(),
    pitchBendEnabled: zod.z.boolean(),
    transposeOctaves: zod.z.number().int().min(-4).max(4),
    transposeNotes: zod.z.number().int().min(-12).max(12)
  }),
  visualizer: zod.z.object({
    scrollSpeedPxPerSec: zod.z.number().positive(),
    displayRangeMin: zod.z.number().int().min(0).max(127),
    displayRangeMax: zod.z.number().int().min(0).max(127),
    showVelocity: zod.z.boolean(),
    theme: zod.z.enum(["dark", "light"])
  }),
  recording: zod.z.object({
    defaultSavePath: zod.z.string(),
    tempo: zod.z.number().positive(),
    autoSave: zod.z.boolean()
  })
});
log.initialize();
let mainWindow = null;
const appState = new AppState();
const audioCaptureEngine = new AudioCaptureEngine();
const pitchEngine = new PitchDetectionEngine();
const onsetDetector = new OnsetDetector();
const midiConverter = new MIDIConverter();
const midiOutput = new MIDIOutputManager();
const smfWriter = new SMFWriter(appState.getSettings().recording.tempo);
let capturing = false;
let recording = false;
let lastAudioLevelTimestamp = 0;
let lastPitchTimestamp = 0;
function processAudioFrame(buffer) {
  const now = Date.now();
  const rms = buffer.reduce((sum, value) => sum + value * value, 0) / buffer.length;
  const rmsLevel = Math.sqrt(rms);
  if (now - lastAudioLevelTimestamp >= TELEMETRY_THROTTLE_MS) {
    mainWindow?.webContents.send("audioLevel", { rms: rmsLevel, timestamp: now });
    lastAudioLevelTimestamp = now;
  }
  const onset = onsetDetector.processFrame(buffer);
  const pitchResult = pitchEngine.processFrame(buffer);
  if (now - lastPitchTimestamp >= TELEMETRY_THROTTLE_MS) {
    mainWindow?.webContents.send("pitchDetected", pitchResult);
    lastPitchTimestamp = now;
  }
  const midiNotes = midiConverter.convert(pitchResult, onset);
  for (const note of midiNotes) {
    midiOutput.sendNote(note);
    mainWindow?.webContents.send("midiNote", note);
    if (recording) {
      smfWriter.addNote(note);
    }
  }
}
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
async function initializeEngines() {
  const settings = appState.getSettings();
  midiConverter.updateConfig({
    channel: settings.midi.channel,
    velocityMode: settings.midi.velocityMode,
    fixedVelocity: settings.midi.fixedVelocity,
    minConfidence: settings.pitch.minConfidence,
    maxPolyphony: settings.midi.maxPolyphony,
    pitchBendEnabled: settings.midi.pitchBendEnabled,
    transposeOctaves: settings.midi.transposeOctaves,
    transposeNotes: settings.midi.transposeNotes,
    minNoteDurationMs: settings.midi.minNoteDurationMs
  });
  await pitchEngine.initialize(settings.pitch.detectionMode, settings.audio.sampleRate);
  pitchEngine.setSilenceThreshold(settings.audio.silenceThreshold);
  onsetDetector.setSensitivity(settings.pitch.onsetSensitivity);
  midiOutput.initialize();
  try {
    if (settings.midi.outputPortIndex >= 0) {
      midiOutput.openPort(settings.midi.outputPortIndex);
    } else {
      midiOutput.openVirtualPort("AudioMIDI Bridge");
    }
  } catch {
    log.warn("Could not open MIDI port, attempting virtual port");
    try {
      midiOutput.openVirtualPort("AudioMIDI Bridge");
    } catch (err) {
      log.error(`MIDI initialization failed: ${err}`);
    }
  }
}
function setupAudioPipeline() {
  audioCaptureEngine.on("audioFrame", (buffer) => {
    processAudioFrame(buffer);
  });
  audioCaptureEngine.on("error", (err) => {
    log.error("Audio capture error:", err);
    mainWindow?.webContents.send("appError", err);
  });
}
function setupIPC() {
  electron.ipcMain.handle("listAudioDevices", () => audioCaptureEngine.listDevices());
  electron.ipcMain.handle("listMIDIPorts", () => midiOutput.listPorts());
  electron.ipcMain.handle("processAudioFrame", (_event, frame) => {
    processAudioFrame(Float32Array.from(frame));
  });
  electron.ipcMain.handle("startCapture", async (_event, deviceIdStr) => {
    if (capturing) return;
    const settings = appState.getSettings();
    const parsedDeviceId = parseInt(deviceIdStr, 10);
    audioCaptureEngine.initialize({
      deviceId: Number.isNaN(parsedDeviceId) ? 0 : parsedDeviceId,
      sampleRate: settings.audio.sampleRate,
      frameSize: settings.audio.frameSize
    });
    audioCaptureEngine.start();
    capturing = true;
  });
  electron.ipcMain.handle("stopCapture", () => {
    audioCaptureEngine.stop();
    const notes = midiConverter.allNotesOff();
    for (const note of notes) midiOutput.sendNote(note);
    capturing = false;
  });
  electron.ipcMain.handle("startRecording", () => {
    smfWriter.startRecording();
    recording = true;
  });
  electron.ipcMain.handle("stopRecording", async (_event, outputPath) => {
    smfWriter.stopRecording();
    recording = false;
    if (outputPath) {
      smfWriter.export(outputPath);
    }
  });
  electron.ipcMain.handle("saveRecording", async () => {
    if (recording) {
      smfWriter.stopRecording();
      recording = false;
    }
    const settings = appState.getSettings();
    const defaultPath = settings.recording.defaultSavePath || path.join(electron.app.getPath("documents"), "recording.mid");
    const result = await electron.dialog.showSaveDialog(mainWindow ?? void 0, {
      defaultPath,
      filters: [{ name: "MIDI files", extensions: ["mid", "midi"] }]
    });
    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }
    smfWriter.export(result.filePath);
    appState.saveSettings({
      ...settings,
      recording: {
        ...settings.recording,
        defaultSavePath: path.dirname(result.filePath)
      }
    });
    return { success: true, filePath: result.filePath };
  });
  electron.ipcMain.handle("updateSettings", (_event, newSettings) => {
    const parsed = settingsUpdateSchema.safeParse(newSettings);
    if (!parsed.success) {
      const msg = parsed.error.flatten();
      log.warn("updateSettings: invalid payload", msg);
      return { success: false, error: "Invalid settings payload", details: msg };
    }
    const previous = appState.getSettings();
    appState.saveSettings(parsed.data);
    midiConverter.updateConfig({
      channel: parsed.data.midi.channel,
      velocityMode: parsed.data.midi.velocityMode,
      fixedVelocity: parsed.data.midi.fixedVelocity,
      minConfidence: parsed.data.pitch.minConfidence,
      maxPolyphony: parsed.data.midi.maxPolyphony,
      pitchBendEnabled: parsed.data.midi.pitchBendEnabled,
      transposeOctaves: parsed.data.midi.transposeOctaves,
      transposeNotes: parsed.data.midi.transposeNotes,
      minNoteDurationMs: parsed.data.midi.minNoteDurationMs
    });
    if (parsed.data.midi.outputPortIndex !== previous.midi.outputPortIndex) {
      try {
        midiOutput.close();
        midiOutput.initialize();
        if (parsed.data.midi.outputPortIndex >= 0) {
          midiOutput.openPort(parsed.data.midi.outputPortIndex);
        } else {
          midiOutput.openVirtualPort("AudioMIDI Bridge");
        }
      } catch (err) {
        log.error(`MIDI port re-open failed: ${err}`);
        try {
          midiOutput.openVirtualPort("AudioMIDI Bridge");
        } catch {
        }
      }
    }
    if (parsed.data.recording.tempo !== previous.recording.tempo) {
      smfWriter.setTempo(parsed.data.recording.tempo);
    }
  });
}
electron.app.whenReady().then(async () => {
  log.info("App ready");
  await initializeEngines();
  setupAudioPipeline();
  setupIPC();
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
electron.app.on("will-quit", () => {
  if (capturing) {
    audioCaptureEngine.stop();
    const notes = midiConverter.allNotesOff();
    for (const note of notes) midiOutput.sendNote(note);
  }
  midiOutput.close();
  appState.saveSettings(appState.getSettings());
  log.info("App quitting");
});
