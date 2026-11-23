# Episode 003 構成案：Diffusion Modelの進化とこれから

## 1. 動画メタ設計

### タイトル案
1. **Diffusion Modelの進化とこれから：ノイズから世界を描くAIの軌跡と未来**（推奨・王道）
2. **【図解】Diffusion Modelはどう進化した？DDPM・DiT・Flow Matchingから拡散LLM・世界モデルまで**（技術網羅・検索向け）
3. **なぜ「ノイズ除去」で画像も動画も文章も作れるのか？Diffusion Modelの仕組みと未来**（導入フック重視）

### 映像・トンマナ設定（`script.yaml` 想定）
- **エピソードフォルダ**: `episodes/003_diffusion_models/`
- **シリーズ**: `AIアーキテクチャ入門`（Episode 002 `Looped Transformer` に続く回）
- **目標総尺**: **約10分（全6チャプター・約75セリフ目安）**
- **テーマ**: `tech-dark`
- **アクセントカラー**: `#14b8a6`（ティール：Ep001のブルー `#0284c7`・Ep002のバイオレット `#8b5cf6` と差別化し、ノイズ粒子から構造へ収束する軌道を見やすく表現。補助色としてアンバー・バイオレットを部分活用）
- **キャラクター・VOICEVOX 方針**（`style: normal` 固定・感情は立ち絵 `emotion` で表現）:
  - **四国めたん（左下・教え役）**: 標準的な丁寧語（「〜です」「〜ます」「〜ですね」「〜なんです」／お嬢様口調禁止）。確率過程・アーキテクチャ変遷・最新動向を図解と数式で整理。
  - **ずんだもん（右下・聞き手／大1レベル）**: 「砂嵐から絵が出てくるなんて魔法みたいなのだ！」等の素朴な疑問と言い換えを20〜30秒に1回挟む。
  - **春日部つむぎ（右上カットイン・視点切替／核心質問役）**: Ch4・Ch5・Ch6 に `mode: "cutin"` で登場。定型煽りバッジ（「鋭い質問！」等）は表示せず、名前・表情・セリフのみで自然に登場。

---

## 2. 全体タイムライン構成表 ＆ モデル分担計画（GEMINI.md / AGENTS.md 準拠）

| Ch | ID / 見出し | 目安尺 | `layout` | つむぎ | 難易度 | Stage 3 実装担当目安 | 核となるメッセージ |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| **1** | `ch01_intro`<br>導入：ノイズを消すだけで創れる理由 | 約1.0分 | `title` | なし | **軽** | Hydrogen (`flash`) または Codex 6.1 Terra (`medium`) | GAN・ARとの違いと「壊す逆再生で彫刻する」拡散モデルの直感＋3本柱の提示。 |
| **2** | `ch02_core_evolution`<br>土台と第1次進化：DDPM → LDM ＆ CFG | 約2.0分 | `default` | なし | **重** | Codex 6.2 Sol (`medium`) または Hydrogen | Phase A: Forward/Reverse とノイズ予測 $\epsilon_\theta$。Phase B: 潜在空間圧縮（LDM）と条件誘導（CFG）。 |
| **3** | `ch03_dit_flow`<br>第2次進化：U-Net → DiT ＆ Flow Matching | 約2.0分 | `wide` | なし | **重** | Codex 6.2 Sol (`medium`) または Hydrogen | Phase A: U-Netからスケーラブルな DiT へ。Phase B: 曲がる確率拡散から直線軌道の Flow Matching ＆ 数ステップ蒸留へ。 |
| **4** | `ch04_tsumugi_walls`<br>つむぎの質問：拡散モデルに残る3つの壁 | 約1.8分 | `default` | **あり** | **重** | Codex 6.2 Sol (`medium`) | Phase A: 推論コストと物理整合性（誤差蓄積）。Phase B: VAE圧縮の細部限界・編集制御・電子透かし等の安全性課題。 |
| **5** | `ch05_frontier_future`<br>これから：拡散LLM・世界モデル・AR融合 | 約2.2分 | `wide` | **あり** | **重** | Codex 6.2 Sol (`medium`) | Phase A: 離散拡散LLM（LLaDA・Mercury・Gemini Diffusion）の並列テキスト生成。Phase B: 拡散型ワールドモデル・ロボット制御・AR×Diffusion統一基盤。 |
| **6** | `ch06_summary`<br>まとめ：生成AIの「共通エンジン」へ | 約1.0分 | `default` | **あり** | **軽** | Hydrogen (`flash`) または Codex 6.1 Terra (`medium`) | 3ポイント総括と次回テーマ候補。 |

