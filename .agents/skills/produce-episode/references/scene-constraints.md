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
- **`tech-dark`**: 背景 `#0b1120`、カード `#1e293b` / `#0f172a`、主文字 `#f8fafc`、副文字 `#cbd5e1`（薄いグレーは避け明度差を保つ）。
- **`clean-light`**: 背景 `#f8fafc`、カード `#ffffff` / `#f1f5f9`、主文字 `#0f172a`、副文字 `#334155`。
- 任意で [templates/diagram-kit.css](../../../../templates/diagram-kit.css) のクラス（`.dg-title-bar`, `.dg-heading`, `.dg-sub`, `.dg-callout`, `.dg-badge` 等）を利用できる。

## 3. HTML / CSS / GSAP 実装規約（Lint Error 0 を保証）
1. `<style>` + `<div class="...">...</div>` + `<script>...</script>` の3構成で記述する（`<html>` や `<body>` タグは不要・禁止）。
2. CSS で `#root` や `.layout-wide` / `.layout-title` を修飾しない。ユニークな章プレフィックス（例: `.c1-*`, `.c2-*`）を使う。
3. **アニメ対象要素の CSS に `transform` を書かない**（初期変換は `gsap.set()` で与える）。
4. **`gsap.from()` は使わない**。必ず `gsap.set()` + `tl.to()` または `tl.fromTo()` を使う。
5. **表示切替に `autoAlpha` / `display` / `visibility` を使わない**。フェードやフェーズ切替は `opacity` を使う。
6. Phase A → Phase B を切り替える場合、切り替わり直後に画面が空白になる区間を作らない（前の Phase を消すタイミングと同時に次 Phase の見出し・主要カードを表示する）。
7. `document.querySelector()` 内でテンプレートリテラル `` `${...}` `` を使わない。
8. `<style>` 終了から `<script>` 開始までの HTML マークアップは **180行未満** にコンパクトに保つ（`dist/compositions/<id>.html` の構造行数 300 行制限超過による `composition_file_too_large` 警告を防ぐため）。

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
