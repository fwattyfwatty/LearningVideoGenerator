# LearnVideo ビジュアルスタイルガイド（シーン実装ワーカー共通レシピ）

本ガイドは、親（Antigravity `Neon` または Claude Code `Opus`）から長文のデザイン指示を書かなくても、Antigravity（`Neon` / `Hydrogen`）・Claude Code（`Opus` / `Sonnet`）・Codex（`Sol` / `Terra`）等のシーン実装ワーカーが一貫して**見栄え・情報密度・視認性・動きのある視線誘導**を備えた図解シーンを制作するための標準レシピである。安全領域・Lint禁止事項は [AGENTS.md](../AGENTS.md) / [GEMINI.md](../GEMINI.md) / [CLAUDE.md](../CLAUDE.md) に従う。

---

## 1. 視覚密度・レイアウト品質の基準（スカスカ防止）

- **超ミニマル実装の禁止**: 枠と短いテキスト数行だけで終わる画面は避け、カード内部を「見出し行（タイトル＋タグ）→ 図解SVGまたは比較リスト → 要点/数式ボックス」の**2〜3層構造**で構成する。
- **HTML本体行数の目安**（`</style>`〜`<script>` 間、**230行未満を厳守**）:
  - 導入・まとめなど軽い章: **35〜90行** 目安
  - 仕組み・比較・2フェーズ章: **80〜200行** 目安
  - ※ 複雑な折れ線・棒グラフ・年表・フロー図は後述の `window.dgWidgets` を呼べば HTML 行数消費ゼロで高密度描画できる。
- **ステージ占有率**: 有効ステージ領域の **75〜88%** を意味のある図解・カードで自然に満たす。主要コンテナには `display: flex; flex-direction: column; height: 100%;` と `flex: 1; min-height: 0;` を使い、画面中央に小さな箱がポツンと浮く状態を避ける。
- **冒頭・つむぎ質問中の空白防止**: チャプター開始 1〜2 秒以内にメイン図解の枠または初期カードを必ず表示し、つむぎ質問中や導入セリフ中に画面の下半分が空のまま数秒続く状態を作らない。
- **左右バランス**: 2カラム比較では「旧方式 / 課題（左）」と「新方式 / 本質（右）」でカード高さを揃え、主役側を `.dg-card-glow` と太めのアクセント枠で明確に際立たせる。

---

## 2. タイポグラフィ ＆ コントラスト階層（1920×1080）

| 要素 | フォントサイズ | Weight | 配色目安（`tech-dark`・`finance-navy` / `clean-light`・`editorial-warm`） |
| :--- | :---: | :---: | :--- |
| ヒーロー見出し（Ch1 等） | `38px〜42px` | `900` | `var(--text-primary)` ＋重要語のみ `.dg-text-accent` |
| チャプター内見出し | `28px〜32px` | `800` | `var(--text-primary)` |
| カード見出し | `22px〜25px` | `800` | `var(--text-primary)` |
| 本文・ノード・数式 | `18px〜24px` | `700〜800` | `var(--text-primary)` |
| 補足・タグ・SVG軸ラベル | `15px〜17px` | `700` | `var(--text-secondary)`（**`14px`未満は潰れるため原則禁止**） |

- 暗色テーマ（`tech-dark` / `finance-navy`）で暗いグレー文字（`#64748b` 等）を本文に使わず `var(--text-primary)` / `var(--text-secondary)` を使う。明色テーマ（`clean-light` / `editorial-warm`）では白〜淡グレー背景上で淡色文字を使わず、濃色（`#0f172a` / `#1c1917` 等）で高コントラストを保つ。

---

## 3. カラー配分（主役1色＋補助2色の原則）

