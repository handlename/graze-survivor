import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialGameState } from '../src/core/game';
import {
  HUD_HEIGHT,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  type GameState,
  type RankingRecord,
} from '../src/core/types';
import {
  buildShareMessage,
  computeClampedPeakCamera,
  renderResultCardCanvas,
} from '../src/shell/share';

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

describe('renderResultCardCanvas - Peak Graze Moment Layout A (1.35x player-centered with left gradient)', () => {
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

  it('renders peak moment at uniform 1.35x scale and clamps camera so playfield always fills the designated peak region', () => {
    const { ops } = setupMockCanvasDocument();
    const baseState = createInitialGameState();
    const state: GameState = {
      ...baseState,
      peakMoment: {
        timeMs: 74230,
        windowScoreRatePerSec: 18420,
        comboMultiplier: 4.8,
        player: {
          x: 200,
          y: 348,
          invulnerableMs: 0,
          trail: [{ x: 200, y: 348 }],
        },
        hazards: [
          {
            id: 'b1',
            kind: 'BOMB',
            x: 60,
            y: 340,
            blastRadius: 48,
            elapsedMs: 100,
            convergeDurationMs: 420,
            holdDurationMs: 680,
            activeDurationMs: 450,
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
      expect(s.args[0]).toBe(1.35);
      expect(s.args[1]).toBe(1.35);
    }

    const translateOps = ops.filter((o) => o.op === 'translate');
    expect(translateOps).toContainEqual({ op: 'translate', args: [455, 200] });
    expect(translateOps).toContainEqual({ op: 'translate', args: [-200, -348] });

    // Verify 3-tier priority rules across extreme and central player positions:
    // Priority 1: Player always stays inside the right half of the result card (cardX in [338..579], cardY in [21..379])
    // Priority 2: Within Priority 1, playfield fills the peak display area (top <= 11, bottom >= 389, right >= 589, and left <= 210 whenever playerX >= 87)
    // Priority 3: Within Priorities 1 & 2, player is centered at (455, 200)
    const testPositions = [
      { x: 8, y: HUD_HEIGHT + 8 },
      { x: LOGICAL_WIDTH - 8, y: LOGICAL_HEIGHT - 8 },
      { x: 20, y: 600 },
      { x: 330, y: 80 },
      { x: 180, y: 348 },
      { x: 200, y: 348 },
    ];
    for (const pos of testPositions) {
      const { camX, camY } = computeClampedPeakCamera(pos.x, pos.y);
      const playerCardX = 455 + (pos.x - camX) * 1.35;
      const playerCardY = 200 + (pos.y - camY) * 1.35;
      const cardLeftX = 455 + (0 - camX) * 1.35;
      const cardRightX = 455 + (LOGICAL_WIDTH - camX) * 1.35;
      const cardTopY = 200 + (HUD_HEIGHT - camY) * 1.35;
      const cardBottomY = 200 + (LOGICAL_HEIGHT - camY) * 1.35;

      // Priority 1: Player always inside right half of card
      expect(playerCardX).toBeGreaterThanOrEqual(337.999);
      expect(playerCardX).toBeLessThanOrEqual(579.001);
      expect(playerCardY).toBeGreaterThanOrEqual(20.999);
      expect(playerCardY).toBeLessThanOrEqual(379.001);

      // Priority 2: Top, bottom, and right borders always filled; left filled whenever Priority 1 permits
      expect(cardRightX).toBeGreaterThanOrEqual(588.999);
      expect(cardTopY).toBeLessThanOrEqual(11.001);
      expect(cardBottomY).toBeGreaterThanOrEqual(388.999);
      if (pos.x >= 87) {
        expect(cardLeftX).toBeLessThanOrEqual(210.001);
      }
    }

    // Priority 3: Central player (200, 348) is placed at exact center (455, 200)
    const centered = computeClampedPeakCamera(200, 348);
    expect(455 + (200 - centered.camX) * 1.35).toBeCloseTo(455, 5);
    expect(200 + (348 - centered.camY) * 1.35).toBeCloseTo(200, 5);
  });

  it('clips strictly inside card border, does not draw an inner playfield border line that shows through the gradient, and fully masks the left playfield edge', () => {
    const { ops, gradientStops } = setupMockCanvasDocument();
    const state = createInitialGameState();

    renderResultCardCanvas(state, sampleRecord, false);

    // Clips strictly inside the 2px outer frame (10, 10, 580, 380) -> y: 11..389, x: 210..589
    const rectOps = ops.filter((o) => o.op === 'rect');
    expect(rectOps).toContainEqual({ op: 'rect', args: [210, 11, 379, 378] });
    expect(rectOps.length).toBeGreaterThanOrEqual(2);

    // Outer margins outside CARD_FRAME are masked with paper background before drawing the outer border
    const fillRectOps = ops.filter((o) => o.op === 'fillRect');
    expect(fillRectOps).toContainEqual({ op: 'fillRect', args: [590, 0, 10, 400] });
    expect(fillRectOps).toContainEqual({ op: 'fillRect', args: [0, 0, 600, 10] });
    expect(fillRectOps).toContainEqual({ op: 'fillRect', args: [0, 390, 600, 10] });
    expect(fillRectOps).toContainEqual({ op: 'fillRect', args: [0, 0, 10, 400] });

    // No inner playfield strokeRect(0.5, 56.5, ...) should be drawn inside the peak snapshot
    const playfieldBorderStroke = ops.find(
      (o) => o.op === 'strokeRect' && o.args[0] === 0.5 && o.args[1] === HUD_HEIGHT + 0.5
    );
    expect(playfieldBorderStroke).toBeUndefined();

    // Left paper gradient overlay completely hides the left edge before fading out
    const gradIndex = ops.findIndex((o) => o.op === 'createLinearGradient');
    expect(gradIndex).toBeGreaterThan(-1);
    expect(gradientStops[0]).toEqual({ offset: 0, color: 'rgba(244, 244, 240, 1.0)' });
    expect(gradientStops.some((s) => s.offset > 0 && s.color === 'rgba(244, 244, 240, 1.0)')).toBe(
      true
    );
    expect(gradientStops[gradientStops.length - 1]).toEqual({
      offset: 1,
      color: 'rgba(244, 244, 240, 0.0)',
    });

    // Final score text and outer card border are drawn after the snapshot and gradient
    const scoreTextIndex = ops.findIndex(
      (o) => o.op === 'fillText' && o.args[0] === '148,920'
    );
    expect(scoreTextIndex).toBeGreaterThan(gradIndex);

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

  it('displays startLevel on the result card canvas and in buildShareMessage', () => {
    const { ops } = setupMockCanvasDocument();
    const state = { ...createInitialGameState(), startLevel: -3 };
    const recordWithLevel: RankingRecord = {
      ...sampleRecord,
      startLevel: -3,
    };

    renderResultCardCanvas(state, recordWithLevel, false);

    const fillTexts = ops.filter((o) => o.op === 'fillText').map((o) => String(o.args[0]));
    expect(fillTexts).toContain('START LEVEL: -3');

    const msg = buildShareMessage(recordWithLevel, false);
    expect(msg).toContain('START LEVEL: LV.-3');
  });
});
