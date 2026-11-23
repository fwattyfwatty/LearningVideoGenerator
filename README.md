# LearnVideo

VOICEVOX の 3 キャラクター（四国めたん・ずんだもん・春日部つむぎ）による掛け合い解説音声と、**HyperFrames** (`v0.9.71`) + GSAP の図解アニメーションを組み合わせて 1920×1080 / 30fps の図解解説動画（MP4）を制作するためのワークスペースです。

## 主な特徴

- **台本駆動の音声・口パク・タイムライン自動生成**: `script.yaml` と読み辞書（`config/dictionary.yaml` + エピソード固有 `dictionary.yaml`）から VOICEVOX 音声・リップシンク区間・`timeline.json`・`credits.txt` を差分キャッシュ付きで自動生成します。
- **HyperFrames 図解ステージ ＆ 4テーマ**: `clean-light` / `tech-dark` / `editorial-warm` / `finance-navy` のテーマと、共通コンポーネント（`templates/diagram-kit.css`・`window.dgMotion`・`window.dgWidgets`・共有 SVG アイコン 26 種）により図解を統一品質で制作できます。
- **多段階の自動品質ゲート**: 台本・字幕幅検査（`--stage script`）、Lint・headless Chrome 実行スモーク検査（`--stage pre`）、フェーズ切替・カットイン自動スナップショット（`episode:snapshot --auto`）、音声レベル・全フレーム立ち絵チラつき検査（`--stage post`）を備えています。
- **Windows 画面ロック耐性・確認用レンダオプション**: `episode:render` は Windows 環境で既定の `--no-browser-gpu` とスリープ抑止を適用し、`--draft` / `--chapter <id>` / `--segmented` で柔軟に確認・書き出しができます。

## ディレクトリ構成

```text
LearnVideo/
├── config/                  # キャラ定義・辞書・テーマ CSS (4種)・エージェント役割設定 (orchestration.yaml)
├── templates/               # HyperFrames 共通シェル・diagram-kit.css・stage-runtime.js・dgWidgets
├── tools/                   # VOICEVOX 生成・HyperFrames ビルド/実行・多段階検証・立ち絵書出
├── docs/                    # 制作ガイド (production-guide.md)・図解スタイルガイド (visual-style-guide.md)
├── episodes/                # 各エピソードの outline.md / script.yaml / scene-specs.json / scenes/*.html
├── assets/                  # 立ち絵・BGM・SE 配置先（実素材・生成物は .gitignore で除外）
├── GEMINI.md / AGENTS.md    # AI エージェント向け共通制作ルール（セクション 1〜3 共通）
└── CLAUDE.md                # Claude Code（親 Opus / 子 Opus・Sonnet）向け運用ガイド
```

## 必要環境

- **Node.js**: 22+（`npm install` で `hyperframes` / `gsap` / `js-yaml` を導入）
- **ffmpeg / ffprobe**: 音声処理・動画検証（`--stage post`）で使用
- **VOICEVOX Engine**: ローカルエンジン（標準ポート `50021`、`voice:check` / `episode:audio` 実行時に未起動なら自動起動対応）
- **uv + Python**（立ち絵 PNG 書き出し時のみ）: `npm run portraits:export` で `psd-tools` / `pillow` を一時利用

## クイックスタート

```bash
# 1. Node 依存関係のインストール
npm install

# 2. 立ち絵 ZIP を assets/characters/ に配置後、表情×口パク PNG を書き出し
# （配置ファイル名の詳細は assets/characters/README.md を参照）
npm run portraits:export

# 3. VOICEVOX Engine の疎通確認（未起動なら自動起動）と speaker ID 検証
npm run voice:check
```

## エピソード制作パイプライン

```bash
# Stage 1: 台本・辞書・字幕折り返し即時チェック（HTML実装前に実行可能）
npm run episode:verify -- episodes/006_asset_management --stage script

# Stage 2: 音声生成（差分キャッシュ）・口パク計測・timeline.json / credits.txt 生成
npm run episode:audio -- episodes/006_asset_management

# Stage 3-4: ビルド・Lint・事前一括検証（headless Chrome 実行スモーク含む）
npm run episode:build -- episodes/006_asset_management
npm run episode:lint -- episodes/006_asset_management
npm run episode:verify -- episodes/006_asset_management --stage pre

# 推奨時刻の自動スナップショット＆コンタクトシート生成（--no-browser でブラウザ検査省略可）
npm run episode:snapshot -- episodes/006_asset_management --auto -o scratch/snap --json

# ブラウザでライブプレビュー
npm run episode:preview -- episodes/006_asset_management

# Stage 5: MP4 レンダリング ＆ 事後検証（音量・仕様・立ち絵チラつき・2×2グリッド）
npm run episode:render -- episodes/006_asset_management
npm run episode:verify -- episodes/006_asset_management --stage post --grid scratch/post_grid.jpg

# 高速確認用のドラフト／チャプター限定／セグメント分割レジューム出力
npm run episode:render -- episodes/006_asset_management --draft
npm run episode:render -- episodes/006_asset_management --chapter ch01_intro --draft
npm run episode:render -- episodes/006_asset_management --segmented
```

## 収録エピソード（台本・図解ソース・構成案）

リポジトリには作成済みの台本・設計仕様・図解 HTML 一式が含まれています（音声 WAV・ビルド済み `dist/`・出力 MP4 は `.gitignore` により除外）。

- `episodes/000_pilot` — パイロット回（Web の仕組み基礎）
- `episodes/001_semiconductor_scaling` — 半導体微細化の限界と最新技術（`tech-dark`）
- `episodes/002_looped_transformer` — Looped Transformer 入門（`tech-dark`）
- `episodes/003_diffusion_models` — 拡散モデルと拡散 LLM（`tech-dark`）
- `episodes/004_monetary_policy` — 日米欧中の金融政策（`clean-light`）
- `episodes/005_reserve_currency` — 基軸通貨の変遷と多極化（`finance-navy`）
- `episodes/006_asset_management` — 会社員のための資産運用入門（`editorial-warm`）

## ドキュメント・エージェント運用規約

- [制作ガイド](docs/production-guide.md) — キャラ役割、レイアウトモード、コマンド一覧
- [ビジュアルスタイルガイド](docs/visual-style-guide.md) — 図解密度、`window.dgMotion`、`window.dgWidgets`、共有アイコン
- [役割設定 (config/orchestration.yaml)](config/orchestration.yaml) — Antigravity（親 Neon / 子 Neon・Hydrogen）、Claude Code（親 Opus / 子 Opus・Sonnet）、Codex（子 Sol・Terra）の有効状態・モデル割当定義
- [GEMINI.md](GEMINI.md) / [AGENTS.md](AGENTS.md) / [CLAUDE.md](CLAUDE.md) — 共通制作ルール（Section 1〜3）およびオーケストレーター/ワーカー規約
- スキル定義: [Antigravity 用](.agents/skills/produce-episode/SKILL.md) / [Claude Code 用](.claude/skills/produce-episode/SKILL.md)

## クレジット・外部素材について

- 音声合成には [VOICEVOX](https://voicevox.hiroshiba.jp/)（四国めたん・ずんだもん・春日部つむぎ）を使用しています。生成エピソードごとの利用クレジットは `episodes/<ep>/output/credits.txt` に出力されます。
- キャラクター立ち絵・BGM・SE などの第三者素材、および生成済みの音声・動画バイナリは再配布規約や容量の観点から Git 管理に含めていません。ご自身の環境で利用規約を確認のうえ配置・生成してください。
