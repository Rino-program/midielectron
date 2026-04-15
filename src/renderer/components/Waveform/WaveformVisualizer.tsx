import React, { useRef, useEffect, useCallback } from 'react';

interface Props {
  audioLevel?: number;
  waveformData?: Float32Array;
}

export function WaveformVisualizer({ audioLevel = 0, waveformData }: Props): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levelHistoryRef = useRef<number[]>([]);
  const animRef = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.fillStyle = '#0f0f1a';
    ctx.fillRect(0, 0, W, H);

    const history = levelHistoryRef.current;
    if (waveformData) {
      // Draw actual waveform
      ctx.strokeStyle = '#e94560';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const step = W / waveformData.length;
      for (let i = 0; i < waveformData.length; i++) {
        const x = i * step;
        const y = H / 2 + waveformData[i] * H * 0.45;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else {
      // Draw level history as scrolling bar
      const barWidth = Math.max(1, W / 200);
      for (let i = 0; i < history.length; i++) {
        const x = W - (history.length - i) * barWidth;
        const barH = history[i] * H;
        const brightness = Math.floor(100 + history[i] * 155);
        ctx.fillStyle = `rgb(${brightness}, 50, 100)`;
        ctx.fillRect(x, H / 2 - barH / 2, barWidth, barH);
      }
    }

    // Center line
    ctx.strokeStyle = '#2a2a4e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
  }, [waveformData]);

  useEffect(() => {
    const history = levelHistoryRef.current;
    history.push(audioLevel);
    if (history.length > 200) history.shift();
  }, [audioLevel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const loop = () => {
      draw();
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  );
}
