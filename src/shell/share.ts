import { getBombPhase, getLaserPhase } from '../core/hazards';
import {
  HUD_HEIGHT,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  type BombHazard,
  type BulletHazard,
  type GameState,
  type LaserHazard,
  type PeakMomentSnapshot,
  type RankingRecord,
} from '../core/types';
import {
  drawPersonaRansomBanner,
  drawStarSpark,
  drawStretchedMincho,
  renderPlayerShipAndRing,
} from './renderer';
import { formatSurvivalTime } from './storage';

export const PUBLIC_GAME_URL = 'https://handlename.github.io/dodge-survivor/';

function renderPeakSnapshotCrop(
  ctx: CanvasRenderingContext2D,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  snapshot: PeakMomentSnapshot | null,
  fallbackState: GameState
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(boxX, boxY, boxW, boxH);
  ctx.clip();

  ctx.fillStyle = '#090204';
  ctx.fillRect(boxX, boxY, boxW, boxH);

  const player = snapshot ? snapshot.player : fallbackState.player;
  const hazards = snapshot ? snapshot.hazards : fallbackState.hazards;
  const sparks = snapshot ? snapshot.sparks : fallbackState.sparks;
  const popups = snapshot ? snapshot.popups : fallbackState.popups;
  const combo = snapshot ? snapshot.comboMultiplier : fallbackState.maxCombo;

  const cropW = 180;
  const cropH = 260;
  const minCenterX = cropW / 2;
  const maxCenterX = LOGICAL_WIDTH - cropW / 2;
  const minCenterY = HUD_HEIGHT + cropH / 2;
  const maxCenterY = LOGICAL_HEIGHT - cropH / 2;

  const camX = Math.max(minCenterX, Math.min(maxCenterX, player.x));
  const camY = Math.max(minCenterY, Math.min(maxCenterY, player.y));

  const scaleX = boxW / cropW;
  const scaleY = boxH / cropH;

  ctx.translate(boxX + boxW / 2, boxY + boxH / 2);
  ctx.scale(scaleX, scaleY);
  ctx.translate(-camX, -camY);

  // Halftone background dots
  ctx.fillStyle = 'rgba(230, 0, 18, 0.2)';
  for (let gx = 14; gx < LOGICAL_WIDTH; gx += 24) {
    for (let gy = HUD_HEIGHT + 14; gy < LOGICAL_HEIGHT; gy += 24) {
      ctx.beginPath();
      ctx.arc(gx, gy, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (const h of hazards) {
    if (h.kind === 'BOMB') {
      const b = h as BombHazard;
      if (b.elapsedMs < 0) continue;
      const info = getBombPhase(b);
      if (info.phase === 'CONVERGING') {
        ctx.fillStyle = 'rgba(230, 0, 18, 0.08)';
        ctx.strokeStyle = '#ffe600';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(b.x, b.y, info.currentRingRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (info.phase === 'HOLD') {
        ctx.fillStyle = 'rgba(230, 0, 18, 0.24)';
        ctx.strokeStyle = '#ffe600';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.blastRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (info.phase === 'ACTIVE') {
        ctx.fillStyle = 'rgba(230, 0, 18, 0.78)';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.blastRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  for (const h of hazards) {
    if (h.kind === 'LASER') {
      const l = h as LaserHazard;
      if (l.elapsedMs < 0) continue;
      const phase = getLaserPhase(l);
      if (phase === 'WARNING') {
        ctx.save();
        ctx.strokeStyle = '#ff0044';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(l.x1, l.y1);
        ctx.lineTo(l.x2, l.y2);
        ctx.stroke();
        ctx.restore();
      } else if (phase === 'ACTIVE') {
        ctx.strokeStyle = 'rgba(230, 0, 18, 0.45)';
        ctx.lineWidth = l.halfWidth * 3.2;
        ctx.beginPath();
        ctx.moveTo(l.x1, l.y1);
        ctx.lineTo(l.x2, l.y2);
        ctx.stroke();

        ctx.strokeStyle = '#ffe600';
        ctx.lineWidth = l.halfWidth * 2;
        ctx.beginPath();
        ctx.moveTo(l.x1, l.y1);
        ctx.lineTo(l.x2, l.y2);
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(2, l.halfWidth * 0.7);
        ctx.beginPath();
        ctx.moveTo(l.x1, l.y1);
        ctx.lineTo(l.x2, l.y2);
        ctx.stroke();
      }
    }
  }

  for (const h of hazards) {
    if (h.kind === 'BULLET') {
      const b = h as BulletHazard;
      ctx.fillStyle = '#e60012';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius + 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe600';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (let i = 0; i < sparks.length; i++) {
    const s = sparks[i];
    if (i % 2 === 0) {
      drawStarSpark(ctx, s.x, s.y, 5, '#ffe600', i * 0.6, 0.9);
    } else {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.035, s.y - s.vy * 0.035);
      ctx.stroke();
    }
  }
  for (const p of popups) {
    drawStretchedMincho(
      ctx,
      p.text,
      p.x,
      p.y,
      p.isCritical ? 12 : 10,
      p.isCritical ? '#ffe600' : '#00ffee',
      1.3,
      'center',
      3.2,
      '#000000'
    );
  }

  renderPlayerShipAndRing(ctx, player.x, player.y, 3, combo, 1.0, 1000);

  ctx.restore();

  ctx.fillStyle = 'rgba(5, 2, 3, 0.9)';
  ctx.fillRect(boxX, boxY + boxH - 36, boxW, 36);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  ctx.fillStyle = '#ffe600';
  ctx.font = '900 11px monospace';
  ctx.textAlign = 'left';
  const peakRate = snapshot ? snapshot.windowScoreRatePerSec : 0;
  ctx.fillText(`PEAK: +${peakRate.toLocaleString('en-US')} PTS/s`, boxX + 8, boxY + boxH - 20);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px monospace';
  const peakTime = snapshot ? formatSurvivalTime(snapshot.timeMs) : '00:00.000';
  ctx.fillText(`AT ${peakTime} (×${combo.toFixed(1)})`, boxX + 8, boxY + boxH - 6);
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

  // Persona Crimson & Pitch-Black Diagonal Split Backdrop
  ctx.fillStyle = '#070204';
  ctx.fillRect(0, 0, 600, 400);

  ctx.fillStyle = '#e60012';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(390, 0);
  ctx.lineTo(310, 400);
  ctx.lineTo(0, 400);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#080204';
  ctx.beginPath();
  ctx.moveTo(10, 12);
  ctx.lineTo(372, 12);
  ctx.lineTo(298, 388);
  ctx.lineTo(10, 388);
  ctx.closePath();
  ctx.fill();

  drawPersonaRansomBanner(
    ctx,
    isNewRecord ? '最高記録更新' : '作戦終了報告',
    190,
    52,
    24,
    '#e60012',
    1
  );

  ctx.fillStyle = '#ffe600';
  ctx.font = '900 13px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('FINAL SCORE', 28, 106);

  drawStretchedMincho(
    ctx,
    record.score.toLocaleString('en-US'),
    28,
    148,
    40,
    '#ffffff',
    1.3,
    'left',
    4,
    '#e60012'
  );

  ctx.fillStyle = '#ffe600';
  ctx.font = '900 12px monospace';
  ctx.fillText('SURVIVAL TIME', 28, 206);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 22px monospace';
  ctx.fillText(formatSurvivalTime(record.survivalTimeMs), 28, 232);

  ctx.fillStyle = '#ffe600';
  ctx.font = '900 12px monospace';
  ctx.fillText('MAX COMBO', 205, 206);
  ctx.fillStyle = '#ffe600';
  ctx.font = '900 22px monospace';
  ctx.fillText(`×${record.maxCombo.toFixed(1)}`, 205, 232);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px monospace';
  ctx.fillText(`GRAZE TICKS: ${record.totalGrazeCount}`, 28, 274);

  ctx.fillStyle = '#aaaaaa';
  ctx.font = '12px monospace';
  ctx.fillText(`TIMESTAMP: ${record.timestamp}`, 28, 304);

  drawStretchedMincho(
    ctx,
    'DODGE SURVIVOR',
    28,
    350,
    20,
    '#ffe600',
    1.3,
    'left',
    3,
    '#000000'
  );

  const mapX = 388;
  const mapY = 48;
  const mapW = 190;
  const mapH = 316;

  ctx.fillStyle = '#ffe600';
  ctx.font = '900 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PEAK GRAZE MOMENT', mapX + mapW / 2, mapY - 10);

  renderPeakSnapshotCrop(ctx, mapX, mapY, mapW, mapH, state.peakMoment, state);

  return canvas;
}

export function buildShareMessage(record: RankingRecord, isNewRecord: boolean): string {
  const headline = isNewRecord
    ? 'MAXIMUM GRAZE! NEW HIGH SCORE! ⚡🔥'
    : 'OPERATION COMPLETE! ⚡🔥';
  return [
    headline,
    `SCORE: ${record.score.toLocaleString('en-US')} (MAX COMBO ×${record.maxCombo.toFixed(1)})`,
    `SURVIVAL TIME: ${formatSurvivalTime(record.survivalTimeMs)}`,
    'DODGE SURVIVOR #DODGESURVIVOR',
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
  const file = dataUrlToFile(dataUrl, 'dodge-survivor-result.png');

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
    a.download = 'dodge-survivor-result.png';
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
