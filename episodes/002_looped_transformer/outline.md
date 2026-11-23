# Episode 002 構成案：Looped Transformer

- **タイトル**: Looped Transformerとは？数式と図解でわかる『頭の中で何度も考える』AI
- **シリーズ**: AIアーキテクチャ入門
- **尺目安**: 約10分（6チャプター・74セリフ）
- **テーマ**: `tech-dark` / アクセントカラー `#8b5cf6`（バイオレット）

## チャプター構成

1. **1. 導入：『同じ層を回す』第3の進化** (`ch01_intro`, `layout: title`)
   - 従来の「巨大化 ($N$)」「長文 CoT ($T_{\text{CoT}}$)」に加え、「同じ層を繰り返す (Recurrent Depth $R$)」第3の軸と Test-Time Compute の概念を提示。
2. **2. 数式と構造：重み共有と計算機理論** (`ch02_math_architecture`, `layout: default`)
   - Phase A: 通常層との比較、Prelude → Recurrent Core ($R$周) → Coda、漸化式 $h^{(r+1)} = f_\theta(h^{(r)}, e)$、Input Injection、実効深さ $L_{\text{eff}} = L_{\text{pre}} + R \cdot L_{\text{core}} + L_{\text{coda}}$。
   - Phase B: 1命令計算機 `SUBLEQ` 再現（Programmable Computer）と反復更新則による Length Generalization。
3. **3. 潜在推論：CoTとの違いと動的深さ** (`ch03_latent_reasoning`, `layout: wide`)
   - Phase A: 離散トークン出力による CoT のボトルネック（遅延・KVキャッシュ）と、連続ベクトル空間 $h^{(r)} \in \mathbb{R}^d$ での Latent Reasoning の比較。
   - Phase B: 停止確率 $p_r$ による早期脱出（$\sum p_r \ge 1 - \varepsilon$）と Mixture-of-Recursions（MoR）のトークン別ループ配分。
4. **4. つむぎの質問：RNNとの違いと3つの壁** (`ch04_tsumugi_dynamics`, `layout: default`, つむぎカットイン)
   - Phase A: RNN（時間軸の直列ループ）vs Looped Transformer（深さ軸ループ＋毎周 Self-Attention）。
   - Phase B: ①力学系の収束とヤコビアン $\rho(J)$ による Overthinking、②Full BPTT $O(R)$ と Truncated BPTT $O(k)$、③Monitorability（監視可能性）の課題。
5. **5. 最前線と未来：実規模LLMと3軸スケーリング** (`ch05_frontier_future`, `layout: wide`, つむぎカットイン)
   - Phase A: 2018 Universal Transformer → 2023 SUBLEQ → 2024 Length Generalization → 2025〜 Huginn / Ouro / MoR。
   - Phase B: 3軸スケーリング（パラメータ $N$ × CoT長 $T_{\text{CoT}}$ × ループ深さ $R$）のハイブリッド時代と省VRAMエッジAIへの波及。
6. **6. まとめ：思考を『深さ』でスケールする時代** (`ch06_summary`, `layout: default`, つむぎカットイン)
   - 3つの要点の振り返りと次回候補（DEQ / MoEとの違い / KVキャッシュ最適化）。
