---
name: produce-episode
description: >-
  Orchestrate multi-chapter LearnVideo episode production with a Gemini 4 Neon
  (architect/scriptwriter/final judge) and Gemini 4 Hydrogen / flash (parallel
  scene authoring & snapshot visual audit) workflow, combined with unified
  verification via `npm run episode:verify`. Use when creating or iterating on
  multi-chapter explainer episodes under `episodes/`.
---

# Produce Episode (Antigravity Orchestration)

このスキルは、Antigravity 上で長尺解説動画（5〜15分・複数チャプター）を最小コンテキスト＆最小クォータ消費で制作・検証するための標準手順です（プロバイダ別の役割と有効設定の正本は [config/orchestration.yaml](../../../config/orchestration.yaml)、Claude Code 利用時は [CLAUDE.md](../../../CLAUDE.md) と [.claude/skills/produce-episode/SKILL.md](../../../.claude/skills/produce-episode/SKILL.md) を参照してください）。

> **省クォータ運用の前提**:
> - **新規チャット（または `/compact` 後）で着手**し、前エピソードの重い履歴を引き継がない。
> - **並列ワーカーは担当HTML編集のみ行い、個別ビルドしない**（全章完了後に親が 1 回だけ集約ビルド）。
> - **Stage 4 コンタクトシート（`contact-sheet*.jpg`）および Stage 5 `--grid` 画像は親（Neon）が直接目視確認**し、必要に応じて `run_workflow` の Python 補助スクリプトも利用できる。

## 全体分担（親 = Neon / 並列ワーカー = Neon または Hydrogen、有効時は他プロバイダも可）

| Stage | 担当 | 実行内容 |
| :--- | :--- | :--- |
| **1. 構成＆台本** | **親 (Neon)** | 基準時点確認（時事回）→ `outline.md` → `script.yaml` → `scene-specs.json` → `episode:verify --stage script` で 0/0 検証。 |
| **2. 音声確定** | **親 (Neon)** | `npm run episode:audio -- <ep>` で VOICEVOX 音声（未起動時は自動起動）・WAV・`timeline.json`・`cues` を生成。 |
| **3. 図解並列実装** | **子 (`Neon` / `Hydrogen` 等)** | 1ワーカー = 2章の 3並列（T3 `delegate_task` / `invoke_subagent`、または [author_scenes.py](./scripts/author_scenes.py)）で `scenes/*.html` を生成。 |
| **4. 事前検証＆検品** | **親 (Neon)** | 親が `episode:build` / `episode:lint --json` / `episode:verify --stage pre`（Chrome スモーク含む） / `episode:snapshot --auto` を実行し、`contact-sheet*.jpg` を直接目視して必要箇所のみ修正。 |
| **5. 書出＆最終検証** | **親 (Neon)** | `npm run episode:render -- <ep>` 後、`npm run episode:verify -- <ep> --stage post --grid <jpg>` で仕様・音量・全フレーム立ち絵チラつきを検査。 |

> **サンドボックス境界に関する注意**: `run_workflow` 内のエージェントはユーザー承認が必要な `BypassSandbox: true` コマンドを実行できません。そのため **VOICEVOX（`episode:audio`）および Chrome 起動（`episode:snapshot`, `episode:render`）は必ず親エージェントが直接実行** してください。

---

## Stage 1: 構成・台本・図解スペック作成（Neon）

1. [GEMINI.md](../../../GEMINI.md) のキャラ口調（めたん標準丁寧語・`style: normal` 固定・つむぎ煽りバッジなし）に沿って `script.yaml` を作成する。
2. 続けて `<episodeDir>/scene-specs.json` を作成し、各チャプターの視覚構成を簡潔に定義する（1チャプターあたり15〜25行程度で十分）：

```json
{
  "theme": "tech-dark",
  "accent_color": "#0284c7",
  "chapters": [
    {
      "id": "ch01_intro",
      "layout": "title",
      "has_tsumugi_cutin": false,
      "visual_plan": "上段タイトル、左右2カラム（スマホ→SoCズーム＆世代別個数 / ナノスケール比較バー）、下段に3目標ピル（左右立ち絵を避けて margin: 0 212px）。",
      "phase_transitions": []
    }
  ]
}
```

---

## Stage 2: 音声・タイムライン確定（親）

