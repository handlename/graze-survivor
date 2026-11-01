import { getBombPhase } from '../core/hazards';
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
const PEAK_AREA_LEFT = 210;
const PEAK_GRAD_END = 375;
const PEAK_CENTER_X = 455;
const PEAK_CENTER_Y = 200;

function renderPeakSnapshotCrop(
  ctx: CanvasRenderingContext2D,
  snapshot: PeakMomentSnapshot | null,
  fallbackState: GameState
): void {
  const rightAreaW = CARD_FRAME.x + CARD_FRAME.w - PEAK_AREA_LEFT;

  ctx.save();
  ctx.beginPath();
  ctx.rect(PEAK_AREA_LEFT, CARD_FRAME.y, rightAreaW, CARD_FRAME.h);
  ctx.clip();

  const player = snapshot ? snapshot.player : fallbackState.player;
  const hazards = snapshot ? snapshot.hazards : fallbackState.hazards;
  const sparks = snapshot ? snapshot.sparks : fallbackState.sparks;
  const popups = snapshot ? snapshot.popups : fallbackState.popups;
  const combo = snapshot ? snapshot.comboMultiplier : fallbackState.maxCombo;
  const animTimeMs = snapshot ? snapshot.timeMs : fallbackState.survivalTimeMs;

  ctx.save();
  ctx.translate(PEAK_CENTER_X, PEAK_CENTER_Y);
  ctx.scale(1, 1);
  ctx.translate(-player.x, -player.y);

  // Clip strictly to the logical playfield so grid ticks and hazards never bleed outside playfield bounds
  ctx.beginPath();
  ctx.rect(0, HUD_HEIGHT, LOGICAL_WIDTH, LOGICAL_HEIGHT - HUD_HEIGHT);
  ctx.clip();

  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, HUD_HEIGHT, LOGICAL_WIDTH, LOGICAL_HEIGHT - HUD_HEIGHT);

  drawCrossGrid(ctx, LOGICAL_WIDTH, LOGICAL_HEIGHT, HUD_HEIGHT);

  ctx.strokeStyle = 'rgba(17, 17, 17, 0.22)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, HUD_HEIGHT + 0.5, LOGICAL_WIDTH - 1, LOGICAL_HEIGHT - HUD_HEIGHT - 1);

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

        ctx.save();
        ctx.strokeStyle = PALETTE.danger;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.blastRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

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

        ctx.save();
        ctx.strokeStyle = PALETTE.danger;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.blastRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
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

  // Smooth paper gradient overlay on the left side of the snapshot to preserve left column readability
  if (typeof ctx.createLinearGradient === 'function') {
    const grad = ctx.createLinearGradient(PEAK_AREA_LEFT, 0, PEAK_GRAD_END, 0);
    grad.addColorStop(0, 'rgba(244, 244, 240, 1.0)');
    grad.addColorStop(0.55, 'rgba(244, 244, 240, 0.82)');
    grad.addColorStop(1, 'rgba(244, 244, 240, 0.0)');
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = 'rgba(244, 244, 240, 0.82)';
  }
  ctx.fillRect(PEAK_AREA_LEFT, CARD_FRAME.y, PEAK_GRAD_END - PEAK_AREA_LEFT, CARD_FRAME.h);

  // Bottom-right peak caption badge inside card frame
  const badgeW = 196;
  const badgeH = 40;
  const bx = CARD_FRAME.x + CARD_FRAME.w - badgeW - 14;
  const by = CARD_FRAME.y + CARD_FRAME.h - badgeH - 12;
  ctx.fillStyle = 'rgba(244, 244, 240, 0.92)';
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

  // Graze Ticks & Timestamp
  ctx.fillStyle = PALETTE.fg;
  ctx.font = `600 12px ${MONO_FONT}`;
  ctx.fillText(`GRAZE TICKS: ${record.totalGrazeCount}`, 28, 252);

  ctx.fillStyle = PALETTE.fgMuted;
  ctx.font = `500 12px ${MONO_FONT}`;
  ctx.fillText(`DATE: ${record.timestamp}`, 28, 278);

  // Game Title Footer
  ctx.fillStyle = PALETTE.fg;
  ctx.font = `700 18px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText('GRAZE SURVIVOR', 28, 356);

  // Outer Frame drawn last so nothing ever overflows it
  ctx.strokeStyle = PALETTE.fg;
  ctx.lineWidth = 2;
  ctx.strokeRect(CARD_FRAME.x, CARD_FRAME.y, CARD_FRAME.w, CARD_FRAME.h);

  return canvas;
}

export function buildShareMessage(record: RankingRecord, isNewRecord: boolean): string {
  const headline = isNewRecord
    ? 'MAXIMUM GRAZE! NEW HIGH SCORE!'
    : 'GRAZE SURVIVOR RESULT';
  return [
    headline,
    `SCORE: ${record.score.toLocaleString('en-US')} (MAX COMBO ×${record.maxCombo.toFixed(1)})`,
    `SURVIVAL TIME: ${formatSurvivalTime(record.survivalTimeMs)}`,
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
