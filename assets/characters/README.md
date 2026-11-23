# キャラクター立ち絵アセットの配置について

制作者の配布規約・著作権保護のため、キャラクター立ち絵の ZIP / PSD ファイルおよび書き出し済み PNG（`assets/characters/exported/`）は Git 管理対象外（`.gitignore` 指定）としています。

## セットアップ手順

1. 各キャラクターの利用規約に従ってダウンロードした立ち絵 ZIP を、以下のファイル名で本フォルダ（`assets/characters/`）に配置してください（リポジトリルートの [export-portraits.py](../../tools/export-portraits.py) が参照します）。
   - `のんたお式四国めたん立ち絵.zip`
   - `のんたお式ずんだもん_立ち絵_ver.2.0.zip`
   - `のんたお式春日部つむぎ立ち絵.zip`
2. ルートディレクトリで以下を実行し、`assets/characters/exported/` に表情×口パク PNG を一括書き出しします。

```bash
npm run portraits:export
```
