# LearnVideo 制作ガイド

趣味の勉強テーマをもとに、VOICEVOX 3キャラクターの掛け合いと HyperFrames の動く図解で 10分前後の解説動画（およびシリーズ動画）を作成するための制作ガイドです。

---

## 1. キャラクターの役割と掛け合い指針

| キャラクター | 役割 | 口調・立ち位置 | 画面上の配置 |
| :--- | :--- | :--- | :--- |
| **四国めたん** | 教え役（当該ジャンルのプロフェッショナル） | 標準的な丁寧解説口調（「〜です」「〜ます」「〜ですね」「〜なんです」、お嬢様口調は使わない）。整理された図解を示しながら本質を説明する。 | 左下（立ち絵） |
| **ずんだもん** | 聞き手（大学1年生レベルの素人） | 好奇心旺盛・素朴な疑問（「〜なのだ？」「〜なのだ！」）。視聴者がつまずきやすいポイントを代弁する。 | 右下（立ち絵） |
| **春日部つむぎ** | ゲスト（視点の切り替え・前提を揺さぶる質問役） | フランクで核心を突く口調（「〜じゃないの？」「〜ってこと？」）。解説が進んだチャプター中盤や転換点に割り込み、直前の説明の前提・盲点・反例を突く疑問を投げる（単なる場面転換装置や「ちょっと待って！」の定型連発・煽りバッジ表示はしない）。 | 右上カットイン |

### 掛け合いのコツ
- めたんが3〜4セリフ連続で話し続けないように、**20〜30秒に1回はずんだもんの相槌・質問・言い換え**を挟みます。
- ずんだもんは「つまり〇〇ってことなのだ？」と自分の言葉で言い換える役を担います。
- 春日部つむぎは1動画につき1〜2回、**議論がひと段落したチャプター中盤（または Phase 1→2 転換点等）**に `mode: "cutin"` で登場させ、直前の話を深掘り・相対化する質問を投げます。**チャプター冒頭1行目で話題を切り替えるだけの「場面転換装置」として登場させない**でください（定型煽りラベルも出しません）。
- **声調（`style`）の運用ルール**：VOICEVOX の音声スタイルは原則 `normal` に固定し、極端な声調変更（`herohero` 等）は控えます。感情表現は立ち絵の `emotion` で行います。

---

## 2. 立ち絵の表情（`emotion`）と口パク

`assets/characters/*.zip` のPSD立ち絵から `npm run portraits:export` で書き出した表情差分と口パク（閉/開）を、台本の `emotion` と音声WAVの振幅に応じて自動制御します。

| キャラ | 利用可能な `emotion` |
| :--- | :--- |
| **metan（四国めたん）** | `normal`（デフォルト）, `explain`, `smile`, `surprise`, `serious`, `worry` |
| **zundamon（ずんだもん）** | `normal`（デフォルト）, `question`, `smile`, `surprise`, `worry`, `serious` |
| **tsumugi（春日部つむぎ）** | `sharp`（デフォルト）, `normal`, `smile`, `surprise`, `worry` |

---

## 3. ジャンルに縛られない図解・レイアウト設計

ジャンルが固定されていないため、テンプレートに縛られずテーマやチャプターごとに最適な表現を選びます。

- **`chapter.layout` モード**（チャプター単位で切替可能）：
  - `default`: ヘッダー・白い図解ステージ枠・左右立ち絵・中央字幕の標準レイアウト
  - `wide`: 図解ステージの枠線・背景カード・余白を最小化し、図解・年表・SVGアニメーションを画面いっぱいに広げるレイアウト
  - `title`: タイトル画面・章扉・まとめ向けの開放レイアウト（外枠なしで中央を大きく使用）
- **`meta.theme` / `meta.accent_color` / `meta.badge`**:
  - 利用可能テーマ: `clean-light`（白基調・標準）、`tech-dark`（暗色・AI/数理向け）、`editorial-warm`（生成り・歴史/教養/法学向け）、`finance-navy`（濃紺×金・金融/地政学向け）。
  - `meta.accent_color` でテーマの `--accent-primary` をエピソード単位で上書きでき、`meta.badge`（または `series`）でヘッダー左バッジを指定できます。
