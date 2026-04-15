import React from 'react';

interface Props {
  activeNotes?: Set<number>;
  displayRangeMin?: number;
  displayRangeMax?: number;
  height?: number;
}

const BLACK_NOTES = new Set([1, 3, 6, 8, 10]);

export function PianoKeyboard({
  activeNotes = new Set(),
  displayRangeMin = 21,
  displayRangeMax = 108,
  height = 400,
}: Props): React.ReactElement {
  const noteRange = displayRangeMax - displayRangeMin + 1;
  const noteHeight = height / noteRange;

  return (
    <div style={{ position: 'relative', width: 60, height }}>
      {Array.from({ length: noteRange }, (_, i) => {
        const note = displayRangeMin + i;
        const noteInOctave = note % 12;
        const isBlack = BLACK_NOTES.has(noteInOctave);
        const isActive = activeNotes.has(note);
        const y = height - (i + 1) * noteHeight;

        return (
          <div
            key={note}
            style={{
              position: 'absolute',
              top: y,
              left: 0,
              width: isBlack ? '60%' : '100%',
              height: Math.max(2, noteHeight - 1),
              background: isActive ? '#e94560' : isBlack ? '#222' : '#ddd',
              border: isBlack ? 'none' : '1px solid #999',
              zIndex: isBlack ? 2 : 1,
            }}
          />
        );
      })}
    </div>
  );
}
