import {
  createInitialGameState,
  resetPlayerCenter,
  startNewGame,
  stepGame,
} from './core/game';
import { computeGyroDelta, computeSwipeDelta, type MotionSample } from './core/input';
import type { ControlOptions, GameState, RankingRecord } from './core/types';
import { SoundController } from './shell/audio';
import { requestSensorPermissions, type PermissionTarget } from './shell/permissions';
import { CanvasRenderer } from './shell/renderer';
import {
  buildShareMessage,
  renderResultCardCanvas,
  shareResultImage,
} from './shell/share';
import {
  formatSurvivalTime,
  formatTimestamp,
  handleUrlResetParam,
  loadControlOptions,
  loadRanking,
  saveControlOptions,
  saveRankingRecord,
} from './shell/storage';

handleUrlResetParam();

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const titleOverlay = document.getElementById('title-overlay') as HTMLElement;
const resultOverlay = document.getElementById('result-overlay') as HTMLElement;
const titleBest = document.getElementById('title-best') as HTMLElement;
const resultBanner = document.getElementById('result-banner') as HTMLElement;
const resultCardPreview = document.getElementById('result-card-preview') as HTMLImageElement;
const rankingList = document.getElementById('ranking-list') as HTMLOListElement;

const btnStart = document.getElementById('btn-start') as HTMLButtonElement;
const btnShare = document.getElementById('btn-share') as HTMLButtonElement;
const btnRetry = document.getElementById('btn-retry') as HTMLButtonElement;

const btnModeSwipe = document.getElementById('btn-mode-swipe') as HTMLButtonElement;
const btnModeGyro = document.getElementById('btn-mode-gyro') as HTMLButtonElement;
const swipeControls = document.getElementById('swipe-controls') as HTMLElement;
const gyroControls = document.getElementById('gyro-controls') as HTMLElement;

const sliderSpeed = document.getElementById('slider-speed') as HTMLInputElement;
const valSpeed = document.getElementById('val-speed') as HTMLElement;
const sliderAccel = document.getElementById('slider-accel') as HTMLInputElement;
const valAccel = document.getElementById('val-accel') as HTMLElement;
const sliderGyro = document.getElementById('slider-gyro') as HTMLInputElement;
const valGyro = document.getElementById('val-gyro') as HTMLElement;

const btnRevX = document.getElementById('btn-rev-x') as HTMLButtonElement;
const btnRevY = document.getElementById('btn-rev-y') as HTMLButtonElement;
const btnResetCenter = document.getElementById('btn-reset-center') as HTMLButtonElement;
const btnSound = document.getElementById('btn-sound') as HTMLButtonElement;

const renderer = new CanvasRenderer(canvas);
const sound = new SoundController();

let options: ControlOptions = loadControlOptions();
let state: GameState = createInitialGameState();
let latestResultCanvas: HTMLCanvasElement | null = null;
let latestShareText = '';

// Pointer & Gyro accumulators
let activePointerId: number | null = null;
let lastPointerX = 0;
let lastPointerY = 0;
let pendingRawDx = 0;
let pendingRawDy = 0;
let pendingGyroDx = 0;
let pendingGyroDy = 0;
let lastMotionTimestamp: number | null = null;

function syncOptionsUI(): void {
  btnModeSwipe.classList.toggle('active', options.mode === 'SWIPE');
  btnModeGyro.classList.toggle('active', options.mode === 'GYRO');
  swipeControls.classList.toggle('hidden', options.mode !== 'SWIPE');
  gyroControls.classList.toggle('hidden', options.mode !== 'GYRO');

  sliderSpeed.value = options.swipeSpeed.toFixed(1);
  valSpeed.textContent = options.swipeSpeed.toFixed(1);
  sliderAccel.value = options.swipeAccel.toFixed(1);
  valAccel.textContent = options.swipeAccel.toFixed(1);
  sliderGyro.value = options.gyroSensitivity.toFixed(1);
  valGyro.textContent = options.gyroSensitivity.toFixed(1);

  btnRevX.textContent = `REVERSE X: ${options.invertX ? 'ON' : 'OFF'}`;
  btnRevX.classList.toggle('active', options.invertX);
  btnRevY.textContent = `REVERSE Y: ${options.invertY ? 'ON' : 'OFF'}`;
  btnRevY.classList.toggle('active', options.invertY);

  btnSound.textContent = `SOUND: ${options.soundEnabled ? 'ON' : 'OFF'}`;
  btnSound.classList.toggle('active', options.soundEnabled);
  sound.setEnabled(options.soundEnabled);
}

