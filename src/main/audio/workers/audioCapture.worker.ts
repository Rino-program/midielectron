import { parentPort, workerData } from 'worker_threads';
import { AudioCaptureEngine } from '../AudioCaptureEngine';
import type { CaptureConfig } from '../AudioCaptureEngine';

interface WorkerConfig extends CaptureConfig {
  deviceId: number;
}

const config: WorkerConfig = workerData as WorkerConfig;
const engine = new AudioCaptureEngine();

engine.initialize(config);

engine.on('audioFrame', (frame: Float32Array) => {
  parentPort?.postMessage({ type: 'audioFrame', data: frame }, [frame.buffer as ArrayBuffer]);
});

engine.on('error', (err: unknown) => {
  parentPort?.postMessage({ type: 'error', data: err });
});

parentPort?.on('message', (msg: { type: string }) => {
  if (msg.type === 'start') {
    engine.start();
  } else if (msg.type === 'stop') {
    engine.stop();
    process.exit(0);
  }
});
