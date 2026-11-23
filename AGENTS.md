# LearnVideo ワーカー運用・制作ルール（共通 / Claude・Antigravity 対応）

本ワークスペースは VOICEVOX（四国めたん・ずんだもん・春日部つむぎ）と HyperFrames v0.9.71 で図解解説動画を制作する。本ファイルは T3 Code オーケストレーション（`delegate_task`）上の図解実装ワーカー（Antigravity / 将来の Claude 等）向け共通規約である（Claude 利用時は [CLAUDE.md](CLAUDE.md) も参照）。`run_workflow`・`.agents/skills/produce-episode/SKILL.md` 内の Python ワークフローは Antigravity 専用機能のため、直接のファイル編集と指定範囲の作業のみを行うこと。なお ChatGPT Plus 解約に伴い Codex は現在利用対象外とする。

## 1. キャラクター・VOICEVOXルール
- **四国めたん（教え役・左下）**: 専門知識を分かりやすく説明するが、口調は**標準的な丁寧語（「〜です」「〜ます」「〜ですね」「〜なんです」）**に固定する。「〜ですわ」「〜ますわ」「〜のですわ」などのお嬢様口調は使わない。
- **ずんだもん（聞き手・右下）**: 大学1年生レベルの素人役。素朴な疑問と言い換え（「〜なのだ？」「〜なのだ！」）を20〜30秒に1回程度挟む。
- **春日部つむぎ（ゲスト・右上カットイン）**: 視点の切り替え・コアな疑問役（`mode: "cutin"`）。カットイン枠・字幕ともに**「鋭い質問！」「ちょっと待って！」等の定型バッジ・煽り文言は表示しない**（名前と表情・セリフのみで登場する）。**単なる「場面転換装置」として使わないこと**（チャプター冒頭1行目で直前章の予告を言い換えて話題を切り替える役や、「ちょっと待って。」の機械的連発は禁止）。解説が進んで聞き手が納得した**チャプター中盤（または Phase 1→2 転換点など議論の途中）**に割り込み、直前の説明の前提・盲点・反例を突く鋭い疑問を投げる役として設計する。
- **声調の固定**: VOICEVOX の `style` は全セリフ **`normal` 固定** とし、極端な声調変更（`herohero` 等）は行わない。感情表現は `emotion`（立ち絵差分）で行う。
- **尺と情報量の優先方針**: 動画の総尺（10分前後）はあくまで目安であり、**必要な解説や前提文言を削って無理に短くしない**（トピックに応じて多少長くなってよい）。1セリフが字幕2行目安（全角換算64文字超）を超える場合は、情報を削るのではなく **2セリフに自然分割して** 読みやすさと情報量を両立する。
- **読み辞書**: 共通の英字略語・専門用語は `config/dictionary.yaml` にカタカナ読みを登録し、そのエピソード固有の漢字の専門読み・人名・地名は `episodes/<ep>/dictionary.yaml` で上書き・追加できる（ビルド時に自動マージ）。`nm`, `μm`, `2D/3D` の単位や数値範囲（`2022〜23年`, `3.75〜4.00%`）・`%` は `build-audio.mjs` が自動正規化する。

## 2. HyperFrames v0.9.71 & レイアウト安全領域（1920×1080 / 30fps）
各 `scenes/<chapterId>.html` は [templates/chapter-shell.html](templates/chapter-shell.html) 内の `<main class="diagram-stage layout-{{CHAPTER_LAYOUT}}">` に注入される。以下の固定UI領域と図解・文字が絶対に重ならないよう設計する。