### 工程別オーケストレーション分担
- **Stage 1（構成・台本・図解スペック・辞書更新）**: **親（Gemini 4 Neon）** が `outline.md` → `script.yaml` → `scene-specs.json` → `config/dictionary.yaml` を作成。
- **Stage 2（音声・タイムライン確定）**: **親（Gemini 4 Neon）** が VOICEVOX 疎通確認のうえ `npm run episode:audio` を実行。
- **Stage 3（図解シーン実装）**: 1章＝1ワーカー（HTML/JS分割禁止・個別ビルド禁止）。軽い章（Ch1, Ch6）は `Hydrogen (flash)` または `Codex 6.1 Terra (medium)`、重い章（Ch2〜Ch5：複雑SVG・数式・Phase A→B切替・つむぎ回避）は `Codex 6.2 Sol (medium)`（残クォータに応じて一部 `Hydrogen`）へ章単位ルーティング。全章完了後に親が1回のみ `episode:build` & `episode:lint` を集約実行。
- **Stage 4（事前検証・視覚検品・修正）**: 親が `episode:verify --stage pre` & `episode:snapshot` を実行 → 検品のみ `Codex 6.1 Terra (low)` または `Hydrogen` → 指摘修正は軽微余白/Lintなら `6.1 Terra (low〜medium)` / `6.2 Sol (low)`、座標・タイムライン再調整は `6.2 Sol (medium)` → 親は `contact-sheet*.jpg` を優先目視。
- **Stage 5（本レンダリング・事後検証）**: **親（Gemini 4 Neon）** が `episode:render` → `episode:verify --stage post --grid` → 2×2確認グリッド目視で完了判定。

---

## 3. 各チャプター詳細プロット ＆ HyperFrames 図解設計

### Chapter 1: 導入「ノイズを消すだけで世界が浮かび上がる」（約1.0分 / `layout: title` / 難易度: 軽）
- **学習ゴール**: 拡散モデルがなぜ GAN を抜いて生成AIの主役になったのか、「ノイズから少しずつ削り出す反復生成」の直感をつかむ。
- **掛け合い骨子**:
  - **ずんだもん**: 最近の画像・動画AIのリアルさに驚き「1ピクセルずつ絵を描いているのだ？」と質問。
  - **めたん**: かつての主流 GAN は学習不安定やモード崩壊が課題だったが、2020年以降の主役 **Diffusion Model** は「きれいな画像をノイズで壊す工程を逆再生する」発想で高品質と多様性を両立したと紹介。
  - **ずんだもん**: 「壊すのを巻き戻すだけで新しい絵が作れるなんて逆転の発想なのだ！」
  - **めたん**: 本日の3本柱（①基本原理と潜在空間、②DiT & Flow Matching 革命、③拡散LLM・世界モデルへ広がる未来）を提示。
- **図解＆安全領域設計**:
  - 上段ヒーローバッジ＋タイトル。
  - 中段2カラム：左に生成手法比較カード（GAN / AR / Diffusion）、右にノイズ粒子群がステップ $x_T \to \dots \to x_0$ で鮮明な図形へ収束する SVG アニメーション。
  - 下段3ゴールピル（左右立ち絵 `y=814` 回避のため `margin: 0 212px`）。

