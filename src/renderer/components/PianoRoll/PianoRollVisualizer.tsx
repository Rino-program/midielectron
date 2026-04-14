import React, { useRef, useEffect } from 'react';
import { PianoRollRenderer } from './PianoRollRenderer';
import type { ActiveNoteInfo } from '../../../shared/types';

interface Props {
  activeNotes: Map<number, ActiveNoteInfo>;
  displayRangeMin?: number;
  displayRangeMax?: number;
  scrollSpeedPxPerSec?: number;
}

export function PianoRollVisualizer({
  activeNotes,
  displayRangeMin = 21,
  displayRangeMax = 108,
  scrollSpeedPxPerSec = 100,
}: Props): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PianoRollRenderer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new PianoRollRenderer(canvas);
    rendererRef.current = renderer;

    const resize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        renderer.resize(clientWidth, clientHeight);
      }
    };

    resize();
    renderer.setDisplayRange(displayRangeMin, displayRangeMax);
    renderer.setScrollSpeed(scrollSpeedPxPerSec);
    renderer.start();

    const ro = new ResizeObserver(resize);
    if (containerRef.current) ro.observe(containerRef.current);

    // Prune history every 30 seconds
    const pruneInterval = setInterval(() => renderer.pruneHistory(), 30000);

    return () => {
      renderer.stop();
      ro.disconnect();
      clearInterval(pruneInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    rendererRef.current?.setActiveNotes(activeNotes);
  }, [activeNotes]);

  useEffect(() => {
    rendererRef.current?.setDisplayRange(displayRangeMin, displayRangeMax);
  }, [displayRangeMin, displayRangeMax]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}
