import { getBombPhase } from '../core/hazards';
import { formatStartLevel } from '../core/tips';
import {
  HUD_HEIGHT,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  type BombHazard,
  type BulletHazard,
  type GameState,
  type PeakMomentSnapshot,
  type RankingRecord,
} from '../core/types';
import {
  drawCrossGrid,
  MONO_FONT,
  PALETTE,
  renderBulletHazard,
  renderLaserHazard,
  renderPlayerShipAndRing,
} from './renderer';
import { formatSurvivalTime } from './storage';

export const PUBLIC_GAME_URL = 'https://handlename.github.io/graze-survivor/';

const CARD_FRAME = { x: 10, y: 10, w: 580, h: 380 } as const;
const PEAK_SCALE = 1.35;
const PEAK_AREA_LEFT = 210;
const PEAK_GRAD_END = 365;
const PEAK_CENTER_X = 455;
const PEAK_CENTER_Y = 200;
const PLAYER_MIN_CARD_X = 338;
const PLAYER_MAX_CARD_X = 579;
const PLAYER_MIN_CARD_Y = 21;
const PLAYER_MAX_CARD_Y = 379;

export function computeClampedPeakCamera(playerX: number, playerY: number): {
  readonly camX: number;
  readonly camY: number;
} {
  const innerTop = CARD_FRAME.y + 1;
  const innerBottom = CARD_FRAME.y + CARD_FRAME.h - 1;
  const innerRight = CARD_FRAME.x + CARD_FRAME.w - 1;

  // Priority 2 bounds: playfield [0..LOGICAL_WIDTH] x [HUD_HEIGHT..LOGICAL_HEIGHT] covers the peak display area
  const p2MinCamX = (PEAK_CENTER_X - PEAK_AREA_LEFT) / PEAK_SCALE;
  const p2MaxCamX = LOGICAL_WIDTH - (innerRight - PEAK_CENTER_X) / PEAK_SCALE;
  const p2MinCamY = HUD_HEIGHT + (PEAK_CENTER_Y - innerTop) / PEAK_SCALE;
  const p2MaxCamY = LOGICAL_HEIGHT - (innerBottom - PEAK_CENTER_Y) / PEAK_SCALE;

  // Priority 1 bounds: player ship must stay inside the right half of the result card
  const p1MinCamX = playerX - (PLAYER_MAX_CARD_X - PEAK_CENTER_X) / PEAK_SCALE;
  const p1MaxCamX = playerX + (PEAK_CENTER_X - PLAYER_MIN_CARD_X) / PEAK_SCALE;
  const p1MinCamY = playerY - (PLAYER_MAX_CARD_Y - PEAK_CENTER_Y) / PEAK_SCALE;
  const p1MaxCamY = playerY + (PEAK_CENTER_Y - PLAYER_MIN_CARD_Y) / PEAK_SCALE;

  // Apply in priority order: start from Priority 3 (player at center), clamp to Priority 2, then enforce Priority 1
  const p2CamX = Math.max(p2MinCamX, Math.min(p2MaxCamX, playerX));
  const p2CamY = Math.max(p2MinCamY, Math.min(p2MaxCamY, playerY));

  return {
    camX: Math.max(p1MinCamX, Math.min(p1MaxCamX, p2CamX)),
    camY: Math.max(p1MinCamY, Math.min(p1MaxCamY, p2CamY)),
  };
}

