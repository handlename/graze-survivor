import { describe, expect, it } from 'vitest';
import { CORE_RADIUS, LOGICAL_WIDTH } from '../../src/core/types';
import { PALETTE, renderPlayerShipAndRing } from '../../src/shell/renderer';

interface RecordedCall {
  readonly method: string;
  readonly args: readonly unknown[];
  readonly strokeStyle: string;
  readonly fillStyle: string;
  readonly textAlign: CanvasTextAlign;
}

function createRecordingContext(): {
  readonly ctx: CanvasRenderingContext2D;
  readonly calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  let strokeStyle = '#000000';
  let fillStyle = '#000000';
  let textAlign: CanvasTextAlign = 'start';

  const record = (method: string, ...args: unknown[]) => {
    calls.push({ method, args, strokeStyle, fillStyle, textAlign });
  };

  const mock = {
    get strokeStyle() {
      return strokeStyle;
    },
    set strokeStyle(v: string) {
      strokeStyle = v;
    },
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(v: string) {
      fillStyle = v;
    },
    get textAlign() {
      return textAlign;
    },
    set textAlign(v: CanvasTextAlign) {
      textAlign = v;
    },
    lineWidth: 1,
    font: '',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    save: () => record('save'),
    restore: () => record('restore'),
    translate: (x: number, y: number) => record('translate', x, y),
    rotate: (a: number) => record('rotate', a),
    beginPath: () => record('beginPath'),
    closePath: () => record('closePath'),
    moveTo: (x: number, y: number) => record('moveTo', x, y),
    lineTo: (x: number, y: number) => record('lineTo', x, y),
    arc: (x: number, y: number, r: number, s: number, e: number) =>
      record('arc', x, y, r, s, e),
    fill: () => record('fill'),
    stroke: () => record('stroke'),
    fillText: (text: string, x: number, y: number) => record('fillText', text, x, y),
    setLineDash: (segments: number[]) => record('setLineDash', segments),
  };

  return {
    ctx: mock as unknown as CanvasRenderingContext2D,
    calls,
  };
}

describe('minimal geometric renderer', () => {
  it('exposes the 3-color paper/ink/crimson palette', () => {
    expect(PALETTE.bg).toBe('#F4F4F0');
    expect(PALETTE.fg).toBe('#111111');
    expect(PALETTE.danger).toBe('#E62E2E');
  });

  it('renders a hexagram (2 closed triangles = 6 vertices) at 3 lives, a single triangle (3 vertices) at 2 lives, and core-only with crimson sparks (0 closed polygons) at 1 life', () => {
    const runAtLives = (lives: number) => {
      const { ctx, calls } = createRecordingContext();
      renderPlayerShipAndRing(ctx, 180, 320, lives, 1.0, 0, 1200);
      return calls;
    };

    const calls3 = runAtLives(3);
    const calls2 = runAtLives(2);
    const calls1 = runAtLives(1);

    // 3 lives -> 2 closed triangles (hexagram)
    expect(calls3.filter((c) => c.method === 'closePath')).toHaveLength(2);
    // 2 lives -> 1 closed triangle
    expect(calls2.filter((c) => c.method === 'closePath')).toHaveLength(1);
    // 1 life -> 0 closed polygons, plus crimson (#E62E2E) spark strokes around core
    expect(calls1.filter((c) => c.method === 'closePath')).toHaveLength(0);
    const crimsonStrokes = calls1.filter(
      (c) => c.method === 'stroke' && c.strokeStyle === PALETTE.danger
    );
    expect(crimsonStrokes.length).toBeGreaterThanOrEqual(4);

    // Core hitbox (r = CORE_RADIUS) is preceded by a background-colored halo arc so it stays visible over crimson hazards
    const coreHaloArc = calls3.find(
      (c) =>
        c.method === 'arc' &&
        c.args[0] === 0 &&
        c.args[1] === 0 &&
        Number(c.args[2]) > CORE_RADIUS
    );
    expect(coreHaloArc).toBeDefined();
  });

  it('flips combo multiplier text alignment when near the right wall', () => {
    const center = createRecordingContext();
    renderPlayerShipAndRing(center.ctx, 180, 320, 3, 12.5, 0.8, 500);
    const centerText = center.calls.find((c) => c.method === 'fillText');
    expect(centerText?.textAlign).toBe('left');

    const rightEdge = createRecordingContext();
    renderPlayerShipAndRing(rightEdge.ctx, LOGICAL_WIDTH - 20, 320, 3, 12.5, 0.8, 500);
    const rightEdgeText = rightEdge.calls.find((c) => c.method === 'fillText');
    expect(rightEdgeText?.textAlign).toBe('right');
  });
});
