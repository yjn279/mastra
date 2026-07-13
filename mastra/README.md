# マーケ画像生成ツール

複数クライアントのメルマガ / LINE 向けに、ブランド準拠のバナー画像を量産するツール。画像の**生成**と文字**重ね**を分離し、生成モデルには文字を描かせず、重ね段でブランド指定どおりに決定的に描画する。

## アーキテクチャ

```
Mastra Studio（チャット：画像添付 + 自然言語指示）
   │
 bannerAgent ── tool: create-banner ── bannerWorkflow（共通プロセス・1本）
                                          ├─ generate: gpt-image-2 で商品画像を生成（client で on/off）
                                          └─ overlay : 画像全面の上にコピー/CTAを重ねる（on/off）
```

全クライアント・全パターンを**モード分岐なし**の 1 本の共通プロセスで処理する。各段はクライアント設定で on/off でき、その組合せだけで運用差（生成のみ / 生成+重ね / 重ねのみ）を吸収する。配置の違い（2パターン）は**レイアウトデータ**の違いだけで、コードは分岐しない。

| generate | overlay | キャンバス全面の画像 | 出力 |
| --- | --- | --- | --- |
| on | on | 生成した商品画像 | 画像＋コピー重ね |
| on | off | — | 生成画像そのまま |
| off | on | 素材画像 → 無ければブランド背景 | 画像＋コピー重ね |

`generate` と `overlay` が両方 off の設定は不正（`clientConfigSchema` で拒否）。

## レイアウト（2パターン）

配置は**レイアウトプリセット**として持ち、指示に応じて選ぶ。ブランド仕様は「見た目」（フォント・色・サイズ・CTA・背景）だけを持ち、「配置」はレイアウトが持つ。画像はキャンバス全面を覆い、コピー/CTA はレイアウトが指定する**余白領域に重ねる**（同一コード・領域データ駆動）。生成時は各レイアウトの `placement` が「商品をどこに置き、どこを空けるか」をモデルに指示し、重ねと配置を一致させる。

- `banner-image-left` / `banner-image-right` — 横長 1536×1024。商品を左右どちらか（指示で決定）、反対側の余白にコピーを重ねる。**CTA なし**。
- `kv` — 正方形 1024×1024。上にコピー、中央に商品、**商品の下に CTA** を重ねる。

## ディレクトリ

```
src/mastra/
  agents/banner-agent.ts        最外殻 Agent（Studio のチャット面）
  tools/create-banner-tool.ts   Agent → Workflow ブリッジ。添付画像を素材として取り込み、結果を画像で返す
  workflows/banner-workflow.ts   共通プロセス generate → overlay
  steps/generate-step.ts         商品画像生成 / パススルー、プロンプト生成（「文字なし」を強制）
  steps/overlay-step.ts          レイアウト合成 / パススルー
  layouts/                       レイアウトプリセット（配置：領域・整列・生成サイズ）
  lib/image-generator.ts         gpt-image-2 ラッパ（インターフェース化、テストで差替）
  lib/overlay-renderer.ts        @napi-rs/canvas による決定的な領域合成エンジン（自動フィット文字）
  lib/banner-store.ts            生成結果をメモリ保持し /banners/:id.png で配信
  lib/fonts.ts                   フォント登録
  clients/                       クライアント設定レジストリ + ブランド仕様（zod、見た目のみ）
  assets/fonts, assets/logos     ブランドフォント / ロゴ
```

## クライアント設定

`clients/*.ts` で `defineClient()` により定義（zod で検証）。各クライアントは ①生成・重ねの on/off、②ブランド仕様（背景・見出し・CTA・ロゴの見た目）を持つ。同梱の 3 件が 3 運用を代表する：

- `aurora` — 生成 + 重ね
- `lumen` — 生成のみ
- `verde` — 重ねのみ

## フォント

デフォルトは OSS の Noto Sans JP（`@expo-google-fonts/noto-sans-jp`、全 Latin + 日本語グリフの単一 TTF）を family `Noto Sans JP` として登録。実ブランドフォントは `assets/fonts` に `<Family>-Bold.ttf` 等を置き、クライアント設定でその family 名を指定すれば差し替わる。

## 実行

```shell
npm run dev     # Mastra Studio: http://localhost:4111 の banner-agent とチャット
npm test        # vitest（生成・重ねの各 on/off × レイアウト、領域合成・自動フィットを網羅）
```

`.env` に `OPENAI_API_KEY` が必要（gpt-image-2 の生成、および Agent のチャットモデル）。重ねのみのクライアントは生成 API を呼ばない。