### Chapter 2: 土台と第1次進化「DDPM → 潜在拡散（LDM）＆ CFG」（約2.0分 / `layout: default` / 難易度: 重）
- **学習ゴール**: ノイズ予測 $\epsilon_\theta$ というシンプルな学習目標と、一般普及を決定づけた「潜在空間圧縮（LDM）」と「条件誘導（CFG）」を理解する。
- **Phase A（DDPMの基本原理）**:
  - **Forward Process**: 元データ $x_0$ にガウスノイズ $\epsilon$ を段階的に加える（閉形式 $x_t = \sqrt{\bar{\alpha}_t}\,x_0 + \sqrt{1-\bar{\alpha}_t}\,\epsilon$）。
  - **Reverse Process**: モデル $\epsilon_\theta(x_t, t)$ が「混ざったノイズ」を予測して引き算を繰り返し、データ分布の山へ登る（スコア $\nabla_x \log p(x)$ の直感）。
  - **ずんだもん**: 「絵そのものを一発で当てるんじゃなくて、邪魔なノイズだけ見つけて引き算するから安定するのだ！」
- **Phase B（実用化を爆発させた2大発明）**:
  - **Latent Diffusion Model（LDM / Stable Diffusion, 2022）**: 高解像ピクセル空間ではなく、VAE で圧縮した小さな**潜在空間 $z$** で拡散することで計算量を激減させ、普及の起爆剤に。
  - **Classifier-Free Guidance（CFG）& Cross-Attention**: 条件なし予測 $\epsilon_\varnothing$ とテキスト条件付き予測 $\epsilon_c$ の差を増幅する $\tilde{\epsilon} = \epsilon_\varnothing + w(\epsilon_c - \epsilon_\varnothing)$ によりプロンプト追従性を飛躍的に向上（ControlNet 等の構造制御にも言及）。
- **図解＆安全領域設計**:
  - Phase A: Forward（右向きノイズ付加）と Reverse（左向き $\epsilon_\theta$ 除去ループ）の対向フローSVG＋数式ボックス。
  - Phase B（`opacity` 切替・空白区間ゼロ）: 左カード「ピクセル空間 vs VAE潜在空間 $z$ 圧縮パイプライン」、右カード「CFG ガイダンス強度 $w$ のベクトル合成SVG」。

### Chapter 3: 第2次進化「U-NetからDiTへ、そしてFlow Matching革命」（約2.0分 / `layout: wide` / 難易度: 重）
- **学習ゴール**: 現代の主流（SD3 / FLUX / 動画拡散モデル群）が「U-Net＋曲がった確率拡散」から「DiT＋直線軌道の Flow Matching」へ置き換わった技術的必然を理解する。
- **Phase A（骨格の交代：U-Net → DiT / MMDiT）**:
  - 畳み込みベースの **U-Net** は局所構造に強い一方、大規模化でのスケーリングや動画・マルチモーダル統合に制約があった。
  - **DiT（Diffusion Transformer, 2023）** は潜在表現をパッチ列にして標準 Transformer で処理（`adaLN-Zero` で時刻 $t$ と条件 $c$ を注入）。計算量に応じて素直に性能が伸びるスケーリング則と、画像・動画・テキストを統一処理（MMDiT）できる拡張性を獲得。
- **Phase B（軌道の革命：SDE拡散 → Flow Matching / Rectified Flow ＆ 蒸留）**:
  - 従来の DDPM はノイズから画像までの経路が曲がりくねり、数十〜1000ステップの反復が必要だった。
  - **Flow Matching / Rectified Flow**: ノイズ $x_0$ とデータ $x_1$ を**直線補間** $x_t = (1-t)x_0 + t x_1$ で結び、速度場 $v_\theta(x_t, t) \approx x_1 - x_0$ を直接学習。真っ直ぐ進めるため推論ステップが劇的に減少。
  - さらに **Consistency Model / Few-Step Distillation（蒸留）** を組み合わせ、1〜4ステップでの超高速生成へ進化。
- **図解＆安全領域設計**（`layout: wide`・`.c3-phase { padding-bottom: 48px; }` で `y < 805` 厳守）:
  - Phase A: 左「U-Net 構造」vs 右「DiT パッチ化＋Transformer＋右肩上がりスケーリング曲線SVG」。
  - Phase B: 2D位相空間の軌道比較SVG（曲がりくねった SDE 経路 vs 直線の Flow Matching ベクトル場）＋ステップ数圧縮バー（1000 → 50 → 20 → 1〜4 steps）。

