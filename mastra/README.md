# マーケ画像生成ツール

複数クライアントのメルマガ / LINE 向けに、ブランド準拠のバナー画像を量産するツール。画像の**生成**と文字**重ね**を分離し、生成モデルには文字を描かせず、重ね段でブランド指定どおりに決定的に描画する。

## アーキテクチャ

```
Mastra Studio（チャット：画像添付 + 自然言語指示）
   │
 bannerAgent ── tool: create-banner ── bannerWorkflow（共通プロセス・1本）
                                          ├─ generate: gpt-image-2 で背景生成（client で on/off）
                                          └─ overlay : ブランド準拠で文字/CTA/ロゴを重ねる（on/off）
```

全クライアントを**モード分岐なし**の 1 本の共通プロセスで処理する。各段はクライアント設定で on/off でき、その組合せだけで運用差（生成のみ / 生成+重ね / 重ねのみ）を吸収する。

| generate | overlay | 重ねの土台画像 | 出力 |
| --- | --- | --- | --- |
| on | on | 生成画像（文字なし・余白あり） | 重ね結果 |
| on | off | — | 生成画像そのまま |
| off | on | 素材画像 → 無ければブランド背景 | 重ね結果 |

`generate` と `overlay` が両方 off の設定は不正（`clientConfigSchema` で拒否）。

## ディレクトリ

```
src/mastra/
  agents/banner-agent.ts        最外殻 Agent（Studio のチャット面）
  tools/create-banner-tool.ts   Agent → Workflow ブリッジ。添付画像を素材として取り込み、結果を画像で返す
  workflows/banner-workflow.ts   共通プロセス generate → overlay
  steps/generate-step.ts         背景生成 / パススルー、プロンプト生成（重ね時は「文字なし」を強制）
  steps/overlay-step.ts          土台解決と決定的描画 / パススルー
  lib/image-generator.ts         gpt-image-2 ラッパ（インターフェース化、テストで差替）
  lib/overlay-renderer.ts        @napi-rs/canvas による決定的描画エンジン
  lib/fonts.ts                   フォント登録
  clients/                       クライアント設定レジストリ + ブランド仕様（zod）
  assets/fonts, assets/logos     ブランドフォント / ロゴ
```

## クライアント設定

`clients/*.ts` で `defineClient()` により定義（zod で検証）。各クライアントは ①生成・重ねの on/off、②ブランド仕様（キャンバス・背景・見出し・CTA・ロゴ）を持つ。同梱の 3 件が 3 運用を代表する：

- `aurora` — 生成 + 重ね
- `lumen` — 生成のみ
- `verde` — 重ねのみ

## フォント

デフォルトは OSS の Noto Sans JP（`@expo-google-fonts/noto-sans-jp`、全 Latin + 日本語グリフの単一 TTF）を family `Noto Sans JP` として登録。実ブランドフォントは `assets/fonts` に `<Family>-Bold.ttf` 等を置き、クライアント設定でその family 名を指定すれば差し替わる。

## 実行

```shell
npm run dev     # Mastra Studio: http://localhost:4111 の banner-agent とチャット
npm test        # vitest（生成・重ねの各 on/off 組合せ、ブランド描画を網羅）
```

`.env` に `OPENAI_API_KEY` が必要（gpt-image-2 の生成、および Agent のチャットモデル）。重ねのみのクライアントは生成 API を呼ばない。
