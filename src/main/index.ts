import { app, BrowserWindow, shell, ipcMain } from 'electron';
import path from 'path';
import log from 'electron-log';
import { AudioCaptureEngine } from './audio/AudioCaptureEngine';
import { PitchDetectionEngine } from './pitch/PitchDetectionEngine';
import { OnsetDetector } from './pitch/OnsetDetector';
import { MIDIConverter } from './midi/MIDIConverter';
import { MIDIOutputManager } from './midi/MIDIOutputManager';
import { SMFWriter } from './midi/SMFWriter';
import { AppState } from './store/AppState';
import { appEvents } from './ipc/router';
import type { PitchDetectionResult, MIDINote } from '../shared/types';

log.initialize();

let mainWindow: BrowserWindow | null = null;
const appState = new AppState();
const audioCaptureEngine = new AudioCaptureEngine();
const pitchEngine = new PitchDetectionEngine();
const onsetDetector = new OnsetDetector();
let midiConverter: MIDIConverter;
const midiOutput = new MIDIOutputManager();
const smfWriter = new SMFWriter();
let capturing = false;
let recording = false;

function createWindow(): void {
  const settings = appState.getSettings();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Initialize MIDI converter with current settings
  midiConverter = new MIDIConverter({
    channel: settings.midi.channel,
    velocityMode: settings.midi.velocityMode,
    fixedVelocity: settings.midi.fixedVelocity,
    minConfidence: settings.pitch.minConfidence,
    maxPolyphony: settings.midi.maxPolyphony,
    pitchBendEnabled: settings.midi.pitchBendEnabled,
    transposeOctaves: settings.midi.transposeOctaves,
    transposeNotes: settings.midi.transposeNotes,
    minNoteDurationMs: settings.midi.minNoteDurationMs,
  });
}

async function initializeEngines(): Promise<void> {
  const settings = appState.getSettings();

  // Initialize pitch engine
  await pitchEngine.initialize(settings.pitch.detectionMode, settings.audio.sampleRate);
  pitchEngine.setSilenceThreshold(settings.audio.silenceThreshold);

  // Initialize onset detector
  onsetDetector.setSensitivity(settings.pitch.onsetSensitivity);

  // Initialize MIDI output
  midiOutput.initialize();
  try {
    if (settings.midi.outputPortIndex >= 0) {
      midiOutput.openPort(settings.midi.outputPortIndex);
    } else {
      midiOutput.openVirtualPort('AudioMIDI Bridge');
    }
  } catch {
    log.warn('Could not open MIDI port, attempting virtual port');
    try {
      midiOutput.openVirtualPort('AudioMIDI Bridge');
    } catch (err) {
      log.error(`MIDI initialization failed: ${err}`);
    }
  }
}

function setupAudioPipeline(): void {
  audioCaptureEngine.on('audioFrame', (buffer: Float32Array) => {
    const rms = buffer.reduce((s, v) => s + v * v, 0) / buffer.length;
    const level = Math.sqrt(rms);
    appEvents.emit('audioLevel', { rms: level, timestamp: Date.now() });
    mainWindow?.webContents.send('audioLevel', { rms: level, timestamp: Date.now() });

    const onset = onsetDetector.processFrame(buffer);
    const pitchResult: PitchDetectionResult = pitchEngine.processFrame(buffer);

    appEvents.emit('pitchDetected', pitchResult);
    mainWindow?.webContents.send('pitchDetected', pitchResult);

    const midiNotes: MIDINote[] = midiConverter.convert(pitchResult, onset);
    for (const note of midiNotes) {
      midiOutput.sendNote(note);
      appEvents.emit('midiNote', note);
      mainWindow?.webContents.send('midiNote', note);
      if (recording) {
        smfWriter.addNote(note);
      }
    }
  });

  audioCaptureEngine.on('error', (err: unknown) => {
    log.error('Audio capture error:', err);
    appEvents.emit('appError', err);
    mainWindow?.webContents.send('appError', err);
  });
}

function setupIPC(): void {
  ipcMain.handle('listAudioDevices', () => audioCaptureEngine.listDevices());
  ipcMain.handle('listMIDIPorts', () => midiOutput.listPorts());

  ipcMain.handle('startCapture', async (_event, deviceIdStr: string) => {
    if (capturing) return;
    const settings = appState.getSettings();
    audioCaptureEngine.initialize({
      deviceId: parseInt(deviceIdStr, 10),
      sampleRate: settings.audio.sampleRate,
      frameSize: settings.audio.frameSize,
    });
    audioCaptureEngine.start();
    capturing = true;
  });

  ipcMain.handle('stopCapture', () => {
    audioCaptureEngine.stop();
    const notes = midiConverter.allNotesOff();
    for (const note of notes) midiOutput.sendNote(note);
    capturing = false;
  });

  ipcMain.handle('startRecording', () => {
    smfWriter.startRecording();
    recording = true;
  });

  ipcMain.handle('stopRecording', async (_event, outputPath: string) => {
    smfWriter.stopRecording();
    recording = false;
    if (outputPath) {
      smfWriter.export(outputPath);
    }
  });

  ipcMain.handle('updateSettings', (_event, settings: unknown) => {
    appState.saveSettings(settings as ReturnType<AppState['getSettings']>);
  });
}

app.whenReady().then(async () => {
  log.info('App ready');
  await initializeEngines();
  setupAudioPipeline();
  setupIPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  if (capturing) {
    audioCaptureEngine.stop();
    const notes = midiConverter?.allNotesOff() ?? [];
    for (const note of notes) midiOutput.sendNote(note);
  }
  midiOutput.close();
  appState.saveSettings(appState.getSettings());
  log.info('App quitting');
});
