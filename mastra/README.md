# Brand Banner Generator

Mastra project that generates brand-compliant marketing banners (email / LINE retention creative) for multiple clients. It runs every client through one common two-stage process — **generate** (gpt-image-2) then **overlay** (deterministic text/CTA/logo compositing) — and lets each client turn either stage on or off instead of branching into separate modes.

## Why generation and overlay are separate

Image generation models can't reliably follow exact fonts, colors, or copy. So gpt-image-2 is only ever asked for a background — never for text — and all headline/CTA/logo rendering happens afterward with `sharp` + SVG, deterministically, from each client's brand spec (`src/mastra/brand/types.ts`). Same input always produces the same output, which is what makes brand compliance testable.

## Common process

`runBannerProcess` (`src/mastra/banner/process.ts`) is the single place that decides what runs, for every client:

- **generate: on** — call gpt-image-2. A material image (if supplied) is used as `edits` input; otherwise `generations` creates one from scratch. If overlay also runs afterward, the prompt asks for a clear, text-free background with room reserved for the headline and CTA.
- **generate: off** — use the material image directly, or a solid brand-color background if none was supplied.
- **overlay: on** — composite the headline, CTA, and logo from the client's `BrandSpec` onto whatever image resulted above.
- **overlay: off** — return that image unchanged.

The three combinations that matter in practice — generate only, generate + overlay, overlay only — are all just different `StageFlags` on a `ClientConfig`; there's no per-mode branching anywhere above this function. `banner/workflow.ts` and `banner/tool.ts` are thin wrappers that expose it to Mastra Studio; `agents/banner-agent.ts` is the chat-facing shell on top of the tool.

## Clients and brand specs

Clients are registered in `src/mastra/brand/clients.ts`, each with a `StageFlags` (generate/overlay on-off) and a `BrandSpec` (canvas size, margins, fonts, colors, CTA style, optional logo). `resolveClient(id)` looks one up; unknown ids throw. The registry ships three samples, one per operating pattern:

| Client id | generate | overlay |
| --- | --- | --- |
| `sample-generate-only` | on | off |
| `sample-generate-overlay` | on | on |
| `sample-overlay-only` | off | on |

Brand fonts and logos live under `src/mastra/public/` (`fonts/`, `logos/`) and are resolved relative to the project root at runtime (`src/mastra/asset-path.ts`), since `mastra dev`'s bundler doesn't preserve source file locations or copy non-JS assets. Fonts are embedded via an isolated fontconfig at render time, so output doesn't depend on fonts installed on the host machine.

## Running it

```shell
npm install
npm run dev
```

Open [http://localhost:4111](http://localhost:4111) for Mastra Studio. In the Banner Agent chat, attach a material image if you have one and describe what you want (client, copy, CTA); the agent resolves the client's brand settings, runs the common process, and returns the result image. Follow-up messages in the same conversation ("make the headline shorter", "try a different photo") are treated as revisions and re-run the process — this is backed by the agent's `Memory`.

Live generation calls gpt-image-2 and requires `OPENAI_API_KEY` (see `.env.example`).

## Testing

```shell
npm test
```

Tests cover every generate/overlay combination, with and without a material image, deterministic overlay rendering against the brand spec, and the gpt-image-2 adapter's request shaping — all against an injected stub generator, so the suite needs no network access or API key.