- **テーマ（`meta.theme`）**: `clean-light`（白基調・標準）、`tech-dark`（暗色・AI/数理）、`editorial-warm`（生成り・歴史/教養/法学）、`finance-navy`（濃紺×金・金融/地政学）の4種から選択し、`meta.accent_color` / `meta.badge` で個別調整できる。
- **ヘッダー**: 上端 `y: 0..72`
- **四国めたん立ち絵（左下）**: `x: 12..288`, `y: 814..1080`
- **ずんだもん立ち絵（右下）**: `x: 1648..1908`, `y: 814..1080`
- **字幕ドック（中央下）**: `x: 298..1622`, `y: 890..1064`
- **つむぎカットイン（右上・登場章のみ考慮）**: `x: 1572..1888`, `y: 90..254`（`width: 316px`, `height: 164px`）。登場章では上見出しバーに `.dg-cutin-head`（`padding-right: 360px`）を付け、上段要素に `.dg-cutin-banner`（`width: 73%`）または `.dg-cutin-body`（`padding-top: 86px`）を適用する。
- **下段カード／バナーの安全高**: `layout-wide` / `layout-title` 時は `.dg-wide-safe`（`padding-bottom: 48px`）または `.dg-title-bottom-safe`（左右 `margin: 0 212px`）を用い、めたん・ずんだもん頭頂（`y = 814`）より上の `y < 805` に収める。
- **ビジュアル品質・モーション基準**: 装飾密度・SVG質感・タイポ階層は [docs/visual-style-guide.md](docs/visual-style-guide.md) に従い、[templates/diagram-kit.css](templates/diagram-kit.css) のリッチ部品（`.dg-card-glow`, `.dg-svg-stage`, `.dg-math-box` 等）と外部JS部品 `window.dgMotion`（視線誘導スポットライト・パルス・破線フロー・数値カウント）および `window.dgWidgets`（折れ線・棒・ゲージ・年表・フロー図）を積極活用して「静止画＋フェードだけ」を避ける。

### HyperFrames Lint Error 0 厳守事項
- `<style>` + `<div>` + `<script>` の3構成のみで記述し、`<html>` / `<body>` タグは書かない。`</style>` 〜 `<script>` 間のHTML本体は **230行未満** に保つ。
- `#root` や `.layout-wide` / `.layout-title` を CSS で修飾しない（章プレフィックス `.c1-*`, `.c2-*` 等を使う）。
- アニメーション対象要素の CSS に `transform` を書かない（初期値は `gsap.set()` で与える）。
- `gsap.from()` 禁止（`gsap.set()` + `tl.to()` / `tl.fromTo()` のみ）。
- `autoAlpha` / `display` / `visibility` 禁止（表示切替は `opacity` または `dgMotion.switchPhase` を使い、Phase A→B 切替直後に空白画面区間を作らない）。
- `querySelector` 内にテンプレートリテラル `` `${...}` `` を使わない（`+` 結合を使う）。
- フォントは `"Noto Sans JP"` を使い、アニメーションは `window.__diagramBuilders['<chapterId>'] = function (tl, cues) { ... };` に登録する（`build-episode.mjs` が `dist/vendor/diagram-<chapterId>.js` へ自動分離する）。

## 3. Windows CLI 実行ルール
- PowerShell ではコマンド先頭に必ず `$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH` を付ける。
- **PowerShell 5.1 構文注意**: コマンド連結には `&&` を使わず `; if ($LASTEXITCODE -eq 0) { ... }` を使用する。
- **Windows UTF-8 厳守**: 日本語を含む HTML/YAML/JSON を書き込む際は専用ファイル編集ツール（`apply_patch` 等）を使用し、PowerShell リダイレクト（`>` / `Set-Content` 既定文字コード）による日本語文字化け（`???` 化）を起こさないこと。シェルから書き出す場合は必ず UTF-8（BOMなし）を明示する。
- 主要コマンド（詳細は `package.json` と `docs/production-guide.md` 参照）:
  - `npm run voice:check` / `npm run episode:audio -- <ep>` は VOICEVOX 未起動時にローカルエンジンを自動起動する（無効化は `--no-auto-start` または `VOICEVOX_AUTO_START=0`）。
  - `npm run episode:verify -- <ep> --stage script`（Stage 1 台本・辞書・字幕折り返しの即時検査）
  - `npm run episode:audio -- <ep>` / `npm run episode:build -- <ep>` / `npm run episode:lint -- <ep>`
  - `npm run episode:verify -- <ep> --stage pre`（台本・辞書・Lint に加え、headless Chrome での JSエラー・空白ステージ・安全領域スモーク検査を自動実行。`--no-browser` で省略可）
  - `npm run episode:snapshot -- <ep> --auto -o <dir> --json`（Phase切替直後＋つむぎ＋各章ピーク自動抽出。手動指定時は `--at <CSV> --no-end`）
  - `npm run episode:render -- <ep>`（Windowsでは画面ロック対策として `--no-browser-gpu` とスリープ抑止を既定適用。確認用の `--draft` / `--chapter <id>` / `--segmented`、GPU強制時は `--browser-gpu` を指定）
  - `npm run episode:verify -- <ep> --stage post --grid <jpg>`
- サンドボックス制限がある環境では標準実行を優先し、VOICEVOX 通信や Chrome 起動が必要なコマンドのみ承認付きで再実行する。

## 4. ワーカー運用・デザイン品質＆省トークン規約
- **司令塔配下（T3 Code `delegate_task` / `invoke_subagent`）の作業範囲**: 指定された担当ファイル（標準1〜2章分の `scenes/<chapterId>.html`）の編集、または明示依頼時の検品レポート出力のみを行う。明示的な指示がない限り、**ワーカー単体で `episode:build` / `episode:lint` / `episode:verify` / `episode:render` を個別実行しない**（司令塔が全章完了後に1回だけ集約実行する）。
- **デザイン基準と最小コンテキスト読込（実装・修正モード）**:
  - 読むファイルは **担当章の `scene-specs.json` エントリ、プロンプトで渡された該当章 `cues`（または該当章のみ）、[docs/visual-style-guide.md](docs/visual-style-guide.md)、[templates/diagram-kit.css](templates/diagram-kit.css)、対象テーマCSS、対象HTML、および司令塔から明示指定された場合のみスタイル手本HTML 1ファイル** に限定し、無関係な他章や過去エピソードを一括読み込みしない。
  - 2章まとめて担当する場合は、2章間でカード質感・タイポ・補助色トーンを揃える。軽量章（Ch1・Ch6 等）でもカード縦バランスが崩れないよう `.dg-card-flex` / `.dg-col` を活用し、数字表記は半角（例：`3つの軸`）に統一すること。また `window.dgMotion`（スポットライト減光 `focus`/`unfocus`、連続破線 `flowDash`、鼓動 `pulse`、数値カウント `countUp` 等）や `window.dgWidgets` を積極利用し、静的なフェードだけで終わらせないこと。
  - **モデル / Reasoning Effort 目安**:
    - Antigravity 運用時: 軽章・軽微な余白修正 = `gemini-4-hydrogen (medium)`、重章・設計再調整 = `gemini-4-hydrogen (high)` または `gemini-4-argon (medium)`。
    - 将来の Claude Pro 導入時: 軽章・余白修正 = `claude-haiku-*`（または `claude-sonnet-*` low）、重章（複雑SVG・数式・つむぎ回避・Phase A→B） = `claude-sonnet-* (medium)`、原因調査・大規模再設計 = `claude-opus-*`。
- **視覚検品モード（親から明示委譲された場合のみ / 軽量モデル）**:
  - 原則 Stage 4 のコンタクトシート一次目視は親（Neon）が直接行う。追加で視覚検品を委譲された場合は、指定画像のみを確認し、重なり・見切れ・文字潰れ・空白区間に加え、**極端な余白過多や情報密度不足（スカスカ感）** があれば「時刻・要素・原因・修正案」で簡潔に報告する（編集指示がなければHTMLは一切変更しない）。
- **T3 Code で複数章を直接進める場合**: 1ワーカー2章単位（6章なら3並列）で分割し、最終目視は全PNGではなく `contact-sheet*.jpg` と `--stage post --grid` の2×2画像を優先する。

## 5. ルール同期
Section 1〜3 の共通制作ルールは [GEMINI.md](GEMINI.md) と常に同一内容を維持すること。
