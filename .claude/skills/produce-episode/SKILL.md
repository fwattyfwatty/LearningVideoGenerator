---
name: produce-episode
description: >-
  Orchestrate multi-chapter LearnVideo episode production with Claude Opus as the
  parent orchestrator and Claude Sonnet / Opus (or enabled providers in
  config/orchestration.yaml) for parallel 2-chapter scene authoring, combined with
  unified `episode:verify` and `episode:snapshot --auto`.
---

# Produce Episode (Claude Opus × Sonnet/Opus Orchestration)

このスキルは、Claude Code 上で **親（Opus）** が全体を指揮し、**子（Opus または Sonnet）** による 2章単位の並列実装と自動品質ゲート（`episode:verify` / `episode:snapshot --auto`）を組み合わせて解説動画（5〜15分）を制作するための標準手順です。役割対応・有効プロバイダの正本は [config/orchestration.yaml](../../../config/orchestration.yaml) を参照してください。

> **運用上の前提**:
> - **新規セッション（または `/compact` 後）で着手**し、前エピソードの履歴を引き継がない。
> - **子ワーカー（Agent / `delegate_task`）は担当 `scenes/<chapterId>.html` の編集のみを行い、個別ビルドしない**（全章完了後に親が 1 回だけ集約実行）。
> - **コンタクトシート（`contact-sheet*.jpg`）および最終 `--grid` 画像は親（Opus）が直接 `Read` して目視判定する**。
> - Antigravity 専用の `.agents/skills/produce-episode/scripts/*.py` は使わない。

## ステージ分担

| Stage | 担当 | 実行内容 |
| :--- | :--- | :--- |
| **1. 構成＆台本** | **親 (Opus)** | 基準時点確認（時事回）→ `outline.md` / `script.yaml` / `scene-specs.json` / 辞書作成 → `--stage script` で 0/0 検証 |
| **2. 音声確定** | **親 (Opus)** | `npm run episode:audio -- <ep>` で VOICEVOX 音声生成（未起動時は自動起動）＆ `timeline.json` 確定 |
| **3. 図解並列実装** | **子 (Sonnet / Opus)** | 1ワーカー = 2章の 3並列（`Agent` ツール、または `config/orchestration.yaml` で `enabled: true` の外部プロバイダ）で `scenes/*.html` を生成 |
| **4. 集約検証＆検品** | **親 (Opus)** | `episode:build` → `episode:lint --json` → `episode:verify --stage pre`（Chrome スモーク含む） → `episode:snapshot --auto` → 親が `contact-sheet*.jpg` を直接目視し、必要箇所のみ修正 |
| **5. 書出＆事後検証** | **親 (Opus)** | `npm run episode:render -- <ep>` → `episode:verify --stage post --grid <jpg>` → 2×2 グリッド最終確認後に報告 |

---

## Stage 1: 構成・台本・図解仕様（親 Opus）

1. [AGENTS.md](../../../AGENTS.md) Section 1〜3 の制約を遵守して `episodes/<ep>/outline.md`・`script.yaml`・`dictionary.yaml`（固有読み）・`scene-specs.json` を作成する。
   - **つむぎ運用**: チャプター冒頭 1 行目の場面転換装置にせず、議論が進んだチャプター中盤（または Phase 1→2 転換点等）に割り込み、前提・盲点・反例を突く鋭い疑問を投げる配置にする。
   - **時事トピック**: 金融・経済・AI 等の時事テーマは `outline.md` 段階で基準時点・ニュース反映範囲をユーザーと確定する。
2. 検証コマンド（Windows PowerShell は先頭に `$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH`、連結は `; if ($LASTEXITCODE -eq 0) { ... }`）：

```powershell
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH; npm run episode:verify -- episodes/<ep> --stage script
```

---

## Stage 2: 音声・タイムライン確定（親 Opus）

```powershell
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH; npm run episode:audio -- episodes/<ep>
```

---

## Stage 3: 図解シーン並列実装（1ワーカー = 2章 / 標準 3並列）

1. まず `config/orchestration.yaml` を確認し、`claude.enabled` や有効な外部プロバイダ（例：`antigravity`、`codex`）の指定に従う（`enabled: false` のプロバイダへは委譲しない）。
2. Claude Code 内では **`Agent` ツール**（並列呼び出し）を使って標準 3 ワーカーに分割する（例：軽章 `Ch1+Ch6` に `sonnet`、重章 `Ch2+Ch3` と `Ch4+Ch5` に `sonnet` または `opus`）。
3. 各ワーカーに渡すプロンプト要件：
   - 読むファイルは **担当章の `scene-specs.json` エントリ・`timeline.json` の該当章 `cues`・`docs/visual-style-guide.md`・`templates/diagram-kit.css`・対象テーマ CSS**（＋必要に応じ手本 HTML 1 ファイル）に限定する。
   - `window.dgMotion`（`focus`/`unfocus`, `flowDash`, `pulse`, `countUp`, `switchPhase` 等）および必要に応じ `window.dgWidgets` を積極活用する。
   - 2章間でデザイン・質感・補助色トーンを揃え、軽量章も `.dg-card-flex` / `.dg-col` で縦バランスを確保、見出し等の数字は半角にする。
   - **担当 `scenes/<chapterId>.html` の編集（BOMなし UTF-8）のみ行い、`episode:build` / `lint` / `verify` / `render` を実行しない**。

---

## Stage 4: 集約ビルド・検証・ビジュアル検品（親 Opus）

全ワーカー完了後、親が 1 回だけ以下を連続実行する：

```powershell
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH; `
npm run episode:build -- episodes/<ep>; `
if ($LASTEXITCODE -eq 0) { npm run episode:lint -- episodes/<ep> --json }; `
if ($LASTEXITCODE -eq 0) { npm run episode:verify -- episodes/<ep> --stage pre }; `
if ($LASTEXITCODE -eq 0) { npm run episode:snapshot -- episodes/<ep> --auto -o scratch/<ep>_snapshots --json }
```

- 親（Opus）が `scratch/<ep>_snapshots/contact-sheet*.jpg` を `Read` で直接目視し、文字折り返し・つむぎカットイン重なり・下端はみ出し（`y >= 805`）・空白区間・情報密度不足がないか確認する。
- 軽微な文言/タイミング/余白修正は親が直接修正し、座標・タイムライン再設計のみ子ワーカー（`sonnet` / `opus`）へ再委譲する。修正後は再ビルド＆対象フレームのみ `--at <CSV> --no-end` で再撮影確認する。

---

## Stage 5: 本レンダリング＆最終検証（親 Opus）

```powershell
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH; `
npm run episode:render -- episodes/<ep>; `
if ($LASTEXITCODE -eq 0) { npm run episode:verify -- episodes/<ep> --stage post --grid scratch/<ep>_post_grid.jpg }
```

- `--stage post` で仕様・音量・全フレーム立ち絵チラつき（`alphaDipFlickers == 0`）の `Result: PASS` を確認し、親が `scratch/<ep>_post_grid.jpg` を目視確認してから、MP4 パスと制作サマリーをユーザーへ報告する。