- **主役色（`var(--accent-primary)`）**: 新技術・注目軌道・ゴール・強調数式・発光オーブ・主役カードに使用。
- **補助色①（`var(--accent-warn)` / `var(--accent-danger)`）**: 従来方式の限界・ボトルネック・誤差蓄積・インフレ警戒・リスクタグに使用。
- **補助色②（`var(--accent-ok)` / `var(--accent-secondary)`）**: 収束・解決策・並列処理・緩和/成長下支え・補助グラデーションに使用。
- 1画面で無関係な原色を乱立させず、テーマCSS変数と `color-mix()` の濃淡で奥行きを出す。

---

## 4. SVG ＆ 視線誘導モーショングラフィックス規約（`window.dgMotion`）

**「登場フェードだけで数秒間静止」を避け、視聴者の視線が今話している要素に自然と吸い寄せられる動きを作る。**
`templates/stage-runtime.js` が全チャプターに提供する `window.dgMotion` を積極的に活用すること（すべて HyperFrames シーク完全決定的・Lint 安全）：

1. **視線誘導ヘルパー `window.dgMotion` 一覧**:
   - **`dgMotion.reveal(tl, target, atTime, opts)`**: 要素を下からふわっと表示（`{ y: 14, duration: 0.42, stagger: 0.12 }`）。
   - **`dgMotion.focus(tl, activeTarget, groupTarget, atTime, opts)` / `dgMotion.unfocus(tl, groupTarget, atTime)`**:
     - `groupTarget` 内の他要素を `dimOpacity`（既定 `0.48`）へ落とし、話している `activeTarget` のみ `opacity: 1`＋光輪/強調にするスポットライト演出（`{ until: cues.next_cue }` で自動復元も可。SVG要素には座標ズレを防ぐため `scale` を使わず `filter: drop-shadow` を自動適用）。
   - **`dgMotion.pulse(tl, target, startTime, endTime, opts)`**: 注目ノード・要点バッジ・グラフ強調点を `[startTime, endTime]` のあいだ穏やかに鼓動させ、終了時に元の状態へ戻す。
   - **`dgMotion.drawPath(tl, pathTarget, atTime, opts)`**: 折れ線・軌道・年表軸を `strokeDashoffset` で描画。
   - **`dgMotion.flowDash(tl, pathTarget, startTime, endTime, opts)`**: 矢印やパイプラインの破線を連続スクロールさせ、「今どこに何が流れているか」を数秒間見せ続ける。
   - **`dgMotion.countUp(tl, textTarget, fromVal, toVal, atTime, opts)`**: 数値・KPI・パーセントを滑らかにカウントアップ（`{ decimals: 2, suffix: '%' }`）。
   - **`dgMotion.barGrow(tl, barTarget, atTime, opts)`**: 比較バー（`.dg-bar-fill`）を左端基準で伸縮。
   - **`dgMotion.switchPhase(tl, outTarget, inTarget, atTime, opts)`**: Phase A→B を同時に切り替え、空白画面区間ゼロを保証。
2. **SVGの器と質感**:
   - SVG図解は `.dg-svg-stage` の内側に配置し、`viewBox` を明示して `width: 100%; height: 100%;` で収める。
   - **水平・垂直の直線パス（高さまたは幅が0）に `linearGradient` を `stroke` 指定しない**（デフォルト `objectBoundingBox` ではバウンディングボックスが潰れて線が消えるため、`gradientUnits="userSpaceOnUse"` または単色 `stroke` を使う）。
   - 数式中の Unicode 結合文字（`ᾱ`・`ε̃` 等）は `Noto Sans JP` で上記号が右ずれしやすいため使わない。
   - **禁止事項再確認**: アニメ対象要素の CSS に `transform` を書かない／`gsap.from()`・`autoAlpha`・`display`・`visibility`・`querySelector` 内バッククォート禁止。

---

## 5. `templates/diagram-kit.css` リッチ部品＆安全領域クラス

各章HTMLは [templates/diagram-kit.css](../templates/diagram-kit.css) が自動注入済みのため、独自CSSを肥大化させず以下を優先活用する：