VOICEVOX Engine 起動確認後、以下を実行（サンドボックス失敗時は同一 `toolSummary` で `BypassSandbox: true`）：

```powershell
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH; npm run episode:audio -- <episodeDir>
```

---

## Stage 3: 図解シーン並列生成＆ビルド・Lint（`author_scenes.py`）

`run_workflow` で [scripts/author_scenes.py](./scripts/author_scenes.py) を呼び出します。

- **入力 `Args`**:
  - `episode_dir`: 例 `"episodes/002_next_topic"`
  - `specs_path`: （任意）デフォルト `"<episode_dir>/scene-specs.json"`
  - `model`: （任意）デフォルト `"flash"`（軽量ワーカーを使用）
  - `skip_existing`: （任意）デフォルト `true`（完成済み `scenes/*.html` をスキップし途中再開可能）
- **動作**:
  1. `timeline.json`（各章の実時間・`cues` 一覧）と `scene-specs.json` を読み込む。
  2. チャプターごとに独立した `agent(model="flash")` を `parallel` で起動し、[references/scene-constraints.md](./references/scene-constraints.md) に従って `scenes/<chapter_id>.html` のみを生成（各ワーカーは個別ビルドせず編集のみ実施）。
  3. ワークフロー末尾で `episode:build` と `episode:lint --json` を1回実行し、Lint エラー・警告が残った章だけ `parallel` で修正して再ビルドし `errorCount: 0, warningCount: 0` に収束させる。

---

## Stage 4: 事前一括検証・スナップショット撮影・並列ビジュアル検品

1. 親が標準サンドボックスで `episode:verify --stage pre` を実行し、台本・辞書・Lintと `[SNAPSHOT --at]` 推奨タイムスタンプCSVを取得する：
   ```powershell
   $env:PATH = 'C:\Program Files\nodejs;' + $env:PATH; npm run episode:verify -- <episodeDir> --stage pre
   ```
2. 親が `episode:snapshot` を実行し、`scratch/<ep>_snapshots/` にPNGを保存する（サンドボックスで試した後、`BypassSandbox: true` で再実行）：
   ```powershell
   $env:PATH = 'C:\Program Files\nodejs;' + $env:PATH; npm run episode:snapshot -- <episodeDir> --at <CSV> --no-end -o "<scratchDir>/<ep>_snapshots" --json
   ```
3. 親が撮影結果のPNGパスをチャプター別に振り分け、`run_workflow` で [scripts/audit_snapshots.py](./scripts/audit_snapshots.py) を実行する（`Args`: `episode_dir`, `chapter_frames`, `model="flash"`, `auto_fix=true`）。
   - 各チャプターワーカーは **自分の担当する2〜3枚のPNGだけ** を `read_file` で確認し、問題があれば各ワーカーがHTML編集のみ行った後、ワークフロー末尾で1回だけ再ビルド・再Lintして `recheck_at_csv` を返す。
   - 修正があった場合のみ、親は返された `recheck_at_csv` で対象フレームだけ再撮影し、生成された **`contact-sheet.jpg`（1枚）** を `read_file` で確認して完了する（個別PNGがさらに必要な異常時のみ開く）。

---

## Stage 5: 本レンダリング＆最終検証（親）

1. 本レンダリング（サンドボックス確認後に `BypassSandbox: true`）：
   ```powershell
   $env:PATH = 'C:\Program Files\nodejs;' + $env:PATH; npm run episode:render -- <episodeDir>
   ```
2. 一括事後検証＋2×2確認グリッド生成（標準サンドボックスで動作）：
   ```powershell
   $env:PATH = 'C:\Program Files\nodejs;' + $env:PATH; npm run episode:verify -- <episodeDir> --stage post --grid "<scratchDir>/<ep>_final_grid.jpg"
   ```
   - `ffprobe` 仕様一致、`volumedetect` 音量・クリッピングなし、全フレーム立ち絵チラつき（`alphaDipFlickers == 0`）を検証。
   - もし `alphaDipFlickers > 0` が報告された場合のみ、親（Neon）が該当時刻前後のフレームを切り出して調査する。
3. 生成された **2×2確認グリッド画像（`<scratchDir>/<ep>_final_grid.jpg` 1枚）** を `read_file` で最終目視確認し、問題がなければユーザーへリンク付きで報告する。
