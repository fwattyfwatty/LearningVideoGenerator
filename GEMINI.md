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

## 4. モデル使い分け・マルチエージェント オーケストレーション方針
役割・有効状態（`enabled`）の正本は **[config/orchestration.yaml](config/orchestration.yaml)** に定義している。制作開始時は `config/orchestration.yaml` で `enabled: true`（かつ T3 Code の `orchestrator_capabilities` で利用可能）なプロバイダのみを選定し、`enabled: false` のプロバイダへは委譲しないこと。

| プロバイダ | 親（オーケストレーター） | 子（図解実装・修正ワーカー） |
| :--- | :--- | :--- |
| **Antigravity** | **Neon** | **Neon**（重章・再設計） / **Hydrogen**（軽章・余白/Lint修正・補助検品） |
| **Claude Code** | **Opus** | **Opus**（複雑設計・原因調査） / **Sonnet**（標準・軽章実装・修正） |
| **Codex** | 非対応（子専用） | **Sol**（重章・再設計） / **Terra**（軽章・余白修正） |

- **親・司令塔（Antigravity `Neon` または Claude Code `Opus`）**: 構成案（`outline.md`）、掛け合い台本（`script.yaml`）、視線誘導プラン（`motion_beats`）を含む図解設計仕様（`scene-specs.json`）、辞書更新（`config/dictionary.yaml` または `episodes/<ep>/dictionary.yaml`）、音声生成・集約ビルド/検証・MP4書き出し、最終目視判定を担当。なお、金融・経済・AIなどの時事トピックでは Stage 1（`outline.md`）の時点で基準時点・最新ニュースの反映範囲を確定させてから Stage 2〜3 へ進むこと。
- **図解実装ワーカーの委譲手段**:
  - **Antigravity が親の場合**: 同系統は `delegate_task`（`providerInstanceId: "antigravity"`）またはネイティブ `invoke_subagent`（`gemini-4-neon` / `gemini-4-hydrogen`）、他プロバイダ（Claude / Codex が `enabled: true` 時）は `delegate_task` を使用。
  - **Claude Code が親の場合**: [CLAUDE.md](CLAUDE.md) と [.claude/skills/produce-episode/SKILL.md](.claude/skills/produce-episode/SKILL.md) に従い、ネイティブ `Agent` ツール（`opus` / `sonnet`）または `delegate_task` を使用（Antigravity 専用の `run_workflow` / `.agents/skills/produce-episode/scripts/*.py` は使用しない）。
- **Stage 3 図解実装の並列粒度・ルーティング（親 Quota 節約＋デザイン統一）**:
  - **標準は「1ワーカー＝2章」の3並列**とする（HTML/JSの章内工程分割は禁止・個別ビルド禁止）：
    - 重4章（Ch2＋Ch3 / Ch4＋Ch5）: 有効プロバイダの `worker_heavy`（Antigravity `Neon` または `Hydrogen high` / Claude `Sonnet medium` または `Opus` / Codex `Sol medium`）。
    - 軽2章（Ch1＋Ch6）: 有効プロバイダの `worker_light`（Antigravity `Hydrogen medium` / Claude `Sonnet low` / Codex `Terra medium`）。
  - **省プロンプトで品質・モーションを引き上げる運用**:
    - 親のプロンプトに長文のデザイン説明を毎回書かず、**「[docs/visual-style-guide.md](docs/visual-style-guide.md)、[templates/diagram-kit.css](templates/diagram-kit.css)、`window.dgMotion`、および必要に応じ `window.dgWidgets` 準拠」** を指示し、必要に応じて **スタイル手本HTML 1ファイル** を指定してトーンと密度を揃える。
- **Stage 4 視覚検品・修正のルーティング**:
  - **一次視覚検品（親直接目視）**: 親（Neon / Opus）が `episode:verify --stage pre`（headless Chrome スモーク含む）と `episode:snapshot` を実行後、自動生成された **`contact-sheet*.jpg`（2〜3枚）を直接目視検品**する（委譲・起床の余分な1ターンと段階表示の誤検知を防ぎつつ、微細な文字折り返しまで正確に拾うため）。異常が疑われる章のみ個別フルHD PNG を追加確認する。
  - **修正が必要な場合のみ委譲**: 軽微な文言・タイミング修正は親が直接編集し、余白・Lint・複数ファイル修正は `worker_light`（Hydrogen / Sonnet / Terra）、座標・タイムライン再設計は `worker_heavy`（Neon / Opus / Sonnet / Sol）を使用する。
- **会話管理・検証の自動化**:
  - 新エピソードは原則新規チャット（または `/compact` 後）で開始し、並列ワーカーに個別ビルドさせず全章完了後に親が1回のみ `episode:build` / `episode:lint` / `episode:verify --stage pre` を集約実行する。
  - MP4書き出し後は `episode:verify --stage post --grid <jpg>` で仕様・音量・全フレーム立ち絵チラつき（`alphaDipFlickers == 0`）を検証し、親はコンタクトシートと最終 2×2 グリッド（1枚）を目視確認する。
- **ルール同期**: Section 1〜3 の共通ルール変更時は [AGENTS.md](AGENTS.md) も同時に更新する。
