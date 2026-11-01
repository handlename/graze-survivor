import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialGameState } from '../src/core/game';
import {
  HUD_HEIGHT,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  type GameState,
  type RankingRecord,
} from '../src/core/types';
import { renderResultCardCanvas } from '../src/shell/share';

interface RecordedOp {
  readonly op: string;
  readonly args: readonly unknown[];
}

function setupMockCanvasDocument() {
  const ops: RecordedOp[] = [];
  const gradientStops: Array<{ readonly offset: number; readonly color: string }> = [];

  const mockGradient = {
    addColorStop: (offset: number, color: string) => {
      gradientStops.push({ offset, color });
    },
  };

  const mockCtx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    lineDashOffset: 0,
    save: () => ops.push({ op: 'save', args: [] }),
    restore: () => ops.push({ op: 'restore', args: [] }),
    beginPath: () => ops.push({ op: 'beginPath', args: [] }),
    closePath: () => ops.push({ op: 'closePath', args: [] }),
    rect: (...args: unknown[]) => ops.push({ op: 'rect', args }),
    clip: () => ops.push({ op: 'clip', args: [] }),
    fillRect: (...args: unknown[]) => ops.push({ op: 'fillRect', args }),
    strokeRect: (...args: unknown[]) => ops.push({ op: 'strokeRect', args }),
    moveTo: (...args: unknown[]) => ops.push({ op: 'moveTo', args }),
    lineTo: (...args: unknown[]) => ops.push({ op: 'lineTo', args }),
    arc: (...args: unknown[]) => ops.push({ op: 'arc', args }),
    fill: () => ops.push({ op: 'fill', args: [] }),
    stroke: () => ops.push({ op: 'stroke', args: [] }),
    fillText: (...args: unknown[]) => ops.push({ op: 'fillText', args }),
    translate: (...args: unknown[]) => ops.push({ op: 'translate', args }),
    scale: (...args: unknown[]) => ops.push({ op: 'scale', args }),
    setLineDash: (...args: unknown[]) => ops.push({ op: 'setLineDash', args }),
    createLinearGradient: (...args: unknown[]) => {
      ops.push({ op: 'createLinearGradient', args });
      return mockGradient;
    },
  };

  const mockCanvas = {
    width: 0,
    height: 0,
    getContext: (type: string) => (type === '2d' ? mockCtx : null),
  };

  vi.stubGlobal('document', {
    createElement: (tag: string) => (tag === 'canvas' ? mockCanvas : {}),
  });

  return { ops, gradientStops, mockCanvas, mockCtx };
}

describe('renderResultCardCanvas - Peak Graze Moment Layout A (1.0x player-centered with left gradient)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const sampleRecord: RankingRecord = {
    score: 148920,
    survivalTimeMs: 102650,
    maxCombo: 4.8,
    totalGrazeCount: 312,
    timestamp: '2026-11-01 17:20:00',
  };

  it('renders peak moment at uniform 1:1 (1.0x) scale centered on the player at (455, 200)', () => {
    const { ops } = setupMockCanvasDocument();
    const baseState = createInitialGameState();
    const state: GameState = {
      ...baseState,
      peakMoment: {
        timeMs: 74230,
        windowScoreRatePerSec: 18420,
        comboMultiplier: 4.8,
        player: {
          x: 42,
          y: 96,
          invulnerableMs: 0,
          trail: [{ x: 42, y: 96 }],
        },
        hazards: [
          {
            id: 'b1',
            kind: 'BULLET',
            x: 60,
            y: 100,
            vx: -100,
            vy: 0,
            radius: 4,
            elapsedMs: 50,
            warningDurationMs: 400,
            grazeTimerMs: 0,
          },
        ],
        sparks: [],
        popups: [],
      },
    };

    renderResultCardCanvas(state, sampleRecord, true);

    const scaleOps = ops.filter((o) => o.op === 'scale');
    expect(scaleOps.length).toBeGreaterThanOrEqual(1);
    for (const s of scaleOps) {
      expect(s.args[0]).toBe(1);
      expect(s.args[1]).toBe(1);
    }

    const translateOps = ops.filter((o) => o.op === 'translate');
    expect(translateOps).toContainEqual({ op: 'translate', args: [455, 200] });
    expect(translateOps).toContainEqual({ op: 'translate', args: [-42, -96] });
  });

  it('clips strictly to right card region (210, 10, 380, 380) and playfield world (0, 56, 360, 584), applies left paper gradient (210..375), and draws outer border last', () => {
    const { ops, gradientStops } = setupMockCanvasDocument();
    const state = createInitialGameState();

    renderResultCardCanvas(state, sampleRecord, false);

    // Card right-region clip and playfield world clip
    const rectOps = ops.filter((o) => o.op === 'rect');
    expect(rectOps).toContainEqual({ op: 'rect', args: [210, 10, 380, 380] });
    expect(rectOps).toContainEqual({
      op: 'rect',
      args: [0, HUD_HEIGHT, LOGICAL_WIDTH, LOGICAL_HEIGHT - HUD_HEIGHT],
    });

    // Left paper gradient overlay from x=210 to x=375
    const gradIndex = ops.findIndex(
      (o) =>
        o.op === 'createLinearGradient' &&
        o.args[0] === 210 &&
        o.args[1] === 0 &&
        o.args[2] === 375 &&
        o.args[3] === 0
    );
    expect(gradIndex).toBeGreaterThan(-1);
    expect(gradientStops.length).toBeGreaterThanOrEqual(2);
    expect(gradientStops[0]).toEqual({ offset: 0, color: 'rgba(244, 244, 240, 1.0)' });
    expect(gradientStops[gradientStops.length - 1]).toEqual({
      offset: 1,
      color: 'rgba(244, 244, 240, 0.0)',
    });

    const gradFillIndex = ops.findIndex(
      (o, idx) =>
        idx > gradIndex &&
        o.op === 'fillRect' &&
        o.args[0] === 210 &&
        o.args[1] === 10 &&
        o.args[2] === 165 &&
        o.args[3] === 380
    );
    expect(gradFillIndex).toBeGreaterThan(gradIndex);

    // Final score text is drawn AFTER the gradient overlay so left text is never faded
    const scoreTextIndex = ops.findIndex(
      (o) => o.op === 'fillText' && o.args[0] === '148,920'
    );
    expect(scoreTextIndex).toBeGreaterThan(gradFillIndex);

    // Outer card frame strokeRect(10, 10, 580, 380) is the last strokeRect operation
    const outerFrameIndex = ops.findIndex(
      (o) =>
        o.op === 'strokeRect' &&
        o.args[0] === 10 &&
        o.args[1] === 10 &&
        o.args[2] === 580 &&
        o.args[3] === 380
    );
    expect(outerFrameIndex).toBeGreaterThan(scoreTextIndex);
  });
});
