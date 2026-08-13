# Chess Game Visualizer

Upload a PGN file and step through the game on an interactive chessboard. Built with Next.js (App Router), chess.js, and react-chessboard.

## Getting Started

Install dependencies and run the dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The first call to `/api/parse-image` downloads and initializes the OCR model (`Xenova/trocr-base-handwritten`, ~1.3GB — expect the first request to take up to a minute); it's cached in memory after that for the life of the server process, so subsequent calls are fast. The download itself is cached on disk too, but inside `node_modules/@huggingface/transformers/.cache/`, so it's wiped and re-downloaded whenever `node_modules` is reinstalled. `npm install` also needs to run a couple of postinstall scripts (native binary downloads) — if you're prompted about pending scripts, see [Dependency notes](#dependency-notes).

## Usage

1. **Upload a file** — click the dashed upload area and choose a `.pgn`/`.txt` file, or an image (`.png`, `.jpg`, `.heic`, etc.).
2. **PGN files** are parsed and the game loads at the starting position, along with any header metadata the file contains (Event, Site, Date, players, ratings, ECO code, and so on — see [lib/pgn-metadata.ts](lib/pgn-metadata.ts) for the full recognized tag set). Blank or placeholder fields (chess.js's `"?"` / `"????.??.??"` defaults for tags the file never set) are hidden rather than shown.
3. **Step through the game** using the `|<` `<` `>` `>|` buttons, the left/right arrow keys, or by clicking any move directly in the move list. The status line above the board shows the last move played and whose turn is next, and on the final move shows how the game ended (checkmate, stalemate, a specific draw reason, or resignation) instead.
4. **Image files** currently show a preview with a placeholder message — the server-side recognition endpoint is implemented (see below), but the upload UI isn't wired up to call it yet.

On wide screens the move list sits in a sidebar to the right of the board, top-aligned with it; on narrower screens it sits below the board, width-matched to the navigation controls.

## Running Tests

```bash
npm test        # run once
npm run test:watch   # re-run on file changes
```

Tests are organized under `__tests__/`, mirroring the source layout:

- `__tests__/lib/` — unit tests for the pure functions in `lib/` (PGN parsing, metadata extraction, game-ending detection), no rendering involved.
- `__tests__/api/` — tests for the Route Handlers in `app/api/`, calling the exported `POST` functions directly with a real `Request` (no server needs to be running). These run under a `@jest-environment node` override, since jsdom has neither `fetch` nor `Response` as globals.
- `__tests__/page/` — component tests via Testing Library, covering upload, navigation, metadata display, and game-ending rendering end to end.

## Project Structure

- `app/page.tsx` — the client component: upload UI, board, move navigation, move list.
- `app/api/parse-pgn/route.ts` — parses uploaded PGN text server-side and returns moves/metadata/game-ending info as JSON.
- `app/api/parse-image/route.ts` — accepts an uploaded image and runs OCR on it server-side.
- `lib/` — framework-agnostic logic used by both the route handlers and their tests: `parse-pgn.ts`, `pgn-metadata.ts`, `game-ending.ts`, `parse-image.ts`.

PGN parsing intentionally happens server-side rather than in the browser — `page.tsx` doesn't import chess.js at all; it just posts the uploaded text to `/api/parse-pgn` and renders whatever comes back.

## Handwritten Scoresheet Recognition

**Current state**: [lib/parse-image.ts](lib/parse-image.ts)'s `parseImage(image: Blob): Promise<ParseImageResult>` runs real OCR — [TrOCR](https://huggingface.co/microsoft/trocr-base-handwritten) (the `Xenova/trocr-base-handwritten` checkpoint) via [`@huggingface/transformers`](https://github.com/huggingface/transformers.js), loaded once per server process and reused across requests. It is not yet wired up to the upload UI (`app/page.tsx`'s `handleImage` still only shows a preview), and it does not yet reliably turn a full scoresheet photo into a valid game. Both are real, scoped next steps, not "figure it out from scratch":