function updateTitleBest(): void {
  const rankings = loadRanking();
  const best = rankings.length > 0 ? rankings[0].score : 0;
  titleBest.textContent = `BEST SCORE: ${best.toLocaleString('en-US')}`;
}

function renderRankingList(rankings: readonly RankingRecord[], highlightIdx: number): void {
  rankingList.innerHTML = '';
  rankings.slice(0, 5).forEach((rec, idx) => {
    const li = document.createElement('li');
    li.className = `ranking-item${idx === highlightIdx ? ' highlight' : ''}`;
    const left = document.createElement('span');
    left.textContent = `#${idx + 1} ${rec.score.toLocaleString('en-US')}`;
    const mid = document.createElement('span');
    mid.textContent = formatSurvivalTime(rec.survivalTimeMs);
    const right = document.createElement('span');
    right.textContent = rec.timestamp.slice(5, 16);
    li.append(left, mid, right);
    rankingList.appendChild(li);
  });
}

function updateOptions(patch: Partial<ControlOptions>): void {
  options = { ...options, ...patch };
  saveControlOptions(options);
  syncOptionsUI();
}

btnModeSwipe.addEventListener('click', () => {
  updateOptions({ mode: 'SWIPE' });
});

btnModeGyro.addEventListener('click', async () => {
  const granted = await requestSensorPermissions(
    typeof DeviceMotionEvent !== 'undefined'
      ? (DeviceMotionEvent as unknown as PermissionTarget)
      : undefined,
    typeof DeviceOrientationEvent !== 'undefined'
      ? (DeviceOrientationEvent as unknown as PermissionTarget)
      : undefined
  );
  if (granted) {
    updateOptions({ mode: 'GYRO' });
  }
});

sliderSpeed.addEventListener('input', () => {
  updateOptions({ swipeSpeed: parseFloat(sliderSpeed.value) });
});

sliderAccel.addEventListener('input', () => {
  updateOptions({ swipeAccel: parseFloat(sliderAccel.value) });
});

sliderGyro.addEventListener('input', () => {
  updateOptions({ gyroSensitivity: parseFloat(sliderGyro.value) });
});

btnRevX.addEventListener('click', () => {
  updateOptions({ invertX: !options.invertX });
});

btnRevY.addEventListener('click', () => {
  updateOptions({ invertY: !options.invertY });
});

btnResetCenter.addEventListener('click', () => {
  state = resetPlayerCenter(state);
});

btnSound.addEventListener('click', () => {
  updateOptions({ soundEnabled: !options.soundEnabled });
});

async function handleStartGame(): Promise<void> {
  if (options.mode === 'GYRO') {
    await requestSensorPermissions(
      typeof DeviceMotionEvent !== 'undefined'
        ? (DeviceMotionEvent as unknown as PermissionTarget)
        : undefined,
      typeof DeviceOrientationEvent !== 'undefined'
        ? (DeviceOrientationEvent as unknown as PermissionTarget)
        : undefined
    );
  }
  state = startNewGame(state);
  document.body.classList.add('playing');
  titleOverlay.classList.remove('active');
  resultOverlay.classList.remove('active');
  sound.startBgm();
}

btnStart.addEventListener('click', () => {
  void handleStartGame();
});

btnRetry.addEventListener('click', () => {
  void handleStartGame();
});

btnShare.addEventListener('click', () => {
  if (latestResultCanvas) {
    void shareResultImage(latestResultCanvas, latestShareText);
  }
});

// Relative Touch / Mouse Trackpad handlers
function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('button, input, label, a, .options-panel'));
}

