# LearnVideo ワークスペース制作ルール

本ワークスペースでは、VOICEVOXキャラクター（四国めたん・ずんだもん・春日部つむぎ）と HyperFrames v0.9.71 による図解解説動画を制作する。以下の制約を常に遵守すること。

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

## 4. モデル使い分け・T3 Code オーケストレーション方針（Gemini 4 Neon × Antigravity / 将来の Claude Pro 対応）
大規模エピソード制作時はクォータ消費・コンテキスト肥大を抑えるため、T3 Code 上の親・司令塔（Gemini 4 Neon）配下で並列図解ワーカーを使い分ける。

- **Codex（利用停止中）**: ChatGPT Plus 解約済みのため、**現在は Codex（`codex` / `gpt-*`）を使用しない**（`orchestrator_capabilities` に残っていても選択・委譲禁止）。
- **親・司令塔（Gemini 4 Neon）**: 構成案（`outline.md`）、掛け合い台本（`script.yaml`）、視線誘導プラン（`motion_beats`）を含む図解設計仕様（`scene-specs.json`）、辞書更新（`config/dictionary.yaml` または `episodes/<ep>/dictionary.yaml`）、音声生成・集約ビルド/検証・MP4書き出し、最終目視判定を担当。なお、金融・経済・AIなどの時事トピックでは Stage 1（`outline.md`）の時点で基準時点・最新ニュースの反映範囲を確定させてから Stage 2〜3 に進むこと。
- **図解実装ワーカーの委譲手段（T3 Code 優先）**:
  - **現在（Antigravity / Gemini 系）**: 軽〜標準章の並列生成は `delegate_task`（`providerInstanceId: "antigravity"`, `model: "gemini-4-hydrogen"` または `"gemini-4-argon"`）またはネイティブ `invoke_subagent`（`Model: "flash"` / `"pro"`）を使用。
  - **将来の Claude Pro 有効化時**: `orchestrator_capabilities` で `claudeAgent` が利用可能になった場合は、`delegate_task`（`providerInstanceId: "claudeAgent"`, `driverKind: "claudeAgent"`）で `claude-sonnet-*`（標準） / `claude-haiku-*`（軽章・余白修正） / `claude-opus-*`（複雑設計・原因特定）を並列図解ワーカーとして利用できる（[CLAUDE.md](CLAUDE.md) 参照）。
- **Stage 3 図解実装の並列粒度・ルーティング（親 Quota 節約＋デザイン統一）**:
  - **標準は「1ワーカー＝2章」の3並列**とする（HTML/JSの章内工程分割は禁止・個別ビルド禁止）：
    - 例（Antigravity 現在運用）: 軽2章（Ch1＋Ch6）に `gemini-4-hydrogen`（`thought_level: "medium"`）×1、重4章（Ch2＋Ch3 / Ch4＋Ch5）に `gemini-4-hydrogen`（`thought_level: "high"`）または `gemini-4-argon`（`thought_level: "medium"`）×2。
    - 例（将来の Claude Pro 導入時）: 軽2章に `claude-haiku-*`（または `claude-sonnet-*` low）×1、重4章に `claude-sonnet-*`（`effort: "medium"`）×2。
  - **省プロンプトで品質・モーションを引き上げる運用**:
    - 親のプロンプトに長文のデザイン説明を毎回書かず、**「[docs/visual-style-guide.md](docs/visual-style-guide.md)、[templates/diagram-kit.css](templates/diagram-kit.css)、`window.dgMotion`、および必要に応じ `window.dgWidgets` 準拠」** を指示し、必要に応じて **スタイル手本HTML 1ファイル** を指定してトーンと密度を揃える。
- **Stage 4 視覚検品・修正のルーティング**:
  - **一次視覚検品（親直接目視）**: 親が `episode:verify --stage pre`（headless Chrome スモーク含む）と `episode:snapshot` を実行後、自動生成された **`contact-sheet*.jpg`（2〜3枚）は親（Gemini 4 Neon）が直接目視検品**する（委譲・起床の余分な1ターンと段階表示の誤検知を防ぎつつ、微細な文字折り返しまで正確に拾うため）。異常が疑われる章のみ個別フルHD PNG を追加確認する。
  - **修正が必要な場合のみ委譲**: 軽微な文言・タイミング修正は親が直接編集し、余白・Lint・複数ファイル修正は `gemini-4-hydrogen`（または将来の `claude-haiku-*` / `claude-sonnet-*` low）、座標・タイムライン再設計は `gemini-4-argon`（または将来の `claude-sonnet-*` medium / `claude-opus-*`）を使用する。
- **会話管理・検証の自動化**:
  - 新エピソードは原則新規チャット（または `/compact` 後）で開始し、並列ワーカーに個別ビルドさせず全章完了後に親が1回のみ `episode:build` / `episode:lint` / `episode:verify --stage pre` を集約実行する。
  - MP4書き出し後は `episode:verify --stage post --grid <jpg>` で仕様・音量・全フレーム立ち絵チラつき（`alphaDipFlickers == 0`）を検証し、親はコンタクトシートと最終 2×2 グリッド（1枚）を目視確認する。
- **ルール同期**: Section 1〜3 の共通ルール変更時は [AGENTS.md](AGENTS.md) も同時に更新する。