- **任意ユーティリティ（`templates/diagram-kit.css` / `templates/diagram-widgets.js`）**: レイアウト部品や安全領域クラス（`.dg-cutin-head`, `.dg-wide-safe` 等）に加え、外部JSチャート部品（`window.dgWidgets`）と視線誘導ヘルパー（`window.dgMotion`）を利用できます。
- **読み辞書（グローバル＋エピソード個別）**: 共通略語は `config/dictionary.yaml` に登録し、そのエピソード固有の漢字の専門読み（例：`翌日物`、`利回り`）や人名・地名は `episodes/<ep>/dictionary.yaml` に書くと自動でマージされます。数値範囲（`2022〜23年`、`3.75〜4.00%`）や単位は `build-audio.mjs` が自動正規化します。

---

## 4. 10分解説の標準チャプター構成（目安）

**10分前後はあくまで目安であり、必要な文言や丁寧な解説を削って短くせず、必要に応じて12〜15分以上になっても構いません。長文セリフになる場合は内容を削らず、2セリフに自然分割してください。**
1本の長いHTMLではなく、**1〜2分程度のチャプター（`ch01_...`, `ch02_...`）に分割**して設計します。

| チャプター例 | 目安尺 | 役割 |
| :--- | :--- | :--- |
| `ch01_intro` | 約1.0分 | 導入・身近な疑問・今日学ぶゴール（全体像の提示） |
| `ch02_core1` | 約2.0分 | 基礎概念・仕組みの前半（ステップ図解） |
| `ch03_core2` | 約2.0分 | 具体例・仕組みの後半（関係図・フロー図解） |
| `ch04_tsumugi` | 約1.5分 | **つむぎカットイン**：鋭い質問・よくある誤解・深掘り |
| `ch05_practice` | 約2.0分 | 応用・比較・メリット/デメリット整理 |
| `ch06_summary` | 約1.5分 | 全体のまとめ・次回の予告（シリーズの場合） |

---

## 5. ディレクトリ・シリーズ管理ルール

- **単発動画**: `episodes/001_topic_name/`
- **シリーズ動画**: `episodes/series_xxx/ep01_topic_name/`, `episodes/series_xxx/ep02_topic_name/`

1つのエピソードフォルダは以下の構成にします。

```text
episodes/<episode_path>/
├── outline.md          # 構成案・プロット（任意）
├── script.yaml         # 掛け合い台本（唯一の正）
├── scenes/             # チャプターごとの図解HTML（<chapterId>.html）
├── audio/              # 自動生成されるWAV＆差分キャッシュ（Git管理外）
├── timeline.json       # 自動計算されたタイムライン（編集不要）
├── dist/               # ビルドされたHyperFrames用プロジェクト（自動生成）
└── output/             # 完成MP4 ＆ credits.txt
```

---

## 6. `script.yaml` スキーマ（Phase 3 拡張版）

```yaml
meta:
  title: "動画タイトル"
  series: "シリーズ名（任意）"
  episode: "第1回（任意）"
  badge: "シリーズ名（任意：ヘッダー左バッジ上書き）"
  theme: "clean-light"       # clean-light | tech-dark | editorial-warm | finance-navy
  accent_color: "#2563eb"    # 任意: --accent-primary を上書き
  bgm:                       # 任意: assets/bgm/ に実在する場合のみ再生
    file: "study_lofi.mp3"
    volume: 0.14
    fade_in: 1.0
    fade_out: 2.0
  fps: 30
  width: 1920
  height: 1080

chapters:
  - id: "ch01_intro"
    title: "1. チャプター見出し"
    layout: "default"        # 任意: default | wide | title
    lines:
      - speaker: metan       # metan | zundamon | tsumugi
        style: normal        # 任意: VOICEVOX スタイル名
        emotion: explain     # 任意: 立ち絵表情
        mode: normal         # 任意: cutin（つむぎカットイン枠を表示）
        se:                  # 任意: 文字列 "pop.wav" または { file, volume, offset }
          file: "pop.wav"
          volume: 0.5
        caption: "画面に表示する字幕テキスト"
        voice_text: "任意: 読み上げ専用テキスト（未指定なら辞書置換を自動適用）"
        cue: "show_overview" # 任意: 図解アニメーション発火キー
        pause_after: 0.4     # 任意: このセリフ後の間（秒）
```

