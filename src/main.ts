import {
  createInitialGameState,
  resetPlayerCenter,
  startNewGame,
  stepGame,
  togglePauseGame,
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
const pauseOverlay = document.getElementById('pause-overlay') as HTMLElement;
const resultOverlay = document.getElementById('result-overlay') as HTMLElement;
const titleBest = document.getElementById('title-best') as HTMLElement;
const resultBanner = document.getElementById('result-banner') as HTMLElement;
const resultCardPreview = document.getElementById('result-card-preview') as HTMLImageElement;
const rankingList = document.getElementById('ranking-list') as HTMLOListElement;
const sensorStatus = document.getElementById('sensor-status') as HTMLElement;

const btnPause = document.getElementById('btn-pause') as HTMLButtonElement;
const btnResume = document.getElementById('btn-resume') as HTMLButtonElement;
const btnQuit = document.getElementById('btn-quit') as HTMLButtonElement;
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

let activePointerId: number | null = null;
let lastPointerX = 0;
let lastPointerY = 0;
let pendingRawDx = 0;
let pendingRawDy = 0;
let pendingGyroDx = 0;
let pendingGyroDy = 0;
let lastMotionTimestamp: number | null = null;
let hasReceivedMotionSample = false;
let lastOrientationBeta: number | null = null;
let lastOrientationGamma: number | null = null;

function setSensorStatusMessage(html: string | null): void {
  if (!html) {
    sensorStatus.innerHTML = '';
    sensorStatus.classList.add('hidden');
  } else {
    sensorStatus.innerHTML = html;
    sensorStatus.classList.remove('hidden');
  }
}

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
  rankings.forEach((rec, idx) => {
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
  setSensorStatusMessage(null);
  updateOptions({ mode: 'SWIPE' });
});

async function enableGyroWithFeedback(): Promise<boolean> {
  // Mobile browsers block DeviceMotionEvent and requestPermission over plain http:// LAN IPs
  if (
    typeof window !== 'undefined' &&
    !window.isSecureContext &&
    window.location.protocol === 'http:' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    const httpsUrl = `https://${window.location.hostname}:5174${window.location.pathname}${window.location.search}`;
    setSensorStatusMessage(
      `GYRO REQUIRES HTTPS ON MOBILE: <a href="${httpsUrl}">OPEN ${httpsUrl}</a>`
    );
    updateOptions({ mode: 'GYRO' });
    return false;
  }

  const granted = await requestSensorPermissions(
    typeof DeviceMotionEvent !== 'undefined'
      ? (DeviceMotionEvent as unknown as PermissionTarget)
      : undefined,
    typeof DeviceOrientationEvent !== 'undefined'
      ? (DeviceOrientationEvent as unknown as PermissionTarget)
      : undefined
  );

  if (!granted) {
    setSensorStatusMessage('MOTION SENSOR PERMISSION DENIED BY BROWSER.');
    return false;
  }

  setSensorStatusMessage(null);
  updateOptions({ mode: 'GYRO' });
  return true;
}

btnModeGyro.addEventListener('click', () => {
  void enableGyroWithFeedback();
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

function syncPauseUI(): void {
  const isPlaying = state.phase === 'PLAYING' || state.phase === 'GAME_OVER';
  const isPaused = state.phase === 'PAUSED';
  document.body.classList.toggle('playing', isPlaying);
  btnPause.classList.toggle('hidden', state.phase !== 'PLAYING' && state.phase !== 'PAUSED');
  btnPause.textContent = isPaused ? 'RESUME' : 'PAUSE';
  pauseOverlay.classList.toggle('active', isPaused);
  if (isPaused) {
    sound.stopBgm();
  } else if (state.phase === 'PLAYING') {
    sound.startBgm();
  }
  window.setTimeout(() => renderer.resize(), 0);
}

function handleTogglePause(): void {
  if (state.phase !== 'PLAYING' && state.phase !== 'PAUSED') return;
  state = togglePauseGame(state);
  pendingRawDx = 0;
  pendingRawDy = 0;
  pendingGyroDx = 0;
  pendingGyroDy = 0;
  syncPauseUI();
}

btnPause.addEventListener('click', () => {
  handleTogglePause();
});

btnResume.addEventListener('click', () => {
  if (state.phase === 'PAUSED') {
    handleTogglePause();
  }
});

btnQuit.addEventListener('click', () => {
  sound.stopBgm();
  state = createInitialGameState();
  document.body.classList.remove('playing');
  btnPause.classList.add('hidden');
  pauseOverlay.classList.remove('active');
  resultOverlay.classList.remove('active');
  titleOverlay.classList.add('active');
  updateTitleBest();
  window.setTimeout(() => renderer.resize(), 0);
});

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
    handleTogglePause();
  }
});

