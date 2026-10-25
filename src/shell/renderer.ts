import { getBombPhase, getLaserPhase } from '../core/hazards';
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
  align: CanvasTextAlign = 'center',
  outlineWidth = 0,
  outlineColor = '#000000'
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, scaleY);
  ctx.font = `900 ${sizePx}px ${MINCHO_FONT_FAMILY}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (outlineWidth > 0) {
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = outlineWidth;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, 0, 0);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

export function drawPersonaRansomBanner(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  centerY: number,
  sizePx: number,
  accentColor: string,
  alpha = 1
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(centerX, centerY);
  ctx.rotate(-0.14);

  // Diagonal jagged slash ribbon behind the characters
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.moveTo(-220, -sizePx * 0.78);
  ctx.lineTo(220, -sizePx * 0.92);
  ctx.lineTo(205, sizePx * 0.85);
  ctx.lineTo(-210, sizePx * 0.72);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  const chars = Array.from(text);
  const stepX = sizePx * 1.04;
  const startX = -((chars.length - 1) * stepX) / 2;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    ctx.save();
    const ox = startX + i * stepX;
    const oy = (i % 2 === 0 ? -1 : 1) * 2.5;
    ctx.translate(ox, oy);
    ctx.rotate((i % 2 === 0 ? -1 : 1) * 0.085);

    const boxW = sizePx * 1.06;
    const boxH = sizePx * 1.28;
    const isEven = i % 2 === 0;
    ctx.fillStyle = isEven ? '#000000' : '#ffffff';
    ctx.strokeStyle = isEven ? '#ffffff' : '#000000';
    ctx.lineWidth = 2;
    ctx.fillRect(-boxW / 2, -boxH / 2, boxW, boxH);
    ctx.strokeRect(-boxW / 2, -boxH / 2, boxW, boxH);

    ctx.scale(1, 1.32);
    ctx.fillStyle = isEven ? '#ffffff' : '#000000';
    ctx.font = `900 ${sizePx * 0.82}px ${MINCHO_FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, 0, 1);
    ctx.restore();
  }
  ctx.restore();
}