### Chapter 4: つむぎの質問「拡散モデルに残る3つの壁」（約1.8分 / `layout: default` / つむぎカットイン / 難易度: 重）
- **学習ゴール**: 華やかな進化の裏で未解決の課題（推論負荷・物理法則と長期一貫性・圧縮限界と安全性）を客観的に整理する。
- **掛け合い骨子**:
  - **つむぎ（カットイン①）**: 「すごく綺麗に進化してるのは分かったけど、動画が途中で破綻したり、生成にコストがかかったりする問題はまだ残ってるよね？何が壁なの？」
  - **めたん**: 構造的な3つの壁を解説。
  - **ずんだもん**: 「見た目は本物そっくりなのに、重力や物体の連続性が途中でズレちゃうことがあるのだ！」
  - **つむぎ（カットイン②）**: 「あと、ディープフェイク対策や著作権、電子透かしみたいな社会側の課題も大きいよね」
- **Phase A（壁① 計算コスト＆蒸留トレードオフ / 壁② 物理理解と長期誤差蓄積）**:
  - 反復計算に伴う推論レイテンシ・電力コストと、極端なステップ削減時の多様性・細部低下のトレードオフ。
  - 動画が長尺化すると誤差が蓄積して物体が消える・物理法則が崩れる課題（見た目の統計模倣と物理因果理解のギャップ）。
- **Phase B（壁③ VAE圧縮ボトルネック・精密編集・安全性）**:
  - VAE 圧縮による細かい文字や指先の崩れ（画素空間への回帰研究も進行中）。
  - 局所だけ厳密に書き換える制御の難しさと、電子透かし・来歴証明（C2PA）・著作権対応の必要性。
- **図解＆安全領域設計**（つむぎ右上枠 `x: 1572..1888, y: 90..254` を完全回避：`padding-right: 360px` + 両フェーズ上段 `padding-top: 86px`）:
  - Phase A: 左「ステップ数 vs 品質・多様性トレードオフ曲線SVG」、右「時間経過 $t_1 \to t_2 \to t_3$ で生じる長期誤差蓄積・物理破綻ダイアグラム」。
  - Phase B: 3課題カード（① VAE圧縮と細部再現、② 精密編集・因果制御、③ 安全性・電子透かし・C2PA）。

### Chapter 5: これから「拡散LLM・世界モデル・統一アーキテクチャへ」（約2.2分 / `layout: wide` / つむぎカットイン / 難易度: 重）
- **学習ゴール**: Diffusion / Flow が「絵を描く技術」を超え、言語（テキスト）・物理シミュレーション（世界モデル）・ロボティクスへと拡張し、自己回帰（AR）と融合する最前線をつかむ。
- **Phase A（離散拡散LLM：テキストも並列ノイズ除去で書く時代）**:
  - **つむぎ（カットイン）**: 「画像や動画は連続値だから拡散できるんだよね？言葉みたいな離散トークンにもDiffusionって使えるの？」
  - **めたん**: **Discrete Diffusion Language Models（離散拡散LLM）** を解説。ガウスノイズの代わりにトークンを `[MASK]` で隠し、双方向アテンションで複数トークンを並列アンマスク復元する仕組み。
  - 代表例として **LLaDA**（スクラッチ学習＆逆転の呪いへの強さ）、**Mercury**（商用超高速コード生成）、**Gemini Diffusion**（並列生成・編集の強み）を紹介しつつ、従来の KVキャッシュがそのまま使えない課題も公平に提示。
- **Phase B（世界モデル・ロボティクス・AR×Diffusion 統一基盤）**:
  - **拡散型ワールドモデル（World Models）**: 行動（Action）や3D幾何情報を条件付けた動画生成により、自動運転・デジタルツイン・AIエージェントの**物理シミュレータ**へ進化。
  - **ロボティクス（Diffusion / Flow Policy）**: 複数の正解軌道が混在する複雑なロボット動作を、連続分布として滑らかに生成。
  - **統一マルチモーダル時代（AR × Diffusion ハイブリッド）**: 論理・計画・離散記号に強い自己回帰（AR）と、視覚・音声・物理・並列生成に強い Diffusion / Flow を1つの基盤モデルへ統合する潮流。
