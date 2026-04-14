import { parentPort, workerData } from 'worker_threads';
import { PitchDetectionEngine } from '../PitchDetectionEngine';
import type { DetectionMode } from '../../../shared/types';

interface WorkerData {
  mode: DetectionMode;
  sampleRate: number;
}

const { mode, sampleRate } = workerData as WorkerData;
const engine = new PitchDetectionEngine();

(async () => {
  await engine.initialize(mode, sampleRate);
  parentPort?.postMessage({ type: 'ready' });
})();

parentPort?.on('message', (msg: { type: string; data?: Float32Array }) => {
  if (msg.type === 'processFrame' && msg.data) {
    const result = engine.processFrame(msg.data);
    parentPort?.postMessage({ type: 'result', data: result });
  }
});
