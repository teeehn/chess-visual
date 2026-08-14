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

**Current state**: [lib/parse-image.ts](lib/parse-image.ts)'s `parseImage(image: Blob): Promise<ParseImageResult>` sends the whole photographed scoresheet to the Gemini API (`gemini-flash-lite-latest`) in one call, prompted to return a JSON object with the move list, the game result, and any other filled-in header fields (Event, Date, Round, players' names/ratings, etc. — see `RECOGNIZABLE_HEADER_TAGS` in [lib/recognize-scoresheet.ts](lib/recognize-scoresheet.ts) for the full recognized set). This works because a general vision model — unlike a single-line handwriting recognizer — understands document layout well enough to locate the White/Black columns and header boxes itself; no cropping or per-cell processing is needed. The recognized move list is then run through legal-move matching in [lib/recognize-scoresheet.ts](lib/recognize-scoresheet.ts) (`bestLegalMoveMatch`/`assembleGameFromRecognizedCells`): each reading is matched against the actual legal moves at the position reached so far, correcting minor misreads, resolving disambiguation the sheet omitted (see **Disambiguation** below), and stopping at the first move that isn't a confident match; the result and other headers are only written into the PGN if they're recognizable values (a valid PGN result token; a known header tag), not trusted blindly. Transient Gemini errors (503 "overloaded", 429 rate-limited) are retried with a short backoff before giving up. The upload UI is wired up end to end: an uploaded image POSTs to `/api/parse-image`, and on success the returned `pgn` string feeds through the exact same path `handleFile` uses for `.pgn` uploads.

**Accuracy**: tested against a real filled-in scoresheet — [`__tests__/fixtures/1963-round21.jpg`](__tests__/fixtures/1963-round21.jpg), hand-transcribed from Round 21 of the 1963 World Championship match, with the known-correct game at [`__tests__/fixtures/1963-round21.pgn`](__tests__/fixtures/1963-round21.pgn) — one call to `/api/parse-image` recognized the full 19-move game, the `1/2-1/2` result, and the `Round 21` header correctly (`1.c4 Nf6 2.Nf3 g6 3.Nc3 d5 4.cxd5 Nxd5 5.e4 Nxc3 6.dxc3 Qxd1+ 7.Kxd1 Bg4 8.Be2 Nd7 9.Be3 e5 10.Nd2 1/2-1/2`) in about 3 seconds.

**Disambiguation**: a real bug found testing against two longer, messier real games (38 and 53 full moves) — a player very often omits SAN disambiguation even when chess.js's own move list requires it (writing "Nf3" when two knights can legally reach f3, so the actual legal move strings are "Ngf3"/"Ndf3"). The original matcher treated any tie between candidate moves as unresolvable and stopped the *entire rest of the game* right there — on the 38-move game this meant only 8 plies came back. The fix uses the moves *after* the ambiguous one as evidence: it tries each tied candidate and keeps whichever one lets recognition continue furthest over a bounded lookahead (24 cells) — the wrong knight typically leads to a dead end within a few moves (it blocks a later castle, or can no longer reach a square the sheet says it goes to), while the right one doesn't. Bounded rather than searching to the end of the game: unbounded backtracking (trying every candidate and re-exploring *everything* after it) branches multiplicatively at every tie, and a real ~40-move game can easily have several — this hung for several minutes on a real scoresheet before being bounded. A second, smaller issue: a tie can occur *coincidentally* between genuinely different pieces (e.g. "Ke7" is also one edit away from "Ne7", same as the real "Ngf3"/"Ndf3" ambiguity) — ties are now scoped to same-piece candidates first, using the written SAN piece letter, before falling back to the full tied set. Both real games recognize completely now (verified via `/api/parse-image`, not just the underlying matcher).

**Model choice**: `gemini-flash-lite-latest` over the full `gemini-flash-latest` — the full model's free-tier quota for this project turned out to be a mere 20 requests/day (hit during testing; confirmed via the API's own `RESOURCE_EXHAUSTED` error body, which named `GenerateRequestsPerDayPerProjectPerModel-FreeTier` with `quotaValue: 20`), nowhere near enough for real use, and manifested as two back-to-back uploads both failing (one with 503, one with 429 — Gemini's free tier returns either depending on which limit you hit). The lite model has separate, far more generous quota — confirmed via [AI Studio's rate-limit dashboard](https://aistudio.google.com/rate-limit): **15 requests/minute, ~300K input tokens/minute, 500 requests/day** for `gemini-3.5-flash-lite` (25x the full model's daily cap) — and, on the real fixture, was both faster (~3s vs ~10s+, likely because it skips the full model's extended "thinking" step by default) and matched it exactly, including the result — no accuracy tradeoff observed here.

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