- **図解＆安全領域設計**（`layout: wide` + つむぎ回避：`padding-right: 360px`、Phase B上段バナー `width: 73%`、下端 `padding-bottom: 40px`）:
  - Phase A: 左「自己回帰LLM（1語ずつ直列 $O(N)$）」vs 右「離散拡散LLM（`[MASK]` 配列から全箇所を並列アンマスク復元するアニメーションSVG＋LLaDA / Mercury / Gemini Diffusion バッジ）」。
  - Phase B: 3フロンティアカード（① ワールドモデル＆物理シミュレータ、② Diffusion/Flow Policy ロボティクス、③ AR × Diffusion 統一マルチモーダル基盤）。

### Chapter 6: まとめ「ノイズから世界を創る共通エンジンへ」（約1.0分 / `layout: default` / つむぎカットイン / 難易度: 軽）
- **学習ゴール**: Diffusion Model の進化史とこれからの方向性を3つの軸で定着させ、次エピソードへの興味につなげる。
- **掛け合い骨子**:
  - **ずんだもん**: 「ノイズを引き算するアイデアから始まって、直線で速くなって、いまや言葉やロボットや世界シミュレーションまで広がっているのだ！」
  - **めたん**: 3ポイントを総括。
  - **つむぎ（カットイン）**: 次回テーマ候補（Flow Matching と最適輸送の数式、ワールドモデル徹底解説、離散拡散LLMの仕組み）を提案して締め。
- **図解＆安全領域設計**（Ep001/Ep002 ch06 実績レイアウト準拠：`.c6-wrap { padding-bottom: 36px; }`, `.c6-title-bar { padding-right: 360px; }`, `.c6-summary-grid { padding-top: 88px; }`）:
  - POINT 1: **土台の確立**（DDPM 逆拡散・VAE潜在空間 LDM・CFG 条件誘導）
  - POINT 2: **構造と軌道の革命**（U-Net → DiT スケーリング・Flow Matching 直線軌道・数ステップ蒸留）
  - POINT 3: **広がる未来**（離散拡散LLM・ワールドモデル＆ロボット・AR×Diffusion 統合）
  - 下部次回候補バー：`📐 Flow Matching と最適輸送` / `🌍 ワールドモデルと物理AI` / `⚡ 離散拡散LLMの仕組み`

---

## 4. `config/dictionary.yaml` への追加推奨用語（台本化時に反映）

既存登録済み（`AI`, `LLM`, `GPU`, `Transformer`, `Attention`, `AR`, `KV`）を除き、台本作成時に以下を `config/dictionary.yaml` へ追記予定（長いキーから優先適用される仕様）：

```yaml
# Diffusion Model / Flow Matching / 拡散LLM関連
Classifier-Free Guidance: "クラシファイアーフリーガイダンス"
Consistency Model: "コンシステンシーモデル"
Diffusion Model: "ディフュージョンモデル"
Diffusion Policy: "ディフュージョンポリシー"
Gemini Diffusion: "ジェミニディフュージョン"
Latent Diffusion: "レイテントディフュージョン"
Stable Diffusion: "ステーブルディフュージョン"
Cross-Attention: "クロスアテンション"
Autoregressive: "オートリグレッシブ"
Rectified Flow: "レクティファイドフロー"
Reversal Curse: "リバーサルカース"
Flow Matching: "フローマッチング"
World Model: "ワールドモデル"
ControlNet: "コントロールネット"
adaLN-Zero: "アダエルエヌゼロ"
Diffusion: "ディフュージョン"
Mercury: "マーキュリー"
MMDiT: "エムエムディーアイティー"
LLaDA: "ラダ"
U-Net: "ユーネット"
DDPM: "ディーディーピーエム"
DDIM: "ディーディーアイエム"
FLUX: "フラックス"
Sora: "ソラ"
C2PA: "シーツーピーエー"
MASK: "マスク"
LDM: "エルディーエム"
CFG: "シーエフジー"
DiT: "ディーアイティー"
VAE: "ブイエーイー"
GAN: "ガン"
SDE: "エスディーイー"
ODE: "オーディーイー"
```
