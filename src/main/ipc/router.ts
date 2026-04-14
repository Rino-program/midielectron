import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import { EventEmitter } from 'events';
import type { IpcRouterContext } from './types';
import type { AudioDevice, PitchDetectionResult, MIDINote, AppError } from '../../shared/types';
import type { AudioLevelEvent } from './types';

const t = initTRPC.context<IpcRouterContext>().create();

export const appEvents = new EventEmitter();
appEvents.setMaxListeners(50);

export const appRouter = t.router({
  // Queries
  listAudioDevices: t.procedure.query(async (): Promise<AudioDevice[]> => {
    const { AudioCaptureEngine } = await import('../audio/AudioCaptureEngine');
    const engine = new AudioCaptureEngine();
    return engine.listDevices();
  }),

  listMIDIPorts: t.procedure.query(async (): Promise<string[]> => {
    const { MIDIOutputManager } = await import('../midi/MIDIOutputManager');
    const mgr = new MIDIOutputManager();
    mgr.initialize();
    return mgr.listPorts();
  }),

  // Mutations
  startCapture: t.procedure
    .input(z.object({ deviceId: z.string(), mode: z.string().optional() }))
    .mutation(async ({ input }) => {
      appEvents.emit('startCapture', input);
      return { success: true };
    }),

  stopCapture: t.procedure.mutation(async () => {
    appEvents.emit('stopCapture');
    return { success: true };
  }),

  startRecording: t.procedure
    .input(z.object({ outputPath: z.string().optional() }))
    .mutation(async ({ input }) => {
      appEvents.emit('startRecording', input);
      return { success: true };
    }),

  stopRecording: t.procedure.mutation(async () => {
    appEvents.emit('stopRecording');
    return { success: true };
  }),

  updateSettings: t.procedure
    .input(z.object({ settings: z.unknown() }))
    .mutation(async ({ input }) => {
      appEvents.emit('updateSettings', input.settings);
      return { success: true };
    }),

  // Subscriptions
  onAudioLevel: t.procedure.subscription(() =>
    observable<AudioLevelEvent>((emit) => {
      const handler = (data: AudioLevelEvent) => emit.next(data);
      appEvents.on('audioLevel', handler);
      return () => appEvents.off('audioLevel', handler);
    })
  ),

  onPitchDetected: t.procedure.subscription(() =>
    observable<PitchDetectionResult>((emit) => {
      const handler = (data: PitchDetectionResult) => emit.next(data);
      appEvents.on('pitchDetected', handler);
      return () => appEvents.off('pitchDetected', handler);
    })
  ),

  onMIDINote: t.procedure.subscription(() =>
    observable<MIDINote>((emit) => {
      const handler = (data: MIDINote) => emit.next(data);
      appEvents.on('midiNote', handler);
      return () => appEvents.off('midiNote', handler);
    })
  ),

  onError: t.procedure.subscription(() =>
    observable<AppError>((emit) => {
      const handler = (data: AppError) => emit.next(data);
      appEvents.on('appError', handler);
      return () => appEvents.off('appError', handler);
    })
  ),
});

export type AppRouter = typeof appRouter;
