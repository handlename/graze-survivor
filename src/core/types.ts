import { GAME_PARAMS } from './params';

export const LOGICAL_WIDTH = 360;
export const LOGICAL_HEIGHT = 640;
export const HUD_HEIGHT = 56;
export const PLAYFIELD_TOP = HUD_HEIGHT;
export const PLAYFIELD_HEIGHT = LOGICAL_HEIGHT - HUD_HEIGHT;

export const CORE_RADIUS = GAME_PARAMS.player.coreRadius;
export const GRAZE_RADIUS = GAME_PARAMS.player.grazeRadius;
export const GRAZE_TICK_MS = GAME_PARAMS.scoring.grazeTickMs;
export const BASE_TICK_SCORE = GAME_PARAMS.scoring.baseTickScore;
export const COMBO_HOLD_MS = GAME_PARAMS.scoring.comboHoldMs;
export const INVULNERABLE_MS = GAME_PARAMS.player.invulnerableMs;
export const INITIAL_LIVES = GAME_PARAMS.player.initialLives;
export const GAME_OVER_EXPLOSION_MS = GAME_PARAMS.effects.gameOverExplosionMs;

export interface Vector2D {
  readonly x: number;
  readonly y: number;
}

export interface PlayerState {
  readonly x: number;
  readonly y: number;
  readonly invulnerableMs: number;
  readonly trail: readonly Vector2D[];
}

export interface BulletHazard {
  readonly id: string;
  readonly kind: 'BULLET';
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly radius: number;
  readonly grazeTimerMs: number;
}

export interface BombHazard {
  readonly id: string;
  readonly kind: 'BOMB';
  readonly x: number;
  readonly y: number;
  readonly blastRadius: number;
  readonly elapsedMs: number;
  readonly convergeDurationMs: number;
  readonly holdDurationMs: number;
  readonly activeDurationMs: number;
  readonly grazeTimerMs: number;
}

export interface LaserHazard {
  readonly id: string;
  readonly kind: 'LASER';
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly halfWidth: number;
  readonly elapsedMs: number;
  readonly warningDurationMs: number;
  readonly activeDurationMs: number;
  readonly grazeTimerMs: number;
}

export type Hazard = BulletHazard | BombHazard | LaserHazard;

export type ContactResult =
  | { readonly kind: 'NONE' }
  | { readonly kind: 'HIT' }
  | {
      readonly kind: 'GRAZE';
      readonly distanceToEdge: number;
      readonly closeness: number;
    };

export interface SparkParticle {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly color: string;
  readonly remainingMs: number;
  readonly totalMs: number;
}

export interface ScorePopup {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly color: string;
  readonly isCritical: boolean;
  readonly remainingMs: number;
}

export type InputMode = 'SWIPE' | 'GYRO';

export interface ControlOptions {
  readonly mode: InputMode;
  readonly swipeSpeed: number;
  readonly swipeAccel: number;
  readonly gyroSensitivity: number;
  readonly invertX: boolean;
  readonly invertY: boolean;
  readonly soundEnabled: boolean;
}

export interface RankingRecord {
  readonly score: number;
  readonly survivalTimeMs: number;
  readonly maxCombo: number;
  readonly totalGrazeCount: number;
  readonly timestamp: string;
}

export type GamePhase = 'TITLE' | 'PLAYING' | 'PAUSED' | 'GAME_OVER' | 'RESULT';

export interface ScoreSample {
  readonly timeMs: number;
  readonly scoreDelta: number;
}

export interface PeakMomentSnapshot {
  readonly timeMs: number;
  readonly windowScoreRatePerSec: number;
  readonly comboMultiplier: number;
  readonly player: PlayerState;
  readonly hazards: readonly Hazard[];
  readonly sparks: readonly SparkParticle[];
  readonly popups: readonly ScorePopup[];
}

export interface GameState {
  readonly phase: GamePhase;
  readonly player: PlayerState;
  readonly hazards: readonly Hazard[];
  readonly sparks: readonly SparkParticle[];
  readonly popups: readonly ScorePopup[];
  readonly score: number;
  readonly comboMultiplier: number;
  readonly maxCombo: number;
  readonly comboGauge: number;
  readonly totalGrazeCount: number;
  readonly lives: number;
  readonly survivalTimeMs: number;
  readonly nextBulletInMs: number;
  readonly nextLaserInMs: number;
  readonly nextBombInMs: number;
  readonly spawnCounter: number;
  readonly screenShakeMs: number;
  readonly hitFlashMs: number;
  readonly gameOverTimerMs: number;
  readonly recentScoreSamples: readonly ScoreSample[];
  readonly peakMoment: PeakMomentSnapshot | null;
}