- **Wire up the client**: POST the uploaded file to `/api/parse-image`, and on success feed the returned `pgn` string through the same path `handleFile` already uses for `.pgn` uploads (`/api/parse-pgn` → `lib/parse-pgn.ts`'s `parsePgn`). [app/api/parse-image/route.ts](app/api/parse-image/route.ts) already handles the HTTP side (validates the request, calls `parseImage`, maps the result to `200`/`400`) and shouldn't need to change for this.
- **Segment the scoresheet before recognizing it**: TrOCR is a *single-line* handwriting recognizer — one call reads one line of text, with no concept of a scoresheet's row/column structure. Run directly on a full photo, it transcribes *something*, but that something won't parse as a real game (verified: feeding it [transformers.js's own documented sample image](https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/handwriting.jpg) correctly recognized the exact expected text, "Mr. Brown commented icily." — the model works, it's just reading a line, not a page). Getting real scoresheets working needs a step before OCR that locates the sheet and crops it into one image per move (a fixed printed template with numbered rows — e.g. the standard US Chess scoresheet form — is a more tractable starting target than an arbitrary handwritten page, since the row/column layout is known in advance), each crop recognized independently, then reassembled — and likely legal-move validation (chess.js already generates the legal moves at each position) to correct low-confidence reads, rather than trusting raw OCR output directly.
- **Accuracy note**: recognition quality depends heavily on how close the input is to what the model was trained on. It performed well on the reference sample above; a synthetic image of clean rendered text ("1. e4 e5" in a cursive-style font) was recognized far less accurately ("1.445") — real handwriting and printed/rendered text are different distributions for this model, so testing with the latter is not a good proxy for the former.

  Tested against a real filled-in scoresheet — [`__tests__/fixtures/1963-round21.jpg`](__tests__/fixtures/1963-round21.jpg), hand-transcribed from Round 21 of the 1963 World Championship match, with the known-correct game at [`__tests__/fixtures/1963-round21.pgn`](__tests__/fixtures/1963-round21.pgn) — cropped to individual moves:

  | Crop | Correct | Recognized |
  |---|---|---|
  | isolated "c4" | `c4` | `c4-` |
  | isolated "Nf3" | `Nf3` | `NF3` |
  | isolated "Nf6" | `Nf6` | `NFC 2` |
  | "c4"+"Nf6" (one row, both columns) | `c4 Nf6` | `c 4000I NFC.` |
  | "Nf3"+"g6" (one row, both columns) | `Nf3 g6` | `NF3-1963` |

  Two findings drove picking `base` over `small` here: `small` produced fluent-but-completely-unrelated hallucinated text (e.g. Wikipedia-sidebar-style phrases) on this handwriting even on cleanly isolated crops — not close misses, just wrong. `base` got close on isolated single-move crops (near-miss errors like a stray trailing character or wrong letter case, both cheap to clean up before validation) but did notably worse when a crop spanned both the White and Black columns in one row — concrete evidence that segmentation should crop to individual moves, not full rows.

**The `ParseImageResult` contract stays the same regardless of what's inside `parseImage`**:

```ts
export type ParseImageResult =
  | { ok: true; pgn: string }
  | { ok: false; error: string };
```

`{ ok: true, pgn }` requires `pgn` to be syntactically valid PGN movetext that `parsePgn()` can parse — not necessarily a *correct* transcription, just well-formed; accuracy is the recognizer's problem, not the interface's. `{ ok: false, error }` takes a short, user-facing message, shown directly in the UI's error area the same way PGN parse errors are.

## Dependency Notes

`npm install` pulls in a few packages with postinstall scripts (native binary downloads for `onnxruntime-node`, `fsevents`, and native-resolver helpers for `protobufjs`/`unrs-resolver`) that this project gates behind an `allowScripts` allowlist in `package.json` — approve them if prompted (`npm approve-scripts <pkg>`); each one was reviewed before being allowed.

`package.json`'s `overrides` pin two things that would otherwise resolve to versions with real problems:

- `sharp` → `^0.35.3`: `@huggingface/transformers` pulls in a `sharp` version with a [known high-severity vulnerability](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) in its underlying image library. This matters here specifically because `sharp` processes **untrusted user-uploaded images** at runtime — not a theoretical concern to wave off.
- `onnxruntime-node` → `1.23.0`: the version `@huggingface/transformers` depends on by default (`1.24.3`) dropped prebuilt binaries for `darwin-x64` (Intel Macs) — the package installs but throws at import time on that platform. `1.23.0` is the last version that still bundles it.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [chess.js](https://github.com/jhlywa/chess.js)
- [react-chessboard](https://github.com/Clariity/react-chessboard)
