import { getBombPhase, getLaserPhase } from '../core/hazards';
import { GAME_PARAMS, type GameParams } from '../core/params';
import {
  CORE_RADIUS,
  GAME_OVER_EXPLOSION_MS,
  GRAZE_RADIUS,
  HUD_HEIGHT,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  type BombHazard,
  type BulletHazard,
  type GameState,
  type LaserHazard,
} from '../core/types';
import { formatSurvivalTime } from './storage';

export const PALETTE = {
  bg: '#F4F4F0',
  fg: '#111111',
  fgMuted: 'rgba(17, 17, 17, 0.28)',
  fgSubtle: 'rgba(17, 17, 17, 0.12)',
  danger: '#E62E2E',
  dangerSoft: 'rgba(230, 46, 46, 0.14)',
} as const;

export const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

export function drawCrossGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  topY: number
): void {
  ctx.strokeStyle = PALETTE.fgSubtle;
  ctx.lineWidth = 1;
  const step = 45;
  const tickHalf = 3.5;
  for (let x = step; x < width; x += step) {
    for (let y = topY + step; y < height; y += step) {
      ctx.beginPath();
      ctx.moveTo(x - tickHalf, y);
      ctx.lineTo(x + tickHalf, y);
      ctx.moveTo(x, y - tickHalf);
      ctx.lineTo(x, y + tickHalf);
      ctx.stroke();
    }
  }
}

function strokeEquilateralTriangle(
  ctx: CanvasRenderingContext2D,
  radius: number,
  angleOffset: number
): void {
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = angleOffset + (i * Math.PI * 2) / 3;
    const px = Math.cos(a) * radius;
    const py = Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
}

