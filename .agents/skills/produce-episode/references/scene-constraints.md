# Scene Authoring Constraints (1920×1080 HyperFrames Sub-composition)

各 `scenes/<chapter_id>.html` は `templates/chapter-shell.html` 内の `<main class="diagram-stage layout-{{CHAPTER_LAYOUT}}">` に注入されます。

## 1. 安全領域と座標ルール（厳守）

キャンバス全体は `1920×1080`、上ヘッダーは `height: 72px`。図解要素は以下の固定UI領域と**絶対に重ならない**こと：

| UI要素 | 座標領域 | 回避方法 |
| :--- | :--- | :--- |
| **四国めたん（左下）** | `x: 12..288`, `y: 814..1080` | `layout-wide` / `layout-title` で下端に配置する要素は `margin: 0 212px〜250px` を付けるか、`padding-bottom: 36px〜48px` で `y < 805` に収める。 |
| **ずんだもん（右下）** | `x: 1648..1908`, `y: 814..1080` | 同上（右端コーナーを空けるか `padding-bottom: 36px〜48px`）。 |
| **字幕ドック（中央下）** | `x: 298..1622`, `y: 890..1064` | `.diagram-stage` の下余白は `198..206px` あるため、下へはみ出させない（`overflow: hidden` / `flex: 1; min-height: 0` を徹底）。 |
| **つむぎカットイン（右上）** | `x: 1572..1888`, `y: 90..254` | つむぎが登場する章（`has_tsumugi_cutin: true`）は、上見出しバーに `padding-right: 360px` を付け、上段要素に `width: 73%`（左寄せ）またはグリッド上部に `padding-top: 86px〜96px` を確保する。 |

## 2. テーマ変数と配色
- **`clean-light`**: 白基調・標準。背景 `#f8fafc`、カード `#ffffff` / `#f1f5f9`、主文字 `#0f172a`、副文字 `#334155`。
- **`tech-dark`**: 暗色・AI/数理向け。背景 `#0b1120`、カード `#1e293b` / `#0f172a`、主文字 `#f8fafc`、副文字 `#cbd5e1`（薄いグレー文字は避け明度差を保つ）。
- **`editorial-warm`**: 生成り・歴史/教養/法学/生活お金向け。背景 `#faf7f2`、カード `#fffdf9`、主文字 `#1c1917`、副文字 `#57534e`。
- **`finance-navy`**: 濃紺×金・金融/地政学向け。高コントラストの白・淡色文字を保つ。
- **[templates/diagram-kit.css](../../../../templates/diagram-kit.css) ＆外部部品**: `.dg-title-bar`, `.dg-heading`, `.dg-card`, `.dg-card-glow`, `.dg-card-flex`, `.dg-card-title-group`, `.dg-callout`, `.dg-badge`, `.dg-cutin-head` 等に加え、`window.dgMotion` と `window.dgWidgets` を積極活用する。

## 3. HTML / CSS / GSAP 実装規約（Lint Error 0 を保証）
1. `<style>` + `<div class="...">...</div>` + `<script>...</script>` の3構成で記述する（`<html>` や `<body>` タグは不要・禁止）。
2. CSS で `#root` や `.layout-wide` / `.layout-title` を修飾しない。ユニークな章プレフィックス（例: `.c1-*`, `.c2-*`）を使う。
3. **アニメ対象要素の CSS に `transform` を書かない**（初期変換は `gsap.set()` で与える）。
4. **`gsap.from()` は使わない**。必ず `gsap.set()` + `tl.to()` または `tl.fromTo()` を使う。
5. **表示切替に `autoAlpha` / `display` / `visibility` を使わない**。フェードやフェーズ切替は `opacity` または `dgMotion.switchPhase` を使う。
6. Phase A → Phase B を切り替える場合、切り替わり直後に画面が空白になる区間を作らない（切替直後 `0.1〜0.2s` で次 Phase の見出し・主要カードを表示する）。
7. `document.querySelector()` 内でテンプレートリテラル `` `${...}` `` を使わない（`+` 結合を使う）。
8. `</style>` 〜 `<script>` 間の HTML 本体は **230行未満**（できれば 180行未満）にコンパクトに保つ（ビルド後の構造行数 300 行制限超過による `composition_file_too_large` 警告を防ぐため）。

## 4. JS 登録テンプレート

```html
<script>
window.__diagramBuilders = window.__diagramBuilders || {};
window.__diagramBuilders["<chapter_id>"] = function (tl, cues) {
  gsap.set("#el-1", { opacity: 0, y: 16 });
  const t1 = cues.<cue_key> ?? 0.45;
  tl.to("#el-1", { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }, t1);
};
</script>
```
