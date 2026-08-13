# Chess Game Visualizer

Upload a PGN file and step through the game on an interactive chessboard. Built with Next.js (App Router), chess.js, and react-chessboard.

## Getting Started

Install dependencies and run the dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

`/api/parse-image` (recognizing a photographed scoresheet) calls the Gemini API and needs a `GEMINI_API_KEY` in `.env.local` — get a free key from [Google AI Studio](https://aistudio.google.com/apikey). Without one, PGN/text uploads still work; image uploads return an error. `npm install` also needs to run a couple of postinstall scripts (native binary downloads) — if you're prompted about pending scripts, see [Dependency notes](#dependency-notes).

## Usage

1. **Upload a file** — click the dashed upload area and choose a `.pgn`/`.txt` file, or an image (`.png`, `.jpg`, `.heic`, etc.).
2. **PGN files** are parsed and the game loads at the starting position, along with any header metadata the file contains (Event, Site, Date, players, ratings, ECO code, and so on — see [lib/pgn-metadata.ts](lib/pgn-metadata.ts) for the full recognized tag set). Blank or placeholder fields (chess.js's `"?"` / `"????.??.??"` defaults for tags the file never set) are hidden rather than shown.
3. **Step through the game** using the `|<` `<` `>` `>|` buttons, the left/right arrow keys, or by clicking any move directly in the move list. The status line above the board shows the last move played and whose turn is next, and on the final move shows how the game ended (checkmate, stalemate, a specific draw reason, or resignation) instead.
4. **Image files** show a preview and are sent for recognition (typically 5-15 seconds). If recognition produces a valid game, it loads and steps through exactly like a `.pgn` upload; if not, a specific error is shown. See [Handwritten Scoresheet Recognition](#handwritten-scoresheet-recognition) for how this works and its current accuracy.

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
- `app/api/parse-image/route.ts` — accepts an uploaded image and recognizes its moves server-side.
- `lib/` — framework-agnostic logic used by both the route handlers and their tests: `parse-pgn.ts`, `pgn-metadata.ts`, `game-ending.ts`, `parse-image.ts`.

PGN parsing intentionally happens server-side rather than in the browser — `page.tsx` doesn't import chess.js at all; it just posts the uploaded text to `/api/parse-pgn` and renders whatever comes back.

## Handwritten Scoresheet Recognition

**Current state**: [lib/parse-image.ts](lib/parse-image.ts)'s `parseImage(image: Blob): Promise<ParseImageResult>` sends the whole photographed scoresheet to the Gemini API (`gemini-flash-latest`) in one call, prompted to return a JSON array of SAN move strings in play order. This works because a general vision model — unlike a single-line handwriting recognizer — understands document layout well enough to locate the White/Black columns itself; no cropping or per-cell processing is needed. The recognized move list is then run through the same legal-move matching used elsewhere (`bestLegalMoveMatch` in [lib/recognize-scoresheet.ts](lib/recognize-scoresheet.ts): each reading is matched against the actual legal moves at the position reached so far, correcting minor misreads and stopping at the first move that isn't a confident match). The upload UI is wired up end to end: an uploaded image POSTs to `/api/parse-image`, and on success the returned `pgn` string feeds through the exact same path `handleFile` uses for `.pgn` uploads.

**Accuracy**: tested against a real filled-in scoresheet — [`__tests__/fixtures/1963-round21.jpg`](__tests__/fixtures/1963-round21.jpg), hand-transcribed from Round 21 of the 1963 World Championship match, with the known-correct game at [`__tests__/fixtures/1963-round21.pgn`](__tests__/fixtures/1963-round21.pgn) — one call to `/api/parse-image` recognized the full 19-move game correctly (`1.c4 Nf6 2.Nf3 g6 3.Nc3 d5 4.cxd5 Nxd5 5.e4 Nxc3 6.dxc3 Qxd1+ 7.Kxd1 Bg4 8.Be2 Nd7 9.Be3 e5 10.Nd2`) in about 11 seconds, no manual cropping needed.

**Two alternatives were tried and rejected before landing here**, in this order:

1. **TrOCR** (`Xenova/trocr-base-handwritten` via `@huggingface/transformers`, run locally): a single-line handwriting recognizer with no concept of a scoresheet's row/column structure. Run on a full photo it transcribes *something* that doesn't parse as a real game. Getting it working would have needed a step before OCR to locate the sheet and crop it into one image per move (see `lib/segment-scoresheet.ts`, still present and still tested, though no longer wired into `parseImage`) — and even isolated single-move crops only got *close* (`c4` → `c4-`, `Nf3` → `NF3`), not exact.
2. **A local vision-language model** (MiniCPM-V 8B via Ollama, run in Docker, whole image, no segmentation): this Mac is Intel with no GPU, so inference ran on CPU only — one call took **~5 minutes** and recognized just the first two moves correctly before diverging into wrong moves and at least one illegal token. Local small VLMs are a meaningfully weaker fit for messy handwriting than cloud vision models, and CPU-only inference at a size good enough to compete isn't practical here.

Gemini's free tier resolved both problems at once: no segmentation needed, and a single call recovered the real game exactly.

**The `ParseImageResult` contract stays the same regardless of what's inside `parseImage`**:

```ts
export type ParseImageResult =
  | { ok: true; pgn: string }
  | { ok: false; error: string };
```

`{ ok: true, pgn }` requires `pgn` to be syntactically valid PGN movetext that `parsePgn()` can parse — not necessarily a *correct* transcription, just well-formed; accuracy is the recognizer's problem, not the interface's. `{ ok: false, error }` takes a short, user-facing message, shown directly in the UI's error area the same way PGN parse errors are.

## Dependency Notes

`npm install` pulls in a few packages with postinstall scripts (native binary downloads for `chess.js`/`fsevents`, and a native-resolver helper for `unrs-resolver`) that this project gates behind an `allowScripts` allowlist in `package.json` — approve them if prompted (`npm approve-scripts <pkg>`); each one was reviewed before being allowed.

`sharp` is a direct dependency (used by `lib/segment-scoresheet.ts`) rather than an incidental transitive one, since it processes **untrusted user-uploaded images** at runtime — worth pinning deliberately rather than getting whatever version another package happens to pull in.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [chess.js](https://github.com/jhlywa/chess.js)
- [react-chessboard](https://github.com/Clariity/react-chessboard)