---

## 7. 制作コマンド一覧

`npm run voice:check` と `npm run episode:audio` は、VOICEVOX 未起動時にローカルエンジン（ヘッドレス `run.exe` 優先）を自動起動します（自動起動を無効化する場合は `--no-auto-start` または `VOICEVOX_AUTO_START=0` を指定）。

```powershell
# 初回・立ち絵追加時: PSDから表情×口パクPNGを一括書き出し
npm run portraits:export

# 0. Stage 1 台本・辞書・字幕折り返し即時チェック（HTML実装前に実行可能）
npm run episode:verify -- episodes/000_pilot --stage script

# 1. VOICEVOX Engine の疎通確認（未起動なら自動起動）とキャラクターID検証
npm run voice:check

# 2. 音声生成（差分キャッシュ）＆ 口パク計測 ＆ timeline.json / credits.txt 自動生成
npm run episode:audio -- episodes/000_pilot

# 3. HyperFrames 用プロジェクトを dist/ へビルド
npm run episode:build -- episodes/000_pilot

# 4. コンポジション構造のチェック（lint / check）
npm run episode:lint -- episodes/000_pilot

# 5. スナップショット確認（ビルド後：--auto でPhase切替直後・つむぎ・ピークを自動抽出）
npm run episode:snapshot -- episodes/000_pilot --auto -o tmp_snap --json
# 任意時刻を指定する場合:
npm run episode:snapshot -- episodes/000_pilot --at 5,20 --no-end -o tmp_snap --json

# 6. 一括検証（台本/辞書/Lint/ブラウザ実行スモーク/推奨スナップショット時刻/MP4画質・音量・チラつき検査）
npm run episode:verify -- episodes/000_pilot --stage pre
# ブラウザスモーク検査をスキップする場合:
npm run episode:verify -- episodes/000_pilot --stage pre --no-browser
npm run episode:verify -- episodes/000_pilot --stage all

# 7. ブラウザでライブプレビュー
npm run episode:preview -- episodes/000_pilot

# 8. MP4 レンダリング（output/<episode>.mp4 に出力。Windowsでは画面ロック対策で --no-browser-gpu ＆ スリープ抑止を既定適用）
npm run episode:render -- episodes/000_pilot
# 高速確認用のドラフト品質（15fps・--chapter併用時は24fps / draft品質 / *_draft.mp4）
npm run episode:render -- episodes/000_pilot --draft
# 特定チャプターのみ確認レンダリング / 分割レジューム対応
npm run episode:render -- episodes/000_pilot --chapter ch01_intro --draft
npm run episode:render -- episodes/000_pilot --segmented
# ブラウザGPU（D3D11）を明示利用したい場合
npm run episode:render -- episodes/000_pilot --browser-gpu
```

---

## 8. ルール永続化とマルチエージェント オーケストレーション

- 常時適用ルールはルートの [GEMINI.md](../GEMINI.md) および [AGENTS.md](../AGENTS.md)（Claude 利用時は [CLAUDE.md](../CLAUDE.md)）に定義しています。
- 大規模エピソード制作時は T3 Code 上で設計・台本を **Gemini 4 Neon**、チャプター別 HTML の並列図解生成を **Antigravity（Hydrogen / Argon）または将来の Claude Pro（Claude Sonnet / Haiku）** へ 2章×3並列で委譲し、コンテキスト消費と制作時間を抑えます（Codex は利用停止中。[produce-episode SKILL](../.agents/skills/produce-episode/SKILL.md) も参照）。