window.addEventListener('pointerdown', (e: PointerEvent) => {
  if (isInteractiveTarget(e.target)) return;
  if (activePointerId === null) {
    activePointerId = e.pointerId;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
  }
});

window.addEventListener('pointermove', (e: PointerEvent) => {
  if (e.pointerId !== activePointerId) return;
  const scale = renderer.getLogicalScale();
  const dx = (e.clientX - lastPointerX) * scale.scaleX;
  const dy = (e.clientY - lastPointerY) * scale.scaleY;
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;
  pendingRawDx += dx;
  pendingRawDy += dy;
});

function clearPointer(e: PointerEvent): void {
  if (e.pointerId === activePointerId) {
    activePointerId = null;
  }
}
window.addEventListener('pointerup', clearPointer);
window.addEventListener('pointercancel', clearPointer);

// DeviceMotion 3D Gyro handler
window.addEventListener('devicemotion', (e: DeviceMotionEvent) => {
  if (options.mode !== 'GYRO') return;
  const now = performance.now();
  const dtSec = lastMotionTimestamp !== null ? (now - lastMotionTimestamp) / 1000 : 0.016;
  lastMotionTimestamp = now;

  const sample: MotionSample = {
    alphaRate: e.rotationRate?.alpha ?? null,
    betaRate: e.rotationRate?.beta ?? null,
    gammaRate: e.rotationRate?.gamma ?? null,
    gx: e.accelerationIncludingGravity?.x ?? null,
    gy: e.accelerationIncludingGravity?.y ?? null,
    gz: e.accelerationIncludingGravity?.z ?? null,
    dtSec,
  };
  const delta = computeGyroDelta(sample, options);
  pendingGyroDx += delta.dx;
  pendingGyroDy += delta.dy;
});

window.addEventListener('resize', () => {
  renderer.resize();
});

syncOptionsUI();
updateTitleBest();

let lastFrameTime = performance.now();

function onFrame(now: number): void {
  const rawDtMs = now - lastFrameTime;
  lastFrameTime = now;

  const moveDelta =
    options.mode === 'SWIPE'
      ? computeSwipeDelta(pendingRawDx, pendingRawDy, rawDtMs, options)
      : { dx: pendingGyroDx, dy: pendingGyroDy };

  pendingRawDx = 0;
  pendingRawDy = 0;
  pendingGyroDx = 0;
  pendingGyroDy = 0;

  const prevPhase = state.phase;
  const { state: nextState, events } = stepGame(state, rawDtMs, moveDelta);
  state = nextState;

  if (events.grazeCount > 0) {
    sound.playGraze(state.comboMultiplier, events.criticalGrazeCount > 0);
  }
  if (events.spawnedLaserCount > 0 || events.spawnedBombCount > 0) {
    sound.playWarning();
  }
  if (events.laserActivatedCount > 0) {
    sound.playLaserFire();
  }
  if (events.bombDetonatedCount > 0) {
    sound.playBombDetonate();
  }
  if (events.directHit) {
    sound.playDirectHit();
  }

  if (prevPhase === 'PLAYING' && state.phase === 'RESULT') {
    sound.stopBgm();
    document.body.classList.remove('playing');
    const record: RankingRecord = {
      score: state.score,
      survivalTimeMs: state.survivalTimeMs,
      maxCombo: state.maxCombo,
      totalGrazeCount: state.totalGrazeCount,
      timestamp: formatTimestamp(new Date()),
    };
    const saved = saveRankingRecord(record);
    resultBanner.textContent = saved.isNewRecord
      ? '最高記録更新・極限達成'
      : '作戦終了・戦果報告';
    latestResultCanvas = renderResultCardCanvas(state, record, saved.isNewRecord);
    resultCardPreview.src = latestResultCanvas.toDataURL('image/png');
    latestShareText = buildShareMessage(record, saved.isNewRecord);
    renderRankingList(saved.rankings, saved.rankIndex);
    updateTitleBest();
    resultOverlay.classList.add('active');
    window.setTimeout(() => renderer.resize(), 0);
  }

  renderer.render(state);
  requestAnimationFrame(onFrame);
}

requestAnimationFrame(onFrame);
