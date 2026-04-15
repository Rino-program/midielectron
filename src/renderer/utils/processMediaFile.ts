export interface MediaAnalysisOptions {
  file: File;
  frameSize: number;
  sampleRate: number;
  onFrame(frame: Float32Array): void | Promise<void>;
  onProgress?(progress: number): void;
}

export async function processMediaFile({
  file,
  frameSize,
  sampleRate,
  onFrame,
  onProgress,
}: MediaAnalysisOptions): Promise<void> {
  const mediaElement = file.type.startsWith('video/')
    ? document.createElement('video')
    : document.createElement('audio');

  const objectUrl = URL.createObjectURL(file);
  const audioContext = new AudioContext({ sampleRate });
  const sourceNode = audioContext.createMediaElementSource(mediaElement);
  const processor = audioContext.createScriptProcessor(frameSize, 1, 1);
  const muteNode = audioContext.createGain();

  muteNode.gain.value = 0;
  mediaElement.src = objectUrl;
  mediaElement.preload = 'auto';
  mediaElement.crossOrigin = 'anonymous';

  return new Promise((resolve, reject) => {
    let active = true;

    const reportProgress = (progress: number) => {
      if (!onProgress) return;
      onProgress(Math.max(0, Math.min(100, progress)));
    };

    const cleanup = async () => {
      if (!active) return;
      active = false;
      processor.disconnect();
      sourceNode.disconnect();
      muteNode.disconnect();
      mediaElement.pause();
      mediaElement.src = '';
      URL.revokeObjectURL(objectUrl);
      await audioContext.close().catch(() => undefined);
    };

    mediaElement.addEventListener('loadedmetadata', () => {
      reportProgress(0);
    });

    mediaElement.addEventListener('timeupdate', () => {
      if (!Number.isFinite(mediaElement.duration) || mediaElement.duration <= 0) {
        return;
      }
      reportProgress((mediaElement.currentTime / mediaElement.duration) * 100);
    });

    mediaElement.onerror = () => {
      void cleanup();
      reject(new Error('Failed to load media file'));
    };

    mediaElement.onended = () => {
      reportProgress(100);
      void cleanup();
      resolve();
    };

    processor.onaudioprocess = (event) => {
      const inputBuffer = event.inputBuffer;
      const channels = inputBuffer.numberOfChannels;
      const firstChannel = inputBuffer.getChannelData(0);
      const frame = new Float32Array(firstChannel.length);

      if (channels === 1) {
        frame.set(firstChannel);
      } else {
        for (let i = 0; i < firstChannel.length; i++) {
          let sample = 0;
          for (let channel = 0; channel < channels; channel++) {
            sample += inputBuffer.getChannelData(channel)[i] ?? 0;
          }
          frame[i] = sample / channels;
        }
      }

      if (frame.length === frameSize) {
        void onFrame(frame);
      }
    };

    sourceNode.connect(processor);
    processor.connect(muteNode);
    muteNode.connect(audioContext.destination);

    void audioContext.resume().then(() => mediaElement.play()).catch((err) => {
      void cleanup();
      reject(err);
    });
  });
}