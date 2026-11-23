# LearnVideo Claude 運用ガイド

本ファイルは Claude（Claude Code / Claude Agent / T3 Code `claudeAgent` 等）で LearnVideo の制作・図解実装に参加する際のエントリポイントです。

## 必読ルールと最小コンテキスト読込

1. キャラ口調・VOICEVOX 制約・安全領域・HyperFrames Lint Error 0 厳守事項・Windows CLI ルールの共通規約は **[AGENTS.md](AGENTS.md)（および同一の Section 1〜3 を持つ [GEMINI.md](GEMINI.md)）を常に遵守**してください。
2. 図解の装飾密度・モーショングラフィックス（`window.dgMotion` / `window.dgWidgets`）・共有 SVG アイコンの仕様は **[docs/visual-style-guide.md](docs/visual-style-guide.md)** と **[templates/diagram-kit.css](templates/diagram-kit.css)** に従ってください。
3. コンテキスト肥大とトークン消費を抑えるため、無関係な他章や過去エピソードを一括読み込みせず、担当章の `scene-specs.json` エントリ・該当章の `cues`・対象テーマ CSS・対象 HTML のみを読んで編集してください。

## 主な注意点（抜粋）

- **ワーカー担当時の作業範囲**: 指定された担当ファイル（標準 1〜2 章分の `scenes/<chapterId>.html`）の編集のみを行い、個別で `episode:build` / `episode:lint` / `episode:verify` / `episode:render` を実行しないこと（親が全章完了後に集約実行します）。
- **春日部つむぎの役割**: つむぎは**単なる場面転換装置として使わず**（チャプター冒頭1行目で話題を切り替えるだけ・機械的な「ちょっと待って。」の連発は不可）、議論の中盤・納得の後に前提を揺さぶる鋭い疑問や反例を投げる役として扱います。
- **Windows UTF-8 厳守**: 日本語を含む HTML/YAML/JSON は専用のファイル編集ツールを使い、BOM なし UTF-8 で保存して文字化け（`???` 化）を起こさないこと。
- **HyperFrames Lint Error 0**: `<style>` + `<div>` + `<script>` の 3 構成、HTML 本体 230 行未満、`gsap.from()` / `autoAlpha` / `display` / `visibility` / CSS `transform`（アニメ対象要素） / `querySelector` 内テンプレートリテラル禁止、ビルダーは `window.__diagramBuilders['<chapterId>'] = function (tl, cues) { ... };` に登録すること。
