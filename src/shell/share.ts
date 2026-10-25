import {
  HUD_HEIGHT,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  type GameState,
  type RankingRecord,
} from '../core/types';
import { drawStretchedMincho } from './renderer';
import { formatSurvivalTime } from './storage';

export const PUBLIC_GAME_URL = 'https://handlename.github.io/dodge-survivor/';

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

  // Background
  ctx.fillStyle = '#090706';
  ctx.fillRect(0, 0, 600, 400);

  // Evangelion Hazard Stripe Borders (Top & Bottom)
  ctx.save();
  for (let x = -40; x < 640; x += 24) {
    ctx.fillStyle = (Math.floor(x / 24) % 2 === 0) ? '#ff9900' : '#000000';
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

  // Left Column: Operation Report & Score
  drawStretchedMincho(
    ctx,
    isNewRecord ? '最高記録更新・極限達成' : '作戦終了・戦果報告',
    210,
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
  ctx.fillText('MAX COMBO', 210, 204);
  ctx.fillStyle = '#ffcc00';
  ctx.font = 'bold 22px monospace';
  ctx.fillText(`×${record.maxCombo.toFixed(1)}`, 210, 230);

  ctx.fillStyle = '#ff9900';
  ctx.font = 'bold 12px monospace';
  ctx.fillText(`GRAZE TICKS: ${record.totalGrazeCount}`, 28, 272);

  ctx.fillStyle = '#999999';
  ctx.font = '12px monospace';
  ctx.fillText(`TIMESTAMP: ${record.timestamp}`, 28, 304);

  drawStretchedMincho(ctx, 'DODGE SURVIVOR', 28, 348, 20, '#ff9900', 1.3, 'left');

  // Right Column: Mini Trace & Graze Heatmap (x: 396..576, y: 40..360)
  const mapX = 402;
  const mapY = 50;
  const mapW = 172;
  const mapH = 300;
  ctx.fillStyle = '#05050a';
  ctx.fillRect(mapX, mapY, mapW, mapH);
  ctx.strokeStyle = '#ff9900';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(mapX, mapY, mapW, mapH);

  ctx.fillStyle = '#ff9900';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('GRAZE & TRACE LOG', mapX + mapW / 2, mapY - 8);

  const toMapX = (lx: number) => mapX + (lx / LOGICAL_WIDTH) * mapW;
  const toMapY = (ly: number) =>
    mapY + ((ly - HUD_HEIGHT) / (LOGICAL_HEIGHT - HUD_HEIGHT)) * mapH;

  if (state.traceLog.length > 1) {
    ctx.strokeStyle = 'rgba(0, 255, 238, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(toMapX(state.traceLog[0].x), toMapY(state.traceLog[0].y));
    for (let i = 1; i < state.traceLog.length; i++) {
      ctx.lineTo(toMapX(state.traceLog[i].x), toMapY(state.traceLog[i].y));
    }
    ctx.stroke();
  }

  for (const g of state.grazeLog) {
    ctx.fillStyle = g.isCritical ? '#ffcc00' : '#00ffee';
    ctx.fillRect(toMapX(g.x) - 1.5, toMapY(g.y) - 1.5, 3, 3);
  }

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

export async function shareResultImage(
  canvas: HTMLCanvasElement,
  text: string
): Promise<void> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png')
  );

  if (blob && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const file = new File([blob], 'dodge-survivor-result.png', { type: 'image/png' });
    const shareData: ShareData =
      typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
        ? { text, files: [file] }
        : { text };
    try {
      await navigator.share(shareData);
      return;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
    }
  }

  if (typeof window !== 'undefined') {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer'
    );
  }
}