export function renderPlayerShipAndRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  lives: number,
  comboMultiplier: number,
  comboGauge: number,
  animTimeMs: number
): void {
  // 1. Graze Ring Track (GRAZE_RADIUS = 24)
  ctx.strokeStyle = PALETTE.fgMuted;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(x, y, GRAZE_RADIUS, 0, Math.PI * 2);
  ctx.stroke();

  // 2. Dynamic Combo Gauge Arc directly on the Graze Ring
  if (comboGauge > 0) {
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + Math.PI * 2 * Math.max(0, Math.min(1, comboGauge));
    ctx.strokeStyle = PALETTE.fg;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(x, y, GRAZE_RADIUS, startAngle, endAngle);
    ctx.stroke();
  }

  // 3. Flat Monospace Combo Multiplier Label beside Graze Ring
  if (comboMultiplier > 1.0 || comboGauge > 0) {
    const placeRight = x < LOGICAL_WIDTH - 68;
    const labelX = placeRight ? x + GRAZE_RADIUS + 6 : x - GRAZE_RADIUS - 6;
    const labelY = y - 8;
    ctx.save();
    ctx.font = `700 12px ${MONO_FONT}`;
    ctx.textAlign = placeRight ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = PALETTE.fg;
    ctx.fillText(`×${comboMultiplier.toFixed(1)}`, labelX, labelY);
    ctx.restore();
  }

  // 4. Player Craft Morphology by Remaining Lives (Vertices: 6 -> 3 -> 0)
  ctx.save();
  ctx.translate(x, y);

  const slowRot = animTimeMs * 0.0009;

  if (lives >= 3) {
    // 3 Lives: Slowly rotating Hexagram (two overlapping equilateral triangles)
    ctx.strokeStyle = PALETTE.fg;
    ctx.lineWidth = 1.5;
    strokeEquilateralTriangle(ctx, 13, slowRot - Math.PI / 2);
    strokeEquilateralTriangle(ctx, 13, slowRot + Math.PI / 2);
  } else if (lives === 2) {
    // 2 Lives: Slowly rotating Equilateral Triangle
    ctx.strokeStyle = PALETTE.fg;
    ctx.lineWidth = 1.6;
    strokeEquilateralTriangle(ctx, 13, slowRot - Math.PI / 2);
  } else {
    // 1 Life: Core only + small crimson sparks radiating outward from core
    ctx.strokeStyle = PALETTE.danger;
    ctx.lineWidth = 1.4;
    const sparkCount = 6;
    for (let i = 0; i < sparkCount; i++) {
      const phase = (animTimeMs * 0.004 + i * 0.37) % 1;
      const ang = i * ((Math.PI * 2) / sparkCount) + Math.sin(animTimeMs * 0.003 + i) * 0.4;
      const inner = 4.2 + phase * 8.0;
      const outer = inner + 3.8 * (1 - phase * 0.5);
      ctx.globalAlpha = Math.max(0, 1 - phase);
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * inner, Math.sin(ang) * inner);
      ctx.lineTo(Math.cos(ang) * outer, Math.sin(ang) * outer);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Exact Hitbox Core (CORE_RADIUS = 3.0) with paper halo for contrast over crimson hazards
  ctx.fillStyle = PALETTE.bg;
  ctx.beginPath();
  ctx.arc(0, 0, CORE_RADIUS + 1.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = lives === 1 ? PALETTE.danger : PALETTE.fg;
  ctx.beginPath();
  ctx.arc(0, 0, CORE_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function renderLaserHazard(
  ctx: CanvasRenderingContext2D,
  laser: LaserHazard
): void {
  if (laser.elapsedMs < 0) return;
  const { effects } = GAME_PARAMS;
  const phase = getLaserPhase(laser);
  if (phase === 'WARNING') {
    const drawProgress = Math.min(1, laser.elapsedMs / effects.laserWarningDrawDurationMs);
    const ex = laser.x1 + (laser.x2 - laser.x1) * drawProgress;
    const ey = laser.y1 + (laser.y2 - laser.y1) * drawProgress;
    const imminence = Math.max(0, Math.min(1, laser.elapsedMs / laser.warningDurationMs));
    const snapThreshold = effects.laserWarningSnapThreshold;

    // 1. Lock-on beam width corridor that snaps inward right before ignition
    let corridorWidth = laser.halfWidth * 2;
    if (imminence > snapThreshold) {
      const snapT = (imminence - snapThreshold) / Math.max(1e-6, 1 - snapThreshold);
      corridorWidth = laser.halfWidth * 2 * (1 - snapT * 0.85);
    }
    ctx.save();
    ctx.strokeStyle =
      imminence > snapThreshold ? 'rgba(230, 46, 46, 0.28)' : PALETTE.dangerSoft;
    ctx.lineWidth = corridorWidth;
    ctx.beginPath();
    ctx.moveTo(laser.x1, laser.y1);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.restore();

    // 2. Marching directional dashed line accelerating from (x1, y1) toward (x2, y2)
    ctx.save();
    ctx.strokeStyle = PALETTE.danger;
    ctx.lineWidth = imminence > 0.78 ? 2.0 : 1.2;
    ctx.setLineDash([8, 6]);
    const marchSpeed = 0.08 + imminence * 0.14;
    ctx.lineDashOffset = -(laser.elapsedMs * marchSpeed);
    ctx.beginPath();
    ctx.moveTo(laser.x1, laser.y1);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.restore();
  } else if (phase === 'ACTIVE') {
    const activeElapsed = laser.elapsedMs - laser.warningDurationMs;
    const collapseWindowMs = Math.min(
      effects.laserCollapseWindowMaxMs,
      laser.activeDurationMs * 0.25
    );

    // Ignition spike and tapered decay collapse
    let widthScale = 1.0;
    let isIgnitionFlash = false;
    if (activeElapsed < effects.laserIgnitionSpikeDurationMs) {
      const flashT = 1 - activeElapsed / effects.laserIgnitionSpikeDurationMs;
      widthScale = 1.0 + flashT * effects.laserIgnitionWidthBoost;
      isIgnitionFlash = activeElapsed < effects.laserIgnitionFlashDurationMs;
    } else if (activeElapsed > laser.activeDurationMs - collapseWindowMs) {
      const collapseT =
        (activeElapsed - (laser.activeDurationMs - collapseWindowMs)) / collapseWindowMs;
      widthScale = Math.max(0.08, 1 - collapseT);
    }

    const currentHalfW = laser.halfWidth * widthScale;

    if (isIgnitionFlash) {
      ctx.strokeStyle = PALETTE.fg;
      ctx.lineWidth = currentHalfW * 2 + 2.5;
      ctx.beginPath();
      ctx.moveTo(laser.x1, laser.y1);
      ctx.lineTo(laser.x2, laser.y2);
      ctx.stroke();
    }

    ctx.strokeStyle = PALETTE.danger;
    ctx.lineWidth = currentHalfW * 2;
    ctx.beginPath();
    ctx.moveTo(laser.x1, laser.y1);
    ctx.lineTo(laser.x2, laser.y2);
    ctx.stroke();

    // High-speed directional energy pulses marching along the white core
    ctx.save();
    ctx.strokeStyle = PALETTE.bg;
    ctx.lineWidth = Math.max(1.5, currentHalfW * (isIgnitionFlash ? 0.9 : 0.58));
    ctx.setLineDash([14, 18]);
    ctx.lineDashOffset = -(activeElapsed * 0.65);
    ctx.beginPath();
    ctx.moveTo(laser.x1, laser.y1);
    ctx.lineTo(laser.x2, laser.y2);
    ctx.stroke();
    ctx.restore();

    // Continuous center core thread
    ctx.strokeStyle = PALETTE.bg;
    ctx.lineWidth = Math.max(0.8, currentHalfW * 0.22);
    ctx.beginPath();
    ctx.moveTo(laser.x1, laser.y1);
    ctx.lineTo(laser.x2, laser.y2);
    ctx.stroke();
  }
}

export function computeBulletTelegraphProjection(
  bullet: BulletHazard,
  params: GameParams = GAME_PARAMS
): {
  readonly gx: number;
  readonly gy: number;
  readonly progress: number;
  readonly isSnap: boolean;
} {
  const totalWait = Math.max(1, bullet.warningDurationMs);
  const progress = 1 - Math.min(1, Math.max(0, -bullet.elapsedMs / totalWait));
  const extraStaggerSec = Math.max(0, (totalWait - params.bullet.warningDurationMs) / 1000);
  const previewSec =
    (params.effects.bulletTelegraphBasePreviewSec +
      extraStaggerSec * params.effects.bulletTelegraphStaggerPreviewScale) *
    (0.45 + 0.55 * progress);
  return {
    gx: bullet.x + bullet.vx * previewSec,
    gy: bullet.y + bullet.vy * previewSec,
    progress,
    isSnap: progress > params.effects.bulletTelegraphSnapThreshold,
  };
}

export function renderBulletHazard(
  ctx: CanvasRenderingContext2D,
  bullet: BulletHazard,
  params: GameParams = GAME_PARAMS
): void {
  if (bullet.elapsedMs < 0) {
    const { gx, gy, progress, isSnap } = computeBulletTelegraphProjection(bullet, params);
    const angle = Math.atan2(bullet.vy, bullet.vx);
    const tickLen = 3.5 + progress * 3.5;

    ctx.strokeStyle = PALETTE.dangerSoft;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(bullet.x, bullet.y);
    ctx.lineTo(gx, gy);
    ctx.stroke();

    ctx.strokeStyle = isSnap ? PALETTE.danger : 'rgba(230, 46, 46, 0.50)';
    ctx.lineWidth = isSnap ? 1.5 : 1.1;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + Math.cos(angle) * tickLen, gy + Math.sin(angle) * tickLen);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(gx, gy, 2.2, 0, Math.PI * 2);
    if (isSnap) {
      ctx.fillStyle = PALETTE.danger;
      ctx.fill();
    } else {
      ctx.fillStyle = PALETTE.bg;
      ctx.fill();
      ctx.strokeStyle = PALETTE.danger;
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
    return;
  }

  ctx.fillStyle = PALETTE.danger;
  ctx.beginPath();
  ctx.arc(bullet.x, bullet.y, bullet.radius + 1.0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = PALETTE.bg;
  ctx.beginPath();
  ctx.arc(bullet.x, bullet.y, bullet.radius * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

export class CanvasRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private scaleX = 1;
  private scaleY = 1;

  public constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to acquire 2D rendering context');
    }
    this.ctx = context;
    this.resize();
  }

  public resize(): void {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = rect.width > 0 ? rect.width : LOGICAL_WIDTH;
    const cssHeight = rect.height > 0 ? rect.height : LOGICAL_HEIGHT;

    const physicalWidth = Math.round(cssWidth * dpr);
    const physicalHeight = Math.round(cssHeight * dpr);

    if (this.canvas.width !== physicalWidth || this.canvas.height !== physicalHeight) {
      this.canvas.width = physicalWidth;
      this.canvas.height = physicalHeight;
    }

    this.scaleX = physicalWidth / LOGICAL_WIDTH;
    this.scaleY = physicalHeight / LOGICAL_HEIGHT;
  }

  public getLogicalScale(): { readonly scaleX: number; readonly scaleY: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      scaleX: rect.width > 0 ? LOGICAL_WIDTH / rect.width : 1,
      scaleY: rect.height > 0 ? LOGICAL_HEIGHT / rect.height : 1,
    };
  }

  public render(state: GameState, visualNowMs = performance.now()): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.scaleX, 0, 0, this.scaleY, 0, 0);

    const isIdlePhase = state.phase === 'TITLE' || state.phase === 'RESULT';
    const animTimeMs = isIdlePhase ? visualNowMs : state.survivalTimeMs;

    // Paper background
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // Playfield
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HUD_HEIGHT, LOGICAL_WIDTH, LOGICAL_HEIGHT - HUD_HEIGHT);
    ctx.clip();

    if (state.screenShakeMs > 0) {
      const { screenShakeMaxPx, screenShakeBasePx, screenShakeRefDurationMs } =
        GAME_PARAMS.effects;
      const intensity = Math.min(
        screenShakeMaxPx,
        (state.screenShakeMs / screenShakeRefDurationMs) * screenShakeBasePx
      );
      const ox = (Math.random() - 0.5) * intensity * 2;
      const oy = (Math.random() - 0.5) * intensity * 2;
      ctx.translate(ox, oy);
    }

    // Subtle radar cross-tick grid
    drawCrossGrid(ctx, LOGICAL_WIDTH, LOGICAL_HEIGHT, HUD_HEIGHT);

    // Calibration guide crosshair on Title/Result
    if (isIdlePhase) {
      const cx = LOGICAL_WIDTH / 2;
      const cy =
        HUD_HEIGHT + (LOGICAL_HEIGHT - HUD_HEIGHT) * GAME_PARAMS.player.defaultCenterYRatio;
      ctx.save();
      ctx.strokeStyle = PALETTE.fgMuted;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(cx - 44, cy);
      ctx.lineTo(cx + 44, cy);
      ctx.moveTo(cx, cy - 44);
      ctx.lineTo(cx, cy + 44);
      ctx.stroke();
      ctx.restore();
    }

    // Direct Hit Impact Flash
    if (state.hitFlashMs > 0) {
      const flashRefMs = Math.max(1, GAME_PARAMS.effects.hitFlashMs);
      const flashAlpha = Math.min(
        GAME_PARAMS.effects.hitFlashMaxAlpha,
        state.hitFlashMs / flashRefMs
      );
      ctx.fillStyle = `rgba(230, 46, 46, ${flashAlpha})`;
      ctx.fillRect(0, HUD_HEIGHT, LOGICAL_WIDTH, LOGICAL_HEIGHT - HUD_HEIGHT);
    }

    // Hazards: Bombs -> Lasers -> Bullets
    for (const h of state.hazards) {
      if (h.kind === 'BOMB') {
        this.renderBomb(ctx, h);
      }
    }
    for (const h of state.hazards) {
      if (h.kind === 'LASER') {
        this.renderLaser(ctx, h);
      }
    }
    for (const h of state.hazards) {
      if (h.kind === 'BULLET') {
        this.renderBullet(ctx, h);
      }
    }

    // Geometric Line-Tick Sparks
    for (const s of state.sparks) {
      const alpha = Math.max(0, s.remainingMs / s.totalMs);
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.04, s.y - s.vy * 0.04);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Score Popups (clean monospace)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of state.popups) {
      ctx.font = `700 ${p.isCritical ? 13 : 11}px ${MONO_FONT}`;
      ctx.fillStyle = p.isCritical ? PALETTE.danger : PALETTE.fg;
      ctx.fillText(p.text, p.x, p.y);
    }

    // Player Craft or Destruction Shockwaves
    if (state.phase === 'GAME_OVER') {
      this.renderPlayerExplosion(ctx, state);
    } else {
      this.renderPlayer(ctx, state, animTimeMs, isIdlePhase);
    }

    ctx.restore();

    // Top Flat HUD
    this.renderHud(ctx, state);

    // Playfield Border (turns crimson on last life during active play)
    const isLastLifePlaying = state.lives === 1 && state.phase === 'PLAYING';
    ctx.strokeStyle = isLastLifePlaying ? PALETTE.danger : PALETTE.fg;
    ctx.lineWidth = isLastLifePlaying ? 2.5 : 1;
    ctx.strokeRect(0.5, HUD_HEIGHT + 0.5, LOGICAL_WIDTH - 1, LOGICAL_HEIGHT - HUD_HEIGHT - 1);

    ctx.restore();
  }

  private renderHud(ctx: CanvasRenderingContext2D, state: GameState): void {
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, HUD_HEIGHT);

    ctx.strokeStyle = PALETTE.fg;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, HUD_HEIGHT);
    ctx.lineTo(LOGICAL_WIDTH, HUD_HEIGHT);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = PALETTE.fg;
    ctx.font = `700 20px ${MONO_FONT}`;
    ctx.fillText(state.score.toLocaleString('en-US').padStart(9, '0'), 12, 26);

    ctx.fillStyle = PALETTE.fgMuted;
    ctx.font = `600 11px ${MONO_FONT}`;
    ctx.fillText(`TIME ${formatSurvivalTime(state.survivalTimeMs)}`, 12, 44);
  }

  private renderBomb(ctx: CanvasRenderingContext2D, bomb: BombHazard): void {
    if (bomb.elapsedMs < 0) return;
    const info = getBombPhase(bomb);
    if (info.phase === 'CONVERGING') {
      ctx.fillStyle = PALETTE.dangerSoft;
      ctx.beginPath();
      ctx.arc(bomb.x, bomb.y, bomb.blastRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.strokeStyle = PALETTE.danger;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(bomb.x, bomb.y, bomb.blastRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = PALETTE.danger;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(bomb.x, bomb.y, info.currentRingRadius, 0, Math.PI * 2);
      ctx.stroke();
    } else if (info.phase === 'HOLD') {
      const blink =
        Math.floor(bomb.elapsedMs / GAME_PARAMS.effects.bombHoldBlinkIntervalMs) % 2 === 0;
      ctx.fillStyle = blink ? 'rgba(230, 46, 46, 0.24)' : PALETTE.dangerSoft;
      ctx.beginPath();
      ctx.arc(bomb.x, bomb.y, bomb.blastRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.strokeStyle = PALETTE.danger;
      ctx.lineWidth = blink ? 2.2 : 1.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(bomb.x, bomb.y, bomb.blastRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (info.phase === 'ACTIVE') {
      ctx.fillStyle = PALETTE.danger;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(bomb.x, bomb.y, bomb.blastRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.strokeStyle = PALETTE.fg;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(bomb.x, bomb.y, bomb.blastRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private renderLaser(ctx: CanvasRenderingContext2D, laser: LaserHazard): void {
    renderLaserHazard(ctx, laser);
  }

  private renderBullet(ctx: CanvasRenderingContext2D, bullet: BulletHazard): void {
    renderBulletHazard(ctx, bullet);
  }

  private renderPlayerExplosion(ctx: CanvasRenderingContext2D, state: GameState): void {
    const { x, y } = state.player;
    const progress =
      1 - Math.max(0, Math.min(1, state.gameOverTimerMs / GAME_OVER_EXPLOSION_MS));

    const r1 = 8 + progress * 155;
    const alpha1 = Math.max(0, 1 - progress);
    ctx.strokeStyle = PALETTE.danger;
    ctx.globalAlpha = alpha1;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, r1, 0, Math.PI * 2);
    ctx.stroke();

    if (progress > 0.15) {
      const p2 = (progress - 0.15) / 0.85;
      const r2 = 6 + p2 * 105;
      ctx.strokeStyle = PALETTE.fg;
      ctx.globalAlpha = Math.max(0, 1 - p2);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(x, y, r2, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (progress < 0.45) {
      ctx.fillStyle = PALETTE.danger;
      ctx.globalAlpha = 1 - progress / 0.45;
      ctx.beginPath();
      ctx.arc(x, y, 18 * (1 - progress), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private renderPlayer(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    animTimeMs: number,
    isIdlePhase: boolean
  ): void {
    const { x, y, invulnerableMs, trail } = state.player;
    const drawX = isIdlePhase ? x + Math.sin(animTimeMs * 0.003) * 10 : x;
    const drawY = isIdlePhase ? y + Math.cos(animTimeMs * 0.006) * 5 : y;

    if (trail.length > 1) {
      ctx.strokeStyle = PALETTE.fgMuted;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      for (let i = 1; i < trail.length; i++) {
        ctx.lineTo(trail[i].x, trail[i].y);
      }
      ctx.stroke();
    }

    if (
      invulnerableMs > 0 &&
      Math.floor(invulnerableMs / GAME_PARAMS.effects.invulnerableBlinkIntervalMs) % 2 === 1
    ) {
      return;
    }

    renderPlayerShipAndRing(
      ctx,
      drawX,
      drawY,
      state.lives,
      state.comboMultiplier,
      state.comboGauge,
      animTimeMs
    );
  }
}
