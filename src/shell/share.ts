import { getBombPhase, getLaserPhase } from '../core/hazards';
import {
  CORE_RADIUS,
  GRAZE_RADIUS,
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
import { drawStretchedMincho } from './renderer';
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

  ctx.fillStyle = '#06060b';
  ctx.fillRect(boxX, boxY, boxW, boxH);

  const player = snapshot ? snapshot.player : fallbackState.player;
  const hazards = snapshot ? snapshot.hazards : fallbackState.hazards;
  const sparks = snapshot ? snapshot.sparks : fallbackState.sparks;
  const popups = snapshot ? snapshot.popups : fallbackState.popups;

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

  ctx.strokeStyle = 'rgba(255, 153, 0, 0.14)';
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

  drawStretchedMincho(
    ctx,
    '極限瞬間',
    camX,
    camY - 62,
    34,
    'rgba(255, 153, 0, 0.22)',
    1.42
  );

  for (const h of hazards) {
    if (h.kind === 'BOMB') {
      const b = h as BombHazard;
      if (b.elapsedMs < 0) continue;
      const info = getBombPhase(b);
      if (info.phase === 'CONVERGING') {
        ctx.fillStyle = 'rgba(255, 60, 0, 0.08)';
        ctx.strokeStyle = 'rgba(255, 190, 0, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(b.x, b.y, info.currentRingRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (info.phase === 'HOLD') {
        ctx.fillStyle = 'rgba(255, 40, 0, 0.22)';
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.blastRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (info.phase === 'ACTIVE') {
        ctx.fillStyle = 'rgba(255, 80, 0, 0.72)';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.2;
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
        ctx.strokeStyle = 'rgba(255, 0, 85, 0.42)';
        ctx.lineWidth = l.halfWidth * 3.2;
        ctx.beginPath();
        ctx.moveTo(l.x1, l.y1);
        ctx.lineTo(l.x2, l.y2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 130, 0, 0.85)';
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
      ctx.fillStyle = '#ff5500';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius + 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffcc';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (const s of sparks) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.vx * 0.035, s.y - s.vy * 0.035);
    ctx.stroke();
  }
  for (const p of popups) {
    drawStretchedMincho(
      ctx,
      p.text,
      p.x,
      p.y,
      p.isCritical ? 12 : 10,
      p.color,
      1.3,
      'center',
      3.0,
      '#000000'
    );
  }

  ctx.strokeStyle = '#00ffee';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(player.x, player.y, GRAZE_RADIUS, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(player.x, player.y - 10);
  ctx.lineTo(player.x + 7, player.y + 7);
  ctx.lineTo(player.x, player.y + 3.5);
  ctx.lineTo(player.x - 7, player.y + 7);
  ctx.closePath();
  ctx.stroke();

  ctx.fillStyle = '#00ffee';
  ctx.beginPath();
  ctx.arc(player.x, player.y, CORE_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  ctx.fillStyle = 'rgba(9, 7, 6, 0.84)';
  ctx.fillRect(boxX, boxY + boxH - 36, boxW, 36);
  ctx.strokeStyle = '#ff9900';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  ctx.fillStyle = '#ffcc00';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  const peakRate = snapshot ? snapshot.windowScoreRatePerSec : 0;
  ctx.fillText(`PEAK: +${peakRate.toLocaleString('en-US')} PTS/s`, boxX + 8, boxY + boxH - 20);
  ctx.fillStyle = '#00ffee';
  ctx.font = '10px monospace';
  const peakTime = snapshot ? formatSurvivalTime(snapshot.timeMs) : '00:00.000';
  const peakCombo = snapshot ? snapshot.comboMultiplier.toFixed(1) : '1.0';
  ctx.fillText(`AT ${peakTime} (×${peakCombo})`, boxX + 8, boxY + boxH - 6);
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

  ctx.fillStyle = '#090706';
  ctx.fillRect(0, 0, 600, 400);

  ctx.save();
  for (let x = -40; x < 640; x += 24) {
    ctx.fillStyle = Math.floor(x / 24) % 2 === 0 ? '#ff9900' : '#000000';
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 14, 0);
    ctx.lineTo(x + 4, 14);
    ctx.lineTo(x - 10, 14);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x, 386);
    ctx.lineTo(x + 14, 386);
    ctx.lineTo(x + 4, 400);
    ctx.lineTo(x - 10, 400);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  ctx.strokeStyle = '#ff9900';
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 16, 596, 368);

  drawStretchedMincho(
    ctx,
    isNewRecord ? '最高記録更新・極限達成' : '作戦終了・戦果報告',
    200,
    54,
    24,
    isNewRecord ? '#ffcc00' : '#ff3300',
    1.38
  );

  ctx.fillStyle = '#ff9900';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('FINAL SCORE', 28, 102);

  drawStretchedMincho(
    ctx,
    record.score.toLocaleString('en-US'),
    28,
    144,
    40,
    '#ffffff',
    1.3,
    'left'
  );

  ctx.fillStyle = '#ff9900';
  ctx.font = 'bold 12px monospace';
  ctx.fillText('SURVIVAL TIME', 28, 204);
  ctx.fillStyle = '#00ffee';
  ctx.font = 'bold 22px monospace';
  ctx.fillText(formatSurvivalTime(record.survivalTimeMs), 28, 230);

  ctx.fillStyle = '#ff9900';
  ctx.font = 'bold 12px monospace';
  ctx.fillText('MAX COMBO', 205, 204);
  ctx.fillStyle = '#ffcc00';
  ctx.font = 'bold 22px monospace';
  ctx.fillText(`×${record.maxCombo.toFixed(1)}`, 205, 230);

  ctx.fillStyle = '#ff9900';
  ctx.font = 'bold 12px monospace';
  ctx.fillText(`GRAZE TICKS: ${record.totalGrazeCount}`, 28, 272);

  ctx.fillStyle = '#999999';
  ctx.font = '12px monospace';
  ctx.fillText(`TIMESTAMP: ${record.timestamp}`, 28, 304);

  drawStretchedMincho(ctx, 'DODGE SURVIVOR', 28, 348, 20, '#ff9900', 1.3, 'left');

  const mapX = 388;
  const mapY = 50;
  const mapW = 188;
  const mapH = 306;

  ctx.fillStyle = '#ff9900';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PEAK GRAZE MOMENT', mapX + mapW / 2, mapY - 8);

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
  // Build PNG File synchronously from dataURL so we never lose user gesture activation on mobile Safari/Chrome
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
      // Fall through to download + intent on error
    }
  }

  // Fallback for non-HTTPS or desktop browsers: download the result card PNG + open X share / copy text
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