export function drawStarSpark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  rotation: number,
  alpha = 1
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? radius : radius * 0.28;
    const a = (i * Math.PI) / 4;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function renderPlayerShipAndRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  lives: number,
  comboMultiplier: number,
  comboGauge: number,
  survivalTimeMs: number
): void {
  // 1. Graze Ring Track (GRAZE_RADIUS = 24)
  const isGrazingHot = comboGauge > 0.82;
  ctx.strokeStyle = isGrazingHot ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.arc(x, y, GRAZE_RADIUS, 0, Math.PI * 2);
  ctx.stroke();

  // 2. Dynamic Combo Gauge Arc directly on the Graze Ring
  if (comboGauge > 0) {
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + Math.PI * 2 * Math.max(0, Math.min(1, comboGauge));
    ctx.strokeStyle = comboMultiplier >= 20 ? '#ffe600' : '#00ffee';
    ctx.lineWidth = isGrazingHot ? 4.8 : 3.8;
    ctx.beginPath();
    ctx.arc(x, y, GRAZE_RADIUS, startAngle, endAngle);
    ctx.stroke();
  }

  // 3. Persona-Style Skewed Combo Multiplier Badge attached to Player's Graze Ring
  if (comboMultiplier > 1.0 || comboGauge > 0) {
    const badgeRight = x < LOGICAL_WIDTH - 68 ? 1 : -1;
    const bx = x + badgeRight * 30;
    const by = y - 24;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(-0.11);

    ctx.fillStyle = '#000000';
    ctx.strokeStyle = comboMultiplier >= 20 ? '#ffe600' : '#e60012';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-22, -9);
    ctx.lineTo(26, -12);
    ctx.lineTo(22, 9);
    ctx.lineTo(-25, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    drawStretchedMincho(
      ctx,
      `×${comboMultiplier.toFixed(1)}`,
      0,
      -1,
      12,
      comboMultiplier >= 20 ? '#ffe600' : '#ffffff',
      1.3,
      'center',
      2.2,
      '#000000'
    );
    ctx.restore();
  }

  // 4. Player Craft Silhouette Morphing by Remaining Lives (3 -> 2 -> 1)
  ctx.save();
  ctx.translate(x, y);

  if (lives >= 3) {
    // 3 Lives: Full Seraphim Quad-Wing + 2 Orbiting Phantom Shield Bits
    for (let b = 0; b < 2; b++) {
      const bitAngle = survivalTimeMs * 0.008 + b * Math.PI;
      const ox = Math.cos(bitAngle) * 16;
      const oy = Math.sin(bitAngle) * 16;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.rotate(bitAngle + Math.PI / 4);
      ctx.fillStyle = '#ffe600';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.2;
      ctx.fillRect(-3, -3, 6, 6);
      ctx.strokeRect(-3, -3, 6, 6);
      ctx.restore();
    }

    // Quad Heavy Wings (Crimson + White Edge)
    ctx.fillStyle = '#e60012';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(13, 5);
    ctx.lineTo(9, 11);
    ctx.lineTo(4, 4);
    ctx.lineTo(0, 8);
    ctx.lineTo(-4, 4);
    ctx.lineTo(-9, 11);
    ctx.lineTo(-13, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (lives === 2) {
    // 2 Lives: Outer wings shattered — Sleek Dual-Blade Interceptor
    ctx.fillStyle = '#00e5ff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(9, 8);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-9, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    // 1 Life: All wings lost — Naked Unstable Core with Crimson Crackling Sparks
    const dangerPulse = Math.floor(survivalTimeMs / 60) % 2 === 0;
    ctx.fillStyle = dangerPulse ? '#ff0033' : '#000000';
    ctx.strokeStyle = dangerPulse ? '#ffe600' : '#ff0033';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(0, -7.5);
    ctx.lineTo(6.5, 0);
    ctx.lineTo(0, 7.5);
    ctx.lineTo(-6.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Crackling lightning arcs around the naked core
    ctx.strokeStyle = '#ff0033';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      const a = survivalTimeMs * 0.02 + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 5, Math.sin(a) * 5);
      ctx.lineTo(Math.cos(a + 0.3) * 12, Math.sin(a + 0.3) * 12);
      ctx.stroke();
    }
  }

  // Exact Hitbox Core (CORE_RADIUS = 3.0)
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, CORE_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

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
    const isFever = state.comboMultiplier >= 25 && state.comboGauge > 0.3;

    // Base background (Persona deep crimson-black or Fever high-voltage crimson)
    ctx.fillStyle = isCalibrationPhase
      ? '#10070c'
      : isFever
        ? '#1c0208'
        : '#070204';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // Playfield (full height with slanted Persona HUD floating on top)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HUD_HEIGHT, LOGICAL_WIDTH, LOGICAL_HEIGHT - HUD_HEIGHT);
    ctx.clip();

    if (state.screenShakeMs > 0) {
      const intensity = Math.min(9, (state.screenShakeMs / 350) * 7.5);
      const ox = (Math.random() - 0.5) * intensity * 2;
      const oy = (Math.random() - 0.5) * intensity * 2;
      ctx.translate(ox, oy);
    }

    // Persona Halftone Diagonal Polka-Dot Matrix
    const dotColor = isFever
      ? 'rgba(255, 230, 0, 0.16)'
      : 'rgba(230, 0, 18, 0.14)';
    ctx.fillStyle = dotColor;
    const timeTick = state.survivalTimeMs * 0.004;
    for (let gx = 14; gx < LOGICAL_WIDTH; gx += 28) {
      for (let gy = HUD_HEIGHT + 14; gy < LOGICAL_HEIGHT; gy += 28) {
        const wave = 1.3 + Math.sin(gx * 0.03 + gy * 0.03 + timeTick) * 1.1;
        if (wave > 0.4) {
          ctx.beginPath();
          ctx.arc(gx, gy, wave, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Adrenaline Speed Lines (concentrating toward the player during active combo / grazing)
    if (state.phase === 'PLAYING' && (state.comboGauge > 0.4 || state.lives === 1)) {
      const lineAlpha = state.comboGauge > 0.8 ? 0.32 : 0.15;
      ctx.strokeStyle =
        state.lives === 1
          ? `rgba(255, 0, 50, ${lineAlpha + 0.15})`
          : `rgba(255, 230, 0, ${lineAlpha})`;
      ctx.lineWidth = state.comboGauge > 0.8 ? 2.2 : 1.2;
      const lineCount = state.comboGauge > 0.8 ? 22 : 12;
      for (let i = 0; i < lineCount; i++) {
        const ang = (i / lineCount) * Math.PI * 2 + ((state.survivalTimeMs * 0.01) % 0.5);
        const innerR = 78 + ((i * 19) % 35);
        ctx.beginPath();
        ctx.moveTo(
          state.player.x + Math.cos(ang) * innerR,
          state.player.y + Math.sin(ang) * innerR
        );
        ctx.lineTo(
          state.player.x + Math.cos(ang) * 420,
          state.player.y + Math.sin(ang) * 420
        );
        ctx.stroke();
      }
    }

    // Persistent Last-Life Danger Slashes & Warning Pulse when lives === 1
    if (state.phase === 'PLAYING' && state.lives === 1) {
      const pulse = 0.5 + 0.5 * Math.sin(state.survivalTimeMs * 0.014);
      ctx.strokeStyle = `rgba(230, 0, 18, ${0.45 + pulse * 0.5})`;
      ctx.lineWidth = 6;
      ctx.strokeRect(3, HUD_HEIGHT + 3, LOGICAL_WIDTH - 6, LOGICAL_HEIGHT - HUD_HEIGHT - 6);

      drawStretchedMincho(
        ctx,
        '警告・残機壱 // FINAL STAND',
        LOGICAL_WIDTH / 2,
        HUD_HEIGHT + 24,
        14,
        `rgba(255, 230, 0, ${0.65 + pulse * 0.35})`,
        1.32,
        'center',
        3.2,
        '#000000'
      );
    }

    // Calibration guide crosshair on Title/Result
    if (isCalibrationPhase) {
      const cx = LOGICAL_WIDTH / 2;
      const cy = HUD_HEIGHT + (LOGICAL_HEIGHT - HUD_HEIGHT) * 0.6;
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 230, 0, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(cx - 52, cy);
      ctx.lineTo(cx + 52, cy);
      ctx.moveTo(cx, cy - 52);
      ctx.lineTo(cx, cy + 52);
      ctx.stroke();
      ctx.restore();
    }

    // Persona All-Out Cut-In Slash Banner in Background
    if (state.cutIn) {
      const alpha = Math.min(1, state.cutIn.remainingMs / 160) * 0.52;
      drawPersonaRansomBanner(
        ctx,
        state.cutIn.topText,
        LOGICAL_WIDTH / 2,
        HUD_HEIGHT + 150,
        28,
        state.cutIn.color,
        alpha
      );
      drawStretchedMincho(
        ctx,
        state.cutIn.bottomText,
        LOGICAL_WIDTH / 2,
        LOGICAL_HEIGHT - 115,
        32,
        `rgba(255, 255, 255, ${alpha * 0.9})`,
        1.38,
        'center',
        4,
        '#000000'
      );
    }

    // Direct Hit Crimson/White Impact Flash
    if (state.hitFlashMs > 0) {
      const flashAlpha = Math.min(0.55, state.hitFlashMs / 360);
      ctx.fillStyle =
        Math.floor(state.hitFlashMs / 40) % 2 === 0
          ? `rgba(230, 0, 18, ${flashAlpha})`
          : `rgba(255, 255, 255, ${flashAlpha * 0.7})`;
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

    // Comic Star Sparks & Velocity Streaks
    for (let i = 0; i < state.sparks.length; i++) {
      const s = state.sparks[i];
      const alpha = Math.max(0, s.remainingMs / s.totalMs);
      if (i % 3 === 0) {
        drawStarSpark(
          ctx,
          s.x,
          s.y,
          6.5 * alpha + 2,
          s.color === '#ffcc00' ? '#ffe600' : '#ffffff',
          s.remainingMs * 0.03 + i,
          alpha
        );
      } else {
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 0.045, s.y - s.vy * 0.045);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // Score Popups (with bold black outline + Persona tilt)
    for (const p of state.popups) {
      drawStretchedMincho(
        ctx,
        p.text,
        p.x,
        p.y,
        p.isCritical ? 16 : 12.5,
        p.isCritical ? '#ffe600' : '#00ffee',
        1.35,
        'center',
        4.2,
        '#000000'
      );
    }

    // Player Craft or Destruction Shockwaves
    if (state.phase === 'GAME_OVER') {
      this.renderPlayerExplosion(ctx, state);
    } else {
      this.renderPlayer(ctx, state);
    }

    ctx.restore();

    // Top Persona Skewed Polygon HUD
    this.renderHud(ctx, state);

    // Playfield Jagged Outer Border
    ctx.strokeStyle = state.lives === 1 && state.phase === 'PLAYING' ? '#ffe600' : '#e60012';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, HUD_HEIGHT + 1, LOGICAL_WIDTH - 2, LOGICAL_HEIGHT - HUD_HEIGHT - 2);

    ctx.restore();
  }

  private renderHud(ctx: CanvasRenderingContext2D, state: GameState): void {
    // Persona-style skewed black & crimson slash header
    ctx.fillStyle = '#050203';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, HUD_HEIGHT);

    // Red diagonal accent shard
    ctx.fillStyle = '#e60012';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(255, 0);
    ctx.lineTo(232, HUD_HEIGHT);
    ctx.lineTo(0, HUD_HEIGHT);
    ctx.closePath();
    ctx.fill();

    // Inner black shard
    ctx.fillStyle = '#080305';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(246, 0);
    ctx.lineTo(225, HUD_HEIGHT - 4);
    ctx.lineTo(0, HUD_HEIGHT - 4);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, HUD_HEIGHT - 2);
    ctx.lineTo(226, HUD_HEIGHT - 2);
    ctx.lineTo(247, 0);
    ctx.stroke();

    // Score & Time inside the skewed shard
    ctx.fillStyle = '#ffe600';
    ctx.font = '900 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE // TIME ${formatSurvivalTime(state.survivalTimeMs)}`, 10, 15);

    drawStretchedMincho(
      ctx,
      state.score.toLocaleString('en-US').padStart(9, '0'),
      10,
      36,
      20,
      '#ffffff',
      1.28,
      'left',
      3,
      '#e60012'
    );
  }

  private renderBomb(ctx: CanvasRenderingContext2D, bomb: BombHazard): void {
    if (bomb.elapsedMs < 0) return;
    const info = getBombPhase(bomb);
    if (info.phase === 'CONVERGING') {
      ctx.fillStyle = 'rgba(230, 0, 18, 0.08)';
      ctx.strokeStyle = '#ffe600';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(bomb.x, bomb.y, info.currentRingRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (info.phase === 'HOLD') {
      const blink = Math.floor(bomb.elapsedMs / 50) % 2 === 0;
      ctx.fillStyle = blink ? 'rgba(230, 0, 18, 0.28)' : 'rgba(255, 230, 0, 0.14)';
      ctx.strokeStyle = blink ? '#ffe600' : '#ffffff';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(bomb.x, bomb.y, bomb.blastRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (info.phase === 'ACTIVE') {
      ctx.fillStyle = 'rgba(230, 0, 18, 0.82)';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.0;
      ctx.beginPath();
      ctx.arc(bomb.x, bomb.y, bomb.blastRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  private renderLaser(ctx: CanvasRenderingContext2D, laser: LaserHazard): void {
    if (laser.elapsedMs < 0) return;
    const phase = getLaserPhase(laser);
    if (phase === 'WARNING') {
      const drawProgress = Math.min(1, laser.elapsedMs / 120);
      const ex = laser.x1 + (laser.x2 - laser.x1) * drawProgress;
      const ey = laser.y1 + (laser.y2 - laser.y1) * drawProgress;
      const imminence = laser.elapsedMs / laser.warningDurationMs;

      ctx.save();
      ctx.strokeStyle = imminence > 0.8 ? '#ffe600' : '#ff0044';
      ctx.lineWidth = imminence > 0.8 ? 2.2 : 1.3;
      ctx.setLineDash([7, 4]);
      ctx.beginPath();
      ctx.moveTo(laser.x1, laser.y1);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.restore();
    } else if (phase === 'ACTIVE') {
      ctx.strokeStyle = 'rgba(230, 0, 18, 0.48)';
      ctx.lineWidth = laser.halfWidth * 3.6;
      ctx.beginPath();
      ctx.moveTo(laser.x1, laser.y1);
      ctx.lineTo(laser.x2, laser.y2);
      ctx.stroke();

      ctx.strokeStyle = '#ffe600';
      ctx.lineWidth = laser.halfWidth * 2;
      ctx.beginPath();
      ctx.moveTo(laser.x1, laser.y1);
      ctx.lineTo(laser.x2, laser.y2);
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(2.2, laser.halfWidth * 0.75);
      ctx.beginPath();
      ctx.moveTo(laser.x1, laser.y1);
      ctx.lineTo(laser.x2, laser.y2);
      ctx.stroke();
    }
  }

  private renderBullet(ctx: CanvasRenderingContext2D, bullet: BulletHazard): void {
    ctx.fillStyle = '#e60012';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius + 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffe600';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  private renderPlayerExplosion(ctx: CanvasRenderingContext2D, state: GameState): void {
    const { x, y } = state.player;
    const progress =
      1 - Math.max(0, Math.min(1, state.gameOverTimerMs / GAME_OVER_EXPLOSION_MS));

    const r1 = 8 + progress * 155;
    const alpha1 = Math.max(0, 1 - progress);
    ctx.strokeStyle = `rgba(255, 230, 0, ${alpha1})`;
    ctx.lineWidth = 4.0;
    ctx.beginPath();
    ctx.arc(x, y, r1, 0, Math.PI * 2);
    ctx.stroke();

    if (progress > 0.15) {
      const p2 = (progress - 0.15) / 0.85;
      const r2 = 6 + p2 * 105;
      ctx.strokeStyle = `rgba(230, 0, 18, ${Math.max(0, 1 - p2)})`;
      ctx.lineWidth = 3.0;
      ctx.beginPath();
      ctx.arc(x, y, r2, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (progress < 0.45) {
      ctx.fillStyle = `rgba(255, 255, 255, ${1 - progress / 0.45})`;
      ctx.beginPath();
      ctx.arc(x, y, 22 * (1 - progress), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private renderPlayer(ctx: CanvasRenderingContext2D, state: GameState): void {
    const { x, y, invulnerableMs, trail } = state.player;

    if (trail.length > 1) {
      ctx.strokeStyle = 'rgba(230, 0, 18, 0.55)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      for (let i = 1; i < trail.length; i++) {
        ctx.lineTo(trail[i].x, trail[i].y);
      }
      ctx.stroke();
    }

    if (invulnerableMs > 0 && Math.floor(invulnerableMs / 55) % 2 === 1) {
      return;
    }

    renderPlayerShipAndRing(
      ctx,
      x,
      y,
      state.lives,
      state.comboMultiplier,
      state.comboGauge,
      state.survivalTimeMs
    );
  }
}
