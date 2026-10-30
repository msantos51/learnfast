import type * as AlphaTab from '@coderline/alphatab';

type ICursorHandler = NonNullable<AlphaTab.AlphaTabApi['customCursorHandler']>;
type CursorMode = AlphaTab.midi.MidiTickLookupFindBeatResultCursorMode;

/**
 * Atrasa as atualizações visuais (cursor da tablatura, esquema) em relação ao som,
 * para compensar a latência da saída de áudio (ex.: auscultadores Bluetooth).
 */
export class VisualDelay {
  private pending = new Set<ReturnType<typeof setTimeout>>();

  constructor(private getDelayMs: () => number, private isPlaying: () => boolean) {}

  run(fn: () => void): void {
    const d = this.getDelayMs();
    if (d > 0 && this.isPlaying()) {
      const id = setTimeout(() => { this.pending.delete(id); fn(); }, d);
      this.pending.add(id);
    } else fn();
  }

  clear(): void {
    this.pending.forEach(clearTimeout);
    this.pending.clear();
  }

  /** Cursor igual ao do alphaTab (anima até ao tempo seguinte), mas com o atraso aplicado. */
  cursorHandler(toNextBeat: CursorMode): ICursorHandler {
    return {
      onAttach() {},
      onDetach() {},
      placeBeatCursor: (cursor, bounds, x) => this.run(() => {
        const bb = bounds.barBounds.masterBarBounds.visualBounds;
        cursor.transitionToX(0, x);
        cursor.setBounds(x, bb.y, 1, bb.h);
      }),
      placeBarCursor: (cursor, bounds) => this.run(() => {
        const bb = bounds.barBounds.masterBarBounds.visualBounds;
        cursor.setBounds(bb.x, bb.y, bb.w, bb.h);
      }),
      transitionBeatCursor: (cursor, _bounds, x, nextX, duration, mode) => this.run(() => {
        const f = mode === toNextBeat ? 2 : 1;
        cursor.transitionToX(duration * f, x + (nextX - x) * f);
      }),
    };
  }
}