async function handleStartGame(): Promise<void> {
  if (options.mode === 'GYRO') {
    await enableGyroWithFeedback();
  }
  state = startNewGame(state);
  document.body.classList.add('playing');
  btnPause.classList.remove('hidden');
  btnPause.textContent = 'PAUSE';
  btnShare.textContent = 'SHARE RESULT';
  titleOverlay.classList.remove('active');
  pauseOverlay.classList.remove('active');
  resultOverlay.classList.remove('active');
  sound.startBgm();
  window.setTimeout(() => renderer.resize(), 0);
}

btnStart.addEventListener('click', () => {
  void handleStartGame();
});

btnRetry.addEventListener('click', () => {
  void handleStartGame();
});

btnShare.addEventListener('click', async () => {
  if (!latestResultCanvas) return;
  btnShare.textContent = 'SHARING...';
  const status = await shareResultImage(latestResultCanvas, latestShareText);
  btnShare.textContent = status === 'shared' ? 'SHARED!' : 'IMAGE SAVED!';
  window.setTimeout(() => {
    btnShare.textContent = 'SHARE RESULT';
  }, 2200);
});

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

window.addEventListener('devicemotion', (e: DeviceMotionEvent) => {
  if (options.mode !== 'GYRO') return;
  const now = performance.now();
  const dtSec = lastMotionTimestamp !== null ? (now - lastMotionTimestamp) / 1000 : 0.016;
  lastMotionTimestamp = now;

  if (
    e.rotationRate &&
    (e.rotationRate.alpha !== null || e.rotationRate.beta !== null || e.rotationRate.gamma !== null)
  ) {
    hasReceivedMotionSample = true;
    const sample: MotionSample = {
      alphaRate: e.rotationRate.alpha,
      betaRate: e.rotationRate.beta,
      gammaRate: e.rotationRate.gamma,
      gx: e.accelerationIncludingGravity?.x ?? null,
      gy: e.accelerationIncludingGravity?.y ?? null,
      gz: e.accelerationIncludingGravity?.z ?? null,
      dtSec,
    };
    const delta = computeGyroDelta(sample, options);
    pendingGyroDx += delta.dx;
    pendingGyroDy += delta.dy;
  }
});

// Fallback for devices firing DeviceOrientationEvent Euler angles without rotationRate
window.addEventListener('deviceorientation', (e: DeviceOrientationEvent) => {
  if (options.mode !== 'GYRO' || hasReceivedMotionSample) return;
  if (e.beta === null || e.gamma === null) return;
  if (lastOrientationBeta !== null && lastOrientationGamma !== null) {
    const dGamma = Math.max(-15, Math.min(15, e.gamma - lastOrientationGamma));
    const dBeta = Math.max(-15, Math.min(15, e.beta - lastOrientationBeta));
    pendingGyroDx += dGamma * options.gyroSensitivity * (options.invertX ? -1 : 1);
    pendingGyroDy += dBeta * options.gyroSensitivity * (options.invertY ? -1 : 1);
  }
  lastOrientationBeta = e.beta;
  lastOrientationGamma = e.gamma;
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
  if (events.playerExploded) {
    sound.stopBgm();
    btnPause.classList.add('hidden');
    sound.playPlayerExplosion();
  } else if (events.lastLifeWarning) {
    sound.playLastLifeSirens();
  } else if (events.directHit) {
    sound.playDirectHit();
  }

  if (prevPhase !== 'RESULT' && state.phase === 'RESULT') {
    sound.stopBgm();
    document.body.classList.remove('playing');
    btnPause.classList.add('hidden');
    pauseOverlay.classList.remove('active');
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