| クラス | 用途 |
| :--- | :--- |
| `.dg-hero-badge` + `.dg-hero-dot` / `.dg-hero-title` + `.dg-text-accent` | 導入・タイトル画面の主見出し構成 |
| `.dg-card` / `.dg-card-glow` / `.dg-card-flex` | 通常カード / 主役用強調カード / 縦スペース自動伸縮フレックス（Ch1・Ch6 等） |
| `.dg-card-head` + `.dg-card-title` | 下線付きカード見出し行（右側にピルを配置） |
| `.dg-card-head-left` / `.dg-card-title-group` | ピルなし時にアイコン＋見出しが左右分離しない左寄せ／グループ用クラス |
| `.dg-pill-muted` / `.dg-pill-accent` / `.dg-pill-ok` / `.dg-pill-warn` / `.dg-pill-danger` | ステータス・比較・フェーズ用の角丸タグ |
| `.dg-svg-stage` | SVG図解を収めるほのかな放射背景付きステージ枠 |
| `.dg-math-box` + `.dg-math-formula` + `.dg-math-note` | 数式・漸化式・目的関数を際立たせるインセット枠 |
| `.dg-chip-row` + `.dg-chip` / `.dg-chip-accent` | モデル名・ゴール一覧・次回テーマ候補チップ群 |
| `.dg-bar-track` + `.dg-bar-fill`（`-warn` / `-ok`） | GSAP `scaleX` / `dgMotion.barGrow` 対応の比較バー |
| `.dg-node` / `.dg-node-accent` / `.dg-term-hl` | フローチャート用の角丸ノードボックス / 本文中キーワード強調 |
| `.dg-callout`（`-ok` / `-warn` / `-danger`） | 左ライン強調の要点コールアウト |
| `.dg-cutin-head` / `.dg-cutin-body` / `.dg-cutin-banner` | つむぎカットイン（右上）自動回避用の見出し右余白・上余白・73%幅バナー |
| `.dg-wide-safe` / `.dg-title-bottom-safe` | `layout: wide` 下端 48px 安全余白 / `layout: title` 下部左右 212px 安全余白 |

- `.dg-card p` / `.dg-card-glow p` / `.dg-callout` / `.dg-node` / `.dg-note` には 1〜2文字孤立改行を抑える `word-break: keep-all; overflow-wrap: anywhere; text-wrap: pretty;` を既定適用している。見出し等の数字は半角（例：`3つの原則`）に統一すること。

---

## 6. 共有 SVG アイコン部品 ＆ 標準矢じりマーカー（26種・崩れ防止）

ループ矢印や定型アイコンを手計算の円弧・パスで描くと曲率や矢じり比率が崩れやすいため、ビルド時に自動注入される [templates/svg-icons.svg](../templates/svg-icons.svg) の共有 `<symbol>` を `<use>` 1行で呼び出すこと。

### 利用可能な共有アイコン（すべて `24×24` / `stroke="currentColor"`）
| カテゴリ | ID 一覧 |
| :--- | :--- |
| **動作・変化** | `#dg-ico-loop`（2弧循環）, `#dg-ico-rotate`（1回転）, `#dg-ico-arrow-lr`（双方向・対比）, `#dg-ico-trending-up`（上昇）, `#dg-ico-trending-down`（下降）, `#dg-ico-zap`（衝撃・高速） |
| **テック・科学** | `#dg-ico-cpu`（チップ・計算）, `#dg-ico-layers`（多層・積層）, `#dg-ico-grid`（格子・パッチ）, `#dg-ico-bot`（AI・ロボット）, `#dg-ico-sparkles`（生成・創発）, `#dg-ico-image`（画像）, `#dg-ico-flask`（実験・科学） |
| **経済・社会・政治** | `#dg-ico-landmark`（中央銀行・政府）, `#dg-ico-building`（企業・都市）, `#dg-ico-coins`（通貨・資金）, `#dg-ico-scale`（均衡・法制度）, `#dg-ico-globe`（世界・国際）, `#dg-ico-users`（雇用・市民・市場） |
| **思考・制約・時間** | `#dg-ico-shield`（安全網・防衛・信頼）, `#dg-ico-alert`（警告・リスク）, `#dg-ico-clock`（時間・タイムラグ）, `#dg-ico-sliders`（条件・政策調整）, `#dg-ico-target`（目標・焦点）, `#dg-ico-compass`（指針・ルール）, `#dg-ico-book`（知識・制度・歴史） |