function renderPeakSnapshotCrop(
  ctx: CanvasRenderingContext2D,
  snapshot: PeakMomentSnapshot | null,
  fallbackState: GameState
): void {
  const innerTop = CARD_FRAME.y + 1;
  const innerRight = CARD_FRAME.x + CARD_FRAME.w - 1;
  const innerH = CARD_FRAME.h - 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(PEAK_AREA_LEFT, innerTop, innerRight - PEAK_AREA_LEFT, innerH);
  ctx.clip();

  const player = snapshot ? snapshot.player : fallbackState.player;
  const hazards = snapshot ? snapshot.hazards : fallbackState.hazards;
  const sparks = snapshot ? snapshot.sparks : fallbackState.sparks;
  const popups = snapshot ? snapshot.popups : fallbackState.popups;
  const combo = snapshot ? snapshot.comboMultiplier : fallbackState.maxCombo;
  const animTimeMs = snapshot ? snapshot.timeMs : fallbackState.survivalTimeMs;
  const { camX, camY } = computeClampedPeakCamera(player.x, player.y);

  ctx.save();
  ctx.translate(PEAK_CENTER_X, PEAK_CENTER_Y);
  ctx.scale(PEAK_SCALE, PEAK_SCALE);
  ctx.translate(-camX, -camY);

  // Intersect playfield bounds with the card inner frame in playfield coordinates so WebKit GPU Canvas never overflows innerRight (589)
  const innerBottom = CARD_FRAME.y + CARD_FRAME.h - 1;
  const clipLeft = Math.max(0, camX + (PEAK_AREA_LEFT - PEAK_CENTER_X) / PEAK_SCALE);
  const clipTop = Math.max(HUD_HEIGHT, camY + (innerTop - PEAK_CENTER_Y) / PEAK_SCALE);
  const clipRight = Math.min(LOGICAL_WIDTH, camX + (innerRight - PEAK_CENTER_X) / PEAK_SCALE);
  const clipBottom = Math.min(LOGICAL_HEIGHT, camY + (innerBottom - PEAK_CENTER_Y) / PEAK_SCALE);

  ctx.beginPath();
  ctx.rect(clipLeft, clipTop, Math.max(0, clipRight - clipLeft), Math.max(0, clipBottom - clipTop));
  ctx.clip();

  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, HUD_HEIGHT, LOGICAL_WIDTH, LOGICAL_HEIGHT - HUD_HEIGHT);

  drawCrossGrid(ctx, LOGICAL_WIDTH, LOGICAL_HEIGHT, HUD_HEIGHT);

  for (const h of hazards) {
    if (h.kind === 'BOMB') {
      const b = h as BombHazard;
      if (b.elapsedMs < 0) continue;
      const info = getBombPhase(b);
      if (info.phase === 'CONVERGING') {
        ctx.fillStyle = PALETTE.dangerSoft;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.blastRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = PALETTE.danger;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.blastRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = PALETTE.danger;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(b.x, b.y, info.currentRingRadius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (info.phase === 'HOLD') {
        ctx.fillStyle = PALETTE.dangerSoft;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.blastRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = PALETTE.danger;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.blastRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (info.phase === 'ACTIVE') {
        ctx.fillStyle = PALETTE.danger;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.blastRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.strokeStyle = PALETTE.fg;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.blastRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  for (const h of hazards) {
    if (h.kind === 'LASER') {
      renderLaserHazard(ctx, h);
    }
  }

  for (const h of hazards) {
    if (h.kind === 'BULLET') {
      renderBulletHazard(ctx, h as BulletHazard);
    }
  }

  for (const s of sparks) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.vx * 0.035, s.y - s.vy * 0.035);
    ctx.stroke();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of popups) {
    ctx.font = `700 ${p.isCritical ? 11 : 10}px ${MONO_FONT}`;
    ctx.fillStyle = p.isCritical ? PALETTE.danger : PALETTE.fg;
    ctx.fillText(p.text, p.x, p.y);
  }

  renderPlayerShipAndRing(ctx, player.x, player.y, 3, combo, 1.0, animTimeMs);

  ctx.restore();

  // Smooth paper gradient overlay on the left side of the snapshot to completely hide the playfield left edge and preserve left column readability
  const playfieldLeftCardX = PEAK_CENTER_X - camX * PEAK_SCALE;
  const gradEnd = Math.max(PEAK_GRAD_END, Math.ceil(playfieldLeftCardX) + 42);
  const solidCoverEndX = Math.max(PEAK_AREA_LEFT + 28, Math.ceil(playfieldLeftCardX) + 6);
  const solidStopOffset = Math.max(
    0.16,
    Math.min(0.78, (solidCoverEndX - PEAK_AREA_LEFT) / (gradEnd - PEAK_AREA_LEFT))
  );

  if (typeof ctx.createLinearGradient === 'function') {
    const grad = ctx.createLinearGradient(PEAK_AREA_LEFT, 0, gradEnd, 0);
    grad.addColorStop(0, 'rgba(244, 244, 240, 1.0)');
    grad.addColorStop(solidStopOffset, 'rgba(244, 244, 240, 1.0)');
    grad.addColorStop(solidStopOffset + (1 - solidStopOffset) * 0.5, 'rgba(244, 244, 240, 0.68)');
    grad.addColorStop(1, 'rgba(244, 244, 240, 0.0)');
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = 'rgba(244, 244, 240, 0.85)';
  }
  ctx.fillRect(PEAK_AREA_LEFT, innerTop, gradEnd - PEAK_AREA_LEFT, innerH);

  // Bottom-right peak caption badge inside card frame
  const badgeW = 196;
  const badgeH = 40;
  const bx = CARD_FRAME.x + CARD_FRAME.w - badgeW - 14;
  const by = CARD_FRAME.y + CARD_FRAME.h - badgeH - 12;
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(bx, by, badgeW, badgeH);
  ctx.strokeStyle = PALETTE.fg;
  ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, badgeW, badgeH);

  ctx.fillStyle = PALETTE.fg;
  ctx.font = `700 11px ${MONO_FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const peakRate = snapshot ? snapshot.windowScoreRatePerSec : 0;
  ctx.fillText(`PEAK +${peakRate.toLocaleString('en-US')} PTS/s`, bx + 8, by + 16);
  ctx.fillStyle = PALETTE.fgMuted;
  ctx.font = `600 10px ${MONO_FONT}`;
  const peakTime = snapshot ? formatSurvivalTime(snapshot.timeMs) : '00:00.000';
  ctx.fillText(`AT ${peakTime} (×${combo.toFixed(1)})`, bx + 8, by + 31);

  ctx.restore();
}

export function renderResultCardCanvas(
  state: GameState,
  record: RankingRecord,
  isNewRecord: boolean
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Flat Paper Background + Subtle Cross Grid
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, 600, 400);
  drawCrossGrid(ctx, 600, 400, 0);

  // Peak Moment Snapshot on the right with left-side paper gradient blend
  renderPeakSnapshotCrop(ctx, state.peakMoment, state);

  // Header Badge
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if (isNewRecord) {
    ctx.fillStyle = PALETTE.danger;
    ctx.fillRect(28, 28, 128, 24);
    ctx.fillStyle = PALETTE.bg;
    ctx.font = `700 12px ${MONO_FONT}`;
    ctx.fillText('NEW HIGH SCORE', 38, 44);
  } else {
    ctx.strokeStyle = PALETTE.fg;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(28, 28, 116, 24);
    ctx.fillStyle = PALETTE.fg;
    ctx.font = `700 12px ${MONO_FONT}`;
    ctx.fillText('RESULT REPORT', 38, 44);
  }

  // Final Score
  ctx.fillStyle = PALETTE.fgMuted;
  ctx.font = `600 12px ${MONO_FONT}`;
  ctx.fillText('FINAL SCORE', 28, 86);

  ctx.fillStyle = PALETTE.fg;
  ctx.font = `700 42px ${MONO_FONT}`;
  ctx.fillText(record.score.toLocaleString('en-US'), 28, 132);

  // Divider line
  ctx.strokeStyle = PALETTE.fgMuted;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(28, 152);
  ctx.lineTo(330, 152);
  ctx.stroke();

  // Survival Time & Max Combo
  ctx.fillStyle = PALETTE.fgMuted;
  ctx.font = `600 11px ${MONO_FONT}`;
  ctx.fillText('SURVIVAL TIME', 28, 182);
  ctx.fillStyle = PALETTE.fg;
  ctx.font = `700 22px ${MONO_FONT}`;
  ctx.fillText(formatSurvivalTime(record.survivalTimeMs), 28, 210);

  ctx.fillStyle = PALETTE.fgMuted;
  ctx.font = `600 11px ${MONO_FONT}`;
  ctx.fillText('MAX COMBO', 200, 182);
  ctx.fillStyle = PALETTE.danger;
  ctx.font = `700 22px ${MONO_FONT}`;
  ctx.fillText(`×${record.maxCombo.toFixed(1)}`, 200, 210);

  // Start Level, Graze Ticks & Timestamp
  const startLvLabel = formatStartLevel(record.startLevel ?? state.startLevel ?? 0);
  ctx.fillStyle = PALETTE.fg;
  ctx.font = `600 12px ${MONO_FONT}`;
  ctx.fillText(`START LEVEL: ${startLvLabel}`, 28, 246);
  ctx.fillText(`GRAZE TICKS: ${record.totalGrazeCount}`, 28, 268);

  ctx.fillStyle = PALETTE.fgMuted;
  ctx.font = `500 12px ${MONO_FONT}`;
  ctx.fillText(`DATE: ${record.timestamp}`, 28, 290);

  // Game Title Footer
  ctx.fillStyle = PALETTE.fg;
  ctx.font = `700 18px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText('GRAZE SURVIVOR', 28, 356);

  // Mask outer margins outside CARD_FRAME and draw Outer Frame last so nothing ever overflows it
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, 600, CARD_FRAME.y);
  ctx.fillRect(0, CARD_FRAME.y + CARD_FRAME.h, 600, 400 - (CARD_FRAME.y + CARD_FRAME.h));
  ctx.fillRect(0, 0, CARD_FRAME.x, 400);
  ctx.fillRect(CARD_FRAME.x + CARD_FRAME.w, 0, 600 - (CARD_FRAME.x + CARD_FRAME.w), 400);

  ctx.strokeStyle = PALETTE.fg;
  ctx.lineWidth = 2;
  ctx.strokeRect(CARD_FRAME.x, CARD_FRAME.y, CARD_FRAME.w, CARD_FRAME.h);

  return canvas;
}

export function buildShareMessage(record: RankingRecord, isNewRecord: boolean): string {
  const headline = isNewRecord
    ? 'MAXIMUM GRAZE! NEW HIGH SCORE!'
    : 'GRAZE SURVIVOR RESULT';
  const startLvLabel = formatStartLevel(record.startLevel ?? 0);
  return [
    headline,
    `SCORE: ${record.score.toLocaleString('en-US')} (MAX COMBO ×${record.maxCombo.toFixed(1)})`,
    `SURVIVAL TIME: ${formatSurvivalTime(record.survivalTimeMs)}`,
    `START LEVEL: LV.${startLvLabel}`,
    'GRAZE SURVIVOR #GRAZESURVIVOR',
    PUBLIC_GAME_URL,
  ].join('\n');
}

function dataUrlToFile(dataUrl: string, filename: string): File | null {
  try {
    const parts = dataUrl.split(',');
    if (parts.length < 2) return null;
    const byteString = atob(parts[1]);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      bytes[i] = byteString.charCodeAt(i);
    }
    return new File([bytes], filename, { type: 'image/png' });
  } catch {
    return null;
  }
}

export async function shareResultImage(
  canvas: HTMLCanvasElement,
  text: string
): Promise<'shared' | 'fallback'> {
  const dataUrl = canvas.toDataURL('image/png');
  const file = dataUrlToFile(dataUrl, 'graze-survivor-result.png');

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const shareData: ShareData =
      file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
        ? { text, files: [file] }
        : { text };
    try {
      await navigator.share(shareData);
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return 'shared';
      }
    }
  }

  if (typeof document !== 'undefined') {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'graze-survivor-result.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Ignore clipboard error
    }
  }

  if (typeof window !== 'undefined') {
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    const popup = window.open(tweetUrl, '_blank', 'noopener,noreferrer');
    if (!popup) {
      window.location.href = tweetUrl;
    }
  }
  return 'fallback';
}
