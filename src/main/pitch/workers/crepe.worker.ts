import { parentPort, workerData } from 'worker_threads';

interface WorkerData {
  modelPath: string;
  sampleRate: number;
}

const { sampleRate } = workerData as WorkerData;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let model: any = null;

async function loadModel(modelPath: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const tf = require('@tensorflow/tfjs-node');
    model = await tf.loadLayersModel(`file://${modelPath}/model.json`);
    parentPort?.postMessage({ type: 'ready' });
  } catch (err) {
    parentPort?.postMessage({ type: 'error', data: String(err) });
  }
}

parentPort?.on('message', (msg: { type: string; data?: Float32Array; modelPath?: string }) => {
  if (msg.type === 'load' && msg.modelPath) {
    loadModel(msg.modelPath);
  } else if (msg.type === 'processFrame' && msg.data) {
    if (!model) {
      parentPort?.postMessage({ type: 'result', data: { frequency: 0, confidence: 0 } });
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const tf = require('@tensorflow/tfjs-node');
      const inputTensor = tf.tensor2d([Array.from(msg.data)]);
      const output = model.predict(inputTensor) as { dataSync: () => Float32Array };
      const data = output.dataSync();
      const maxIdx = Array.from(data).indexOf(Math.max(...Array.from(data)));
      // CREPE uses 360 bins, 20-7902 Hz log-scale
      const frequency = 10 * Math.pow(2, (maxIdx * 20) / 360);
      const confidence = data[maxIdx];
      parentPort?.postMessage({ type: 'result', data: { frequency, confidence, sampleRate } });
      inputTensor.dispose();
    } catch (err) {
      parentPort?.postMessage({ type: 'error', data: String(err) });
    }
  }
});