- **呼び出し例（1行・色自動追従）**:
  `<use href="#dg-ico-landmark" x="48" y="24" width="36" height="36" color="var(--accent-primary)"/>`
- **回転アニメーションさせる場合**: `<g id="c4-loop-spin"><use href="#dg-ico-loop" x="286" y="56" width="88" height="88" color="#1d4ed8"/></g>` とし、GSAP 側で `svgOrigin: "330 100"`（アイコン中心座標）を指定して `rotation: 360` で回す（CSS `transform` は書かない）。

### 標準矢じり `<marker>` スニペット（巨大化防止）
- 矢じりには必ず **`markerUnits="userSpaceOnUse"`** を付け、`stroke-width` に引きずられて三角が巨大化・潰れるのを防ぐ：
  ```xml
  <marker id="c2-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
    <path d="M2 2.5 L10 6 L2 9.5" fill="none" stroke="#1d4ed8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  </marker>
  ```

---

## 7. 汎用データ可視化ウィジェット（`window.dgWidgets`）

[templates/diagram-widgets.js](../templates/diagram-widgets.js) が全チャプターに自動読み込みされる。経済・統計・歴史年表・プロセスフローを HTML 行数を増やさず高密度に描画したい場合は、`__diagramBuilders` の先頭でコンテナ要素（例：`<div id="c3-chart" class="dg-svg-stage"></div>`）へ直接生成する：

- **`dgWidgets.lineChart(container, tl, { mode: 'line'|'step', points: [{ label, value, sub, badge, highlight, at }], yMin, yMax, yTicks, yUnit, at, duration, highlightAt, pulseEnd })`**: 折れ線／階段チャート（自動 `drawPath` ＋強調点 `pulse`）。
- **`dgWidgets.barChart(container, tl, { items: [{ label, value, max, text, sub, tone, at }], max, unit, countUp, at, stagger })`**: 水平比較バー＋オプション数値カウントアップ。
- **`dgWidgets.gauge(container, tl, { zones: [{ label, sub, color }], initialAngle, moves: [{ angle, at, duration }], centerLabel })`**: 半円ダイヤルゲージ（`svgOrigin` 回転針）。
- **`dgWidgets.timeline(container, tl, { items: [{ tag, title, desc, tone, at }], focusEach, unfocusAt, at, stagger })`**: 横型年表（軸描画＋順次登場＋注目フォーカス。長めの `desc` は最大2行へ自動折り返し＋文字サイズ自動調整）。
- **`dgWidgets.flowNodes(container, tl, { nodes: [{ title, sub, icon, tone, at }], flowStart, flowEnd, focusEach, unfocusAt })`**: 横並びフロー図（アイコン付きノード＋`flowDash` 連続流れ矢印。長めの `sub` は最大2行へ自動折り返し＋文字サイズ自動調整）。

---

## 8. スタイル手本（Few-Shot）参照のルール

- 親エージェントから**スタイル手本HTML 1ファイル**（例：そのエピソードで先に作成した `ch01_intro.html`、または過去作の代表1ファイル）が明示指定された場合のみ、その1ファイルを「装飾密度・SVGの描き込み量・余白バランス」の基準として参照してよい。
- 指定のない他章や過去エピソードの一括読み込みは引き続き禁止する。
