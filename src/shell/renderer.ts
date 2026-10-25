import { getBombPhase, getLaserPhase } from '../core/hazards';
import {
  CORE_RADIUS,
  GRAZE_RADIUS,
  HUD_HEIGHT,
  INITIAL_LIVES,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  type BombHazard,
  type BulletHazard,
  type GameState,
  type LaserHazard,
} from '../core/types';
import { formatSurvivalTime } from './storage';

const MINCHO_FONT_FAMILY =
  '"Hiragino Mincho ProN", "Yu Mincho", "MS PMincho", "Noto Serif JP", Georgia, serif';

export function drawStretchedMincho(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  sizePx: number,
  color: string,
  scaleY = 1.38,
  align: CanvasTextAlign = 'center'
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, scaleY);
  ctx.font = `900 ${sizePx}px ${MINCHO_FONT_FAMILY}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
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

  public render(state: GameState): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.scaleX, 0, 0, this.scaleY, 0, 0);

    const isCalibrationPhase = state.phase === 'TITLE' || state.phase === 'RESULT';

    // Base background
    ctx.fillStyle = isCalibrationPhase ? '#121224' : '#06060b';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // 1. Top Tactical HUD (0..HUD_HEIGHT)
    this.renderHud(ctx, state);

    // 2. Playfield (y: HUD_HEIGHT..LOGICAL_HEIGHT)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HUD_HEIGHT, LOGICAL_WIDTH, LOGICAL_HEIGHT - HUD_HEIGHT);
    ctx.clip();

    if (state.screenShakeMs > 0) {
      const intensity = Math.min(6, (state.screenShakeMs / 400) * 6);
      const ox = (Math.random() - 0.5) * intensity * 2;
      const oy = (Math.random() - 0.5) * intensity * 2;
      ctx.translate(ox, oy);
    }

    // Tactical grid
    ctx.strokeStyle = isCalibrationPhase
      ? 'rgba(255, 153, 0, 0.16)'
      : 'rgba(255, 153, 0, 0.08)';
    ctx.lineWidth = 0.75;
    for (let x = 0; x <= LOGICAL_WIDTH; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, HUD_HEIGHT);
      ctx.lineTo(x, LOGICAL_HEIGHT);
      ctx.stroke();
    }
    for (let y = HUD_HEIGHT; y <= LOGICAL_HEIGHT; y += 36) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(LOGICAL_WIDTH, y);
      ctx.stroke();
    }

    // Calibration guide crosshair on Title/Result
    if (isCalibrationPhase) {
      const cx = LOGICAL_WIDTH / 2;
      const cy = HUD_HEIGHT + (LOGICAL_HEIGHT - HUD_HEIGHT) * 0.6;
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 255, 238, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(cx - 48, cy);
      ctx.lineTo(cx + 48, cy);
      ctx.moveTo(cx, cy - 48);
      ctx.lineTo(cx, cy + 48);
      ctx.stroke();
      ctx.restore();
    }

    // Background Evangelion Mincho Cut-In
    if (state.cutIn) {
      const alpha = Math.min(1, state.cutIn.remainingMs / 180) * 0.28;
      drawStretchedMincho(
        ctx,
        state.cutIn.topText,
        LOGICAL_WIDTH / 2,
        HUD_HEIGHT + 145,
        54,
        `rgba(255, 153, 0, ${alpha})`,
        1.45
      );
      drawStretchedMincho(
        ctx,
        state.cutIn.bottomText,
        LOGICAL_WIDTH / 2,
        LOGICAL_HEIGHT - 125,
        36,
        `rgba(255, 255, 255, ${alpha * 0.85})`,
        1.38
      );
    }

    // Direct Hit Crimson Flash
    if (state.hitFlashMs > 0) {
      const flashAlpha = Math.min(0.45, state.hitFlashMs / 360);
      ctx.fillStyle = `rgba(220, 0, 20, ${flashAlpha})`;
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

    // Sparks
    for (const s of state.sparks) {
      const alpha = Math.max(0, s.remainingMs / s.totalMs);
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.035, s.y - s.vy * 0.035);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Score Popups
    for (const p of state.popups) {
      drawStretchedMincho(
        ctx,
        p.text,
        p.x,
        p.y,
        p.isCritical ? 14 : 11,
        p.color,
        1.3
      );
    }

    // Player Craft (drawn even on Title/Result for live sensitivity testing)
    this.renderPlayer(ctx, state);

    ctx.restore();

    // Playfield frame border
    ctx.strokeStyle = '#ff9900';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(0.6, HUD_HEIGHT + 0.6, LOGICAL_WIDTH - 1.2, LOGICAL_HEIGHT - HUD_HEIGHT - 1.2);

    ctx.restore();
  }

  private renderHud(ctx: CanvasRenderingContext2D, state: GameState): void {
    ctx.fillStyle = '#110b07';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, HUD_HEIGHT);
    ctx.strokeStyle = '#ff9900';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(0.6, 0.6, LOGICAL_WIDTH - 1.2, HUD_HEIGHT - 1.2);

    // Score & Survival Time
    ctx.fillStyle = '#ff9900';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE', 10, 14);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 17px monospace';
    ctx.fillText(state.score.toLocaleString('en-US').padStart(9, '0'), 10, 33);
    ctx.fillStyle = '#00ffee';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(`TIME ${formatSurvivalTime(state.survivalTimeMs)}`, 10, 48);

    // Center Combo Box
    const boxX = 140;
    const boxW = 96;
    ctx.fillStyle = '#070504';
    ctx.fillRect(boxX, 6, boxW, 44);
    ctx.strokeStyle = state.comboGauge > 0 ? '#ffcc00' : '#663300';
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX, 6, boxW, 44);

    drawStretchedMincho(
      ctx,
      `×${state.comboMultiplier.toFixed(1)}`,
      boxX + boxW / 2,
      23,
      16,
      state.comboMultiplier > 1 ? '#ffcc00' : '#777777',
      1.28
    );

    ctx.fillStyle = '#2a1808';
    ctx.fillRect(boxX + 8, 40, boxW - 16, 5);
    ctx.fillStyle = '#00ffee';
    ctx.fillRect(boxX + 8, 40, (boxW - 16) * Math.max(0, Math.min(1, state.comboGauge)), 5);

    // Right Lives
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ff9900';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('LIFE', LOGICAL_WIDTH - 10, 14);
    for (let i = 0; i < INITIAL_LIVES; i++) {
      const active = i < state.lives;
      ctx.fillStyle = active ? '#ff2200' : '#2a1111';
      ctx.strokeStyle = active ? '#ffcc00' : '#442222';
      const lx = LOGICAL_WIDTH - 10 - (i + 1) * 14;
      ctx.fillRect(lx, 21, 10, 20);
      ctx.strokeRect(lx, 21, 10, 20);
    }
  }

  private renderBomb(ctx: CanvasRenderingContext2D, bomb: BombHazard): void {
    if (bomb.elapsedMs < 0) return;
    const info = getBombPhase(bomb);
    if (info.phase === 'CONVERGING') {
      // Single fast convergence from outer ring to actual blast radius (true size unknown until HOLD)
      ctx.fillStyle = 'rgba(255, 60, 0, 0.06)';
      ctx.strokeStyle = 'rgba(255, 190, 0, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(bomb.x, bomb.y, info.currentRingRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (info.phase === 'HOLD') {
      const blink = Math.floor(bomb.elapsedMs / 55) % 2 === 0;
      ctx.fillStyle = blink ? 'rgba(255, 40, 0, 0.24)' : 'rgba(255, 40, 0, 0.12)';
      ctx.strokeStyle = blink ? '#ffcc00' : '#ff2200';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(bomb.x, bomb.y, bomb.blastRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (info.phase === 'ACTIVE') {
      // Graze perimeter hint
      ctx.strokeStyle = 'rgba(0, 255, 238, 0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(bomb.x, bomb.y, bomb.blastRadius + GRAZE_RADIUS, 0, Math.PI * 2);
      ctx.stroke();

      // Active blast core
      ctx.fillStyle = 'rgba(255, 80, 0, 0.72)';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(bomb.x, bomb.y, bomb.blastRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  private renderLaser(ctx: CanvasRenderingContext2D, laser: LaserHazard): void {
    const phase = getLaserPhase(laser);
    if (phase === 'WARNING') {
      // High-speed sightline draw-in over the first 120ms
      const drawProgress = Math.min(1, laser.elapsedMs / 120);
      const ex = laser.x1 + (laser.x2 - laser.x1) * drawProgress;
      const ey = laser.y1 + (laser.y2 - laser.y1) * drawProgress;
      const imminence = laser.elapsedMs / laser.warningDurationMs;

      ctx.save();
      ctx.strokeStyle = imminence > 0.8 ? '#ffcc00' : '#ff0044';
      ctx.lineWidth = imminence > 0.8 ? 2.0 : 1.2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(laser.x1, laser.y1);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.restore();
    } else if (phase === 'ACTIVE') {
      // Outer glow
      ctx.strokeStyle = 'rgba(255, 0, 85, 0.38)';
      ctx.lineWidth = laser.halfWidth * 3.4;
      ctx.beginPath();
      ctx.moveTo(laser.x1, laser.y1);
      ctx.lineTo(laser.x2, laser.y2);
      ctx.stroke();

      // Mid beam
      ctx.strokeStyle = 'rgba(255, 130, 0, 0.85)';
      ctx.lineWidth = laser.halfWidth * 2;
      ctx.beginPath();
      ctx.moveTo(laser.x1, laser.y1);
      ctx.lineTo(laser.x2, laser.y2);
      ctx.stroke();

      // Razor-sharp white core
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(2, laser.halfWidth * 0.7);
      ctx.beginPath();
      ctx.moveTo(laser.x1, laser.y1);
      ctx.lineTo(laser.x2, laser.y2);
      ctx.stroke();
    }
  }

  private renderBullet(ctx: CanvasRenderingContext2D, bullet: BulletHazard): void {
    ctx.fillStyle = '#ff5500';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius + 1.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffcc';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  private renderPlayer(ctx: CanvasRenderingContext2D, state: GameState): void {
    const { x, y, invulnerableMs, trail } = state.player;

    // Motion trail
    if (trail.length > 1) {
      ctx.strokeStyle = 'rgba(0, 255, 238, 0.32)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      for (let i = 1; i < trail.length; i++) {
        ctx.lineTo(trail[i].x, trail[i].y);
      }
      ctx.stroke();
    }

    if (invulnerableMs > 0 && Math.floor(invulnerableMs / 60) % 2 === 1) {
      return;
    }

    // Graze Ring (GRAZE_RADIUS = 24)
    ctx.strokeStyle = state.comboGauge > 0.8 ? '#00ffee' : 'rgba(0, 255, 220, 0.45)';
    ctx.lineWidth = state.comboGauge > 0.8 ? 1.8 : 1.0;
    ctx.beginPath();
    ctx.arc(x, y, GRAZE_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    // Fighter hull
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y - 10);
    ctx.lineTo(x + 7, y + 7);
    ctx.lineTo(x, y + 3.5);
    ctx.lineTo(x - 7, y + 7);
    ctx.closePath();
    ctx.stroke();

    // Exact Core Hitbox (CORE_RADIUS = 3.0)
    ctx.fillStyle = '#00ffee';
    ctx.beginPath();
    ctx.arc(x, y, CORE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
}
