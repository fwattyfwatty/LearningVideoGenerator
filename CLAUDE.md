# LearnVideo Claude Code 運用ガイド（親 Opus / 子 Opus・Sonnet 兼用）

本ファイルは **Claude Code / Claude Agent** が LearnVideo の制作・図解実装に参加する際のエントリポイントです。プロバイダ別の役割・有効状態・Stage 担当の正本は **[config/orchestration.yaml](config/orchestration.yaml)** に定義しています。

## 共通ルール（必須・親/子ともに遵守）

1. **共通制作ルール**: キャラ口調（めたん標準丁寧語・`style: normal` 固定・つむぎは場面転換装置にせず中盤の鋭い疑問役）・安全領域（1920×1080）・HyperFrames Lint Error 0・Windows CLI 規約（PowerShell の `$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH` と BOM なし UTF-8）は **[AGENTS.md](AGENTS.md)**（Section 1〜3 は [GEMINI.md](GEMINI.md) と完全同一）を常に遵守する。
2. **図解デザイン基準**: 装飾密度・`window.dgMotion` / `window.dgWidgets`・共有 SVG アイコン 26 種・`.dg-card-flex` 等の部品は **[docs/visual-style-guide.md](docs/visual-style-guide.md)** と **[templates/diagram-kit.css](templates/diagram-kit.css)** に従う。
3. **スキル / ワークフロー境界**: Antigravity 専用の `run_workflow`（[.agents/skills/produce-episode/scripts/](.agents/skills/produce-episode/scripts/)）は使わず、Claude Code では **[.claude/skills/produce-episode/SKILL.md](.claude/skills/produce-episode/SKILL.md)** に従う。

---

## A. 親オーケストレーター（Claude Opus）として制作を指揮する場合

ユーザーが新エピソード制作や全体修正を依頼した場合、Claude Code（**Opus**）は司令塔として Stage 1〜5 を主導する。

1. **利用可能ワーカーの確認**: [config/orchestration.yaml](config/orchestration.yaml) の `enabled: true` 設定を確認し、T3 Code 上で動かす場合は `orchestrator_capabilities` で利用可能な外部プロバイダも確認する（`enabled: false` のプロバイダへは委譲しない）。
2. **Stage 1（構成・台本・図解仕様）**:
   - `outline.md` / `script.yaml` / `scene-specs.json` / `dictionary.yaml` を作成する。
   - 時事トピック（金融・経済・AI 等）は `outline.md` 段階で基準時点と最新ニュース反映範囲をユーザーと確定させてから Stage 2〜3 へ進む。
   - `npm run episode:verify -- <ep> --stage script` で 0 エラー・0 警告を確認する。
3. **Stage 2（音声・タイムライン確定）**:
   - `npm run episode:audio -- <ep>` を親が直接実行する（VOICEVOX Engine 未起動時は自動起動）。
4. **Stage 3（図解 HTML の並列生成 — 1ワーカー = 2章の 3 並列）**:
   - Claude Code 標準の `Agent` ツールで並列ワーカーを起動する（重章グループ＝`model: "sonnet"` または `"opus"`、軽章グループ＝`model: "sonnet"`）。T3 Code 上で外部プロバイダも有効な場合は `config/orchestration.yaml` に従って `delegate_task` で併用可。
   - ワーカーへのプロンプトには担当章の `scene-specs.json`・`timeline.json` の該当章 `cues` のみ・参照スタイルファイル（`docs/visual-style-guide.md` / `templates/diagram-kit.css` / 対象テーマ CSS）を明示し、**ワーカー単体で build/lint/verify/render させない**。
5. **Stage 4（集約ビルド・ブラウザスモーク・直接目視検品）**:
   - 全章完了後に親（Opus）が 1 回だけ `episode:build` → `episode:lint --json`（`0/0`）→ `episode:verify --stage pre`（headless Chrome スモーク含む）→ `episode:snapshot --auto -o <dir> --json` を実行する。
   - 生成された **`contact-sheet*.jpg` を親（Opus）が直接 Read ツールで目視確認**し、軽微修正は親が直接編集、大規模修正のみ子ワーカー（`sonnet` / `opus`）へ再委譲する。
6. **Stage 5（MP4 書き出し・事後検証）**:
   - `npm run episode:render -- <ep>`（Windows 画面ロック対策済み）→ `npm run episode:verify -- <ep> --stage post --grid <jpg>` を実行し、最終 2×2 グリッドを目視確認してからユーザーへ報告する。

---

## B. 子ワーカー（Claude Opus / Sonnet）として担当章を実装する場合

親（Opus / Neon）から特定の `scenes/<chapterId>.html`（標準 1〜2 章）または検品/修正を委譲された場合は、以下を厳守する。

- **担当範囲限定**: 指定されたファイルのみを編集し、明示指示がない限り `episode:build` / `episode:lint` / `episode:verify` / `episode:render` を実行しない。
- **最小コンテキスト読込**: 対象章の spec・`cues`・[docs/visual-style-guide.md](docs/visual-style-guide.md)・[templates/diagram-kit.css](templates/diagram-kit.css)・対象テーマ CSS・対象 HTML のみを読む（無関係な他章や過去作を一括読み込みしない）。
- **Lint Error 0 & レイアウト安全**: HTML 本体は 230 行未満、アニメ対象要素に CSS `transform` 禁止、`gsap.from()` / `autoAlpha` / `display` / `visibility` / `querySelector` 内バッククォート禁止、ピルなし見出しは `.dg-card-title-group` / `.dg-card-head-left`、軽量章のカード縦バランスに `.dg-card-flex` / `.dg-col`、見出し等の数字は半角（例：`3つの原則`）を使用する。
- **2 章まとめて担当時**: 2 章間でカード質感・タイポ・補助色トーンを揃える。
