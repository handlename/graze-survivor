# GRAZE SURVIVOR - Architecture & Game Design Guidelines

## 1. アーキテクチャ構成 (Functional Core, Imperative Shell)
- **`src/core/` (Functional Core)**:
  - 純粋関数と不変（`readonly`）データ構造のみでゲーム状態遷移を実装する（DOM・Canvas・Audio・LocalStorage・`Math.random` の直接呼び出し禁止。乱数は注入された `rng: () => number` を使用する）。
  - 主要モジュール:
    - `types.ts`: 論理画面サイズ（`360 × 640`、上部 HUD `56px`）、自機、ハザード（`BULLET` / `LASER` / `BOMB`）、エフェクト、ゲーム状態の型定義。
    - `params.ts`: `src/config/params.toml?raw` を読み込み、スキーマ検証と `Object.freeze` を行って `GAME_PARAMS` を提供する。
    - `hazards.ts`: 脅威レベル計算（`computeThreatLevel`）、ハザードの時間経過更新（`stepHazards`）、通常弾・レーザー・ボムのスポナー群。
    - `geometry.ts`: 自機コア（被弾）およびグレイズリングと各ハザードの距離・接触判定（`evaluateHazardContact`）、グレイズ報酬計算。
    - `game.ts`: 1フレームのゲーム進行（`stepGame`）と Peak Moment スナップショット記録。
- **`src/shell/` (Imperative Shell)**:
  - Canvas 2D 描画（`renderer.ts`）、リザルト画像生成・Web Share API 連携（`share.ts`）、Web Audio シンセサイザー効果音・BGM（`audio.ts`）、センサー権限（`permissions.ts`）、LocalStorage 永続化（`storage.ts`）を担当する。
- **`src/config/params.toml`**:
  - すべてのゲームバランス・ハザード形状・解禁レベル・演出時間パラメータの単一情報源（Single Source of Truth）。新しい調整値を追加する際は、必ず `params.toml`（日本語コメント付き）と `src/core/params.ts` のインターフェースおよび `SCHEMA` を同時に更新すること。

## 2. 通常弾 (`BulletHazard`) の設計規約
1. **発射後の完全等速直線運動**:
  - 進行中に曲がる弾や加減速する弾は理不尽度が高すぎるため採用しない。
  - 花形（`FLOWER`）や星型（`STAR`）などの幾何学弾幕も、発射時の角度に応じた初速ベクトル `(vx, vy)` の配分のみで表現し、発射後（`elapsedMs >= 0`）は固定の `(vx, vy)` で直進させる。
2. **単一モデルによる予兆フェーズ (`elapsedMs < 0`)**:
  - 各 `BulletHazard` は生成時に負の `elapsedMs = -(warningDurationMs + staggerMs)` を持つ。
  - `elapsedMs < 0` の間は発射原点に留まり、`evaluateHazardContact` は常に `{ kind: 'NONE' }` を返す。
  - `stepHazards` で `elapsedMs < 0` から `>= 0` を跨いだフレームでは、超過時間 `nextElapsed / 1000` 秒分のみ `(vx, vy)` で移動させる。
3. **パターン別予兆マーカー (`computeBulletTelegraphProjection` / `renderBulletHazard`)**:
  - 予兆中（`elapsedMs < 0`）の弾は、自身の `(vx, vy)` と `warningDurationMs`（基本予兆＋連射時間差）から飛翔方向へ微小時間投影したゴースト粒＋方向ティックとして描画する。
  - メイン画面（`renderer.ts`）とリザルトカードのハイライト切り抜き（`share.ts`）の両方で `renderBulletHazard` を共通使用する。
4. **発射原点の安全性と視認性**:
  - 壁際発射パターン（`0: LINE`, `1: FAN`, `2: SWEEP`, `3: CROSS`, `5: CURTAIN`）は、予兆が画面外に隠れないようプレイフィールド境界から `edgeInsetMargin`（`18px`）内側を発射原点とする（`pickEdgeInsetSpawnPoint`）。
  - フィールド内発射パターン（`4: RING`, `6: VORTEX`, `7: FLOWER`, `8: LATTICE`, `9: STAR`）は、自機座標から `inFieldMinSafeDistance`（`110px`）以上離れた座標をサンプリングして発射原点とする（`pickInFieldSafeSpawnPoint`）。
5. **段階的解禁と密度スケーリング**:
  - 脅威レベル（`level`、15秒ごとに +1）に応じて `0, 1`（Lv.0+）→ `2, 3`（Lv.1+）→ `4, 5`（Lv.2+）→ `6`（Lv.3+）→ `7`（Lv.4+）→ `8`（Lv.5+）→ `9`（Lv.6+）の順に解禁し、弾数・列数・分割数を段階的に増加させる。
