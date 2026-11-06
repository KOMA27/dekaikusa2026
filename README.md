# デカ戦2026 管理者スコア入力アプリ

## GitHub Pages
1. Publicリポジトリ `dekaikusa2026_iidx` のルートに本ZIPの内容を配置します。
2. Settings → Pages → Deploy from a branch → `main` → `/(root)` → Save。
3. `https://<GitHubユーザー名>.github.io/dekaikusa2026_iidx/` を開きます。

## GitHub API設定
- `js/app.js` の `GITHUB_REPO` は `dekaikusa2026_iidx` に設定済みです。
- GitHub PagesのURLから所有者名を自動取得します。カスタムドメインの場合は初回にユーザー名を尋ねます。
- GitHub Fine-grained PATを作成し、対象リポジトリを `dekaikusa2026_iidx` のみに限定、Contents: Read and write を付与してください。
- 画面の「管理者トークン設定」からトークンを入力します。トークンはブラウザのメモリ内のみで保持し、保存します。

## データ
- `data/scores.json` が唯一のデータファイルです。
- エンジョイ部門はCode.gs内の初期プレイヤー・対戦・ポイントマスタを新規データとして設定しています。
- ガチ部門はHTML内の4試合と課題曲リストを維持しています。
- 試合結果は空で開始します。

## 注意
Publicリポジトリのため、画面・JSON・試合結果は誰でも閲覧できます。PATは絶対にソースやJSONに書かないでください。PAT入力者はリポジトリ全体のContentsを書き換えられる権限を持ちます。
