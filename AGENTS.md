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
    - `tips.ts`: プレイ前Tips（`GAME_TIPS`）の選定および開始難易度計算。ゲームのルール・スコアリング・ハザード挙動・操作等の仕様変更を行った際は、ユーザーの理解を促すため、必ず `GAME_TIPS` もそれに合わせて追加・更新すること（`tests/core/game.test.ts` のTipsテストも同時に更新する）。
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
6. **1発あたりのグレイズ上限 (`maxGrazeTicks`)**:
  - 通常弾を追従してノーリスクで稼ぎ続ける行為を防止するため、通常弾1発から得られるグレイズティック数に上限（`params.bullet.maxGrazeTicks`）を設ける。上限到達後は被弾（コア接触）判定のみを残し、グレイズ判定（スコア・倍率加算、コンボゲージ維持、火花演出）は完全に打ち切る。

## 3. リザルトカード・ハイライト表示 (`share.ts`) の設計規約
1. **アスペクト比保持と均一スケーリング**:
  - 縦長の論理ゲーム画面（`360 × 640`）に対してリザルトカード（`600 × 400`）は横型であるため、上下の見切れを許容したうえで均一スケーリング（`PEAK_SCALE = 1.35`）で描画する。画面のアスペクト比を歪めてカードに押し込んではならない。
2. **3段階の切り抜きカメラ優先順位 (`computeClampedPeakCamera`)**:
  - **優先度1（最優先）**: 自機がリザルトカードの右半分（可視領域内 `[338..579] × [21..379]`）に必ず収まること。
  - **優先度2**: 優先度1が満たされる範囲で、ピーク表示領域全体（枠内 `[210..589] × [11..389]`）にプレイ画面を隙間なく表示すること（端に黒帯・余白を出さない）。
  - **優先度3**: 優先度1・2が満たされる範囲で、自機をピーク表示の中央 `(455, 200)` に表示すること。
3. **左側グラデーションによるテキスト保護と境界線隠蔽**:
  - リザルトカード左側の統計テキストの視認性を保つため、紙背景色（`PALETTE.bg`）の線形グラデーションを重ねる。
  - プレイフィールド左端（`x = 0`）がカード上に投影される座標 + マージンまで背景色の不透明度 100% を保ち、そこから右へフェードアウトさせることで、プレイフィールド左端の切り抜き境界がうっすら見える現象を完全に防ぐ。
4. **枠外はみ出し防止とマージンマスク**:
  - Canvas 2D（特にモバイル WebKit の GPU ラスタライズ）において、大半径ストローク（ボムの衝撃波・予告リング等）やアンチエイリアスがクリップ境界を跨いで滲み出ることがある。
  - これを防ぐため、ワールド座標での交差クリッピングに加え、外枠（`CARD_FRAME`）を描画する直前に枠外マージン（`x: 0..10`, `x: 590..600`, `y: 0..10`, `y: 390..400`）を背景色で塗りつぶす（マージンマスク）。
  - バッジ（`PEAK PTS/s` 等）の背景も不透明な `PALETTE.bg` とし、背後のハザードが透けないようにする。

## 4. 開発環境・ランタイムおよび実機検証サーバーの運用
1. **ランタイムとツールの絶対パス**:
  - 非対話型シェル環境では PATH が不足する場合があるため、以下の絶対パスを優先して直接呼び出す。
    - Node: `/Users/handlename/.local/share/mise/shims/node`
    - Bun: `/Users/handlename/.local/share/mise/shims/bun`
    - Git: `/usr/bin/git`
2. **スマホ実機検証用 HTTPS 開発サーバー**:
  - iOS Safari 等のスマートフォンブラウザでジャイロセンサー（`DeviceMotionEvent` / `DeviceOrientationEvent`）やリザルトカード描画を検証するには、セキュアコンテキスト（HTTPS）が必須となる。
  - プロジェクトルートの `certs/key.pem` / `certs/cert.pem` を使用して Vite HTTPS サーバーを起動する:
    ```bash
    /Users/handlename/.local/share/mise/shims/node ./node_modules/vite/bin/vite.js --config vite.https.config.ts
    ```
  - デフォルトでポート `5174`（`https://<LAN-IP>:5174/` や Tailscale IP）で待ち受ける。エージェントが実行する際はバックグラウンドタスク（`IsDaemon: true`）として常駐させ、ホットリロードにより即時実機確認できるようにする。
3. **テスト・型検査・ビルドコマンド**:
  - 単体テスト: `/Users/handlename/.local/share/mise/shims/node ./node_modules/vitest/vitest.mjs run`
  - 特定テスト実行: `/Users/handlename/.local/share/mise/shims/node ./node_modules/vitest/vitest.mjs run tests/share.test.ts`
  - 型チェック: `/Users/handlename/.local/share/mise/shims/node ./node_modules/typescript/bin/tsc --noEmit`
  - 本番ビルド: `/Users/handlename/.local/share/mise/shims/node ./node_modules/vite/bin/vite.js build`

