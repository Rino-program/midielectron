import type { ActiveNoteInfo } from '../../../shared/types';

/** Maximum scroll distance (in pixels) to retain note history. Notes older than this are pruned. */
const MAX_NOTE_HISTORY_SCROLL_UNITS = 5000;

export interface NoteBar {
  note: number;
  velocity: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export class PianoRollRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animFrameId = 0;
  private scrollX = 0;
  private noteHistory: { note: number; velocity: number; startX: number; endX: number | null }[] = [];
  private scrollSpeedPxPerSec = 100;
  private lastTime = 0;
  private displayRangeMin = 21;
  private displayRangeMax = 108;
  private activeNotes: Map<number, ActiveNoteInfo> = new Map();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  start(): void {
    this.lastTime = performance.now();
    this.loop();
  }

  stop(): void {
    cancelAnimationFrame(this.animFrameId);
  }

  setActiveNotes(notes: Map<number, ActiveNoteInfo>): void {
    const now = this.scrollX;
    // Add new notes to history
    for (const [noteNum, info] of notes) {
      const existing = this.noteHistory.find((n) => n.note === noteNum && n.endX === null);
      if (!existing) {
        this.noteHistory.push({ note: noteNum, velocity: info.velocity, startX: now, endX: null });
      }
    }
    // End notes no longer active
    for (const entry of this.noteHistory) {
      if (entry.endX === null && !notes.has(entry.note)) {
        entry.endX = this.scrollX;
      }
    }
    this.activeNotes = notes;
  }

  setScrollSpeed(pxPerSec: number): void {
    this.scrollSpeedPxPerSec = pxPerSec;
  }

  setDisplayRange(min: number, max: number): void {
    this.displayRangeMin = min;
    this.displayRangeMax = max;
  }

  private loop(): void {
    const now = performance.now();
    const dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    this.scrollX += this.scrollSpeedPxPerSec * dt;

    this.render();
    this.animFrameId = requestAnimationFrame(() => this.loop());
  }

  private render(): void {
    const { canvas, ctx } = this;
    const W = canvas.width;
    const H = canvas.height;
    const keyboardWidth = 60;
    const rollWidth = W - keyboardWidth;
    const noteRange = this.displayRangeMax - this.displayRangeMin + 1;
    const noteHeight = H / noteRange;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = '#2a2a4e';
    ctx.lineWidth = 0.5;
    for (let n = this.displayRangeMin; n <= this.displayRangeMax; n++) {
      const y = H - (n - this.displayRangeMin + 1) * noteHeight;
      ctx.beginPath();
      ctx.moveTo(keyboardWidth, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Draw note history
    for (const entry of this.noteHistory) {
      if (entry.note < this.displayRangeMin || entry.note > this.displayRangeMax) continue;
      const endX = entry.endX ?? this.scrollX;
      const barWidth = Math.max(4, endX - entry.startX);
      const xPos = rollWidth - (this.scrollX - entry.startX) + keyboardWidth;
      if (xPos + barWidth < keyboardWidth || xPos > W) continue;

      const y = H - (entry.note - this.displayRangeMin + 1) * noteHeight;
      const brightness = Math.floor(100 + (entry.velocity / 127) * 155);
      ctx.fillStyle = `rgb(${brightness}, 50, 150)`;
      ctx.fillRect(Math.max(keyboardWidth, xPos), y, Math.min(barWidth, W - xPos), Math.max(2, noteHeight - 1));
    }

    this.drawPianoKeyboard(keyboardWidth, H, noteHeight);
  }

  private drawPianoKeyboard(width: number, height: number, noteHeight: number): void {
    const { ctx } = this;
    const noteRange = this.displayRangeMax - this.displayRangeMin + 1;

    for (let i = 0; i < noteRange; i++) {
      const note = this.displayRangeMin + i;
      const y = height - (i + 1) * noteHeight;
      const noteInOctave = note % 12;
      const isBlack = [1, 3, 6, 8, 10].includes(noteInOctave);
      const isActive = this.activeNotes.has(note);

      if (isBlack) {
        ctx.fillStyle = isActive ? '#e94560' : '#222';
        ctx.fillRect(0, y, width * 0.6, Math.max(2, noteHeight - 1));
      } else {
        ctx.fillStyle = isActive ? '#e94560' : '#ddd';
        ctx.fillRect(0, y, width, Math.max(2, noteHeight - 1));
        ctx.strokeStyle = '#999';
        ctx.strokeRect(0, y, width, Math.max(2, noteHeight - 1));
      }
    }
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  // Prune old note history to prevent memory growth
  pruneHistory(maxAgeScrollUnits = MAX_NOTE_HISTORY_SCROLL_UNITS): void {
    const threshold = this.scrollX - maxAgeScrollUnits;
    this.noteHistory = this.noteHistory.filter(
      (n) => n.endX === null || n.endX > threshold
    );
  }
}
