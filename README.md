# Chess Game Visualizer

Upload a PGN file and step through the game on an interactive chessboard. Built with Next.js (App Router), chess.js, and react-chessboard.

## Getting Started

Install dependencies and run the dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Upload a file** — click the dashed upload area and choose a `.pgn`/`.txt` file, or an image (`.png`, `.jpg`, `.heic`, etc.).
2. **PGN files** are parsed and the game loads at the starting position, along with any header metadata the file contains (Event, Site, Date, players, ratings, ECO code, and so on — see [lib/pgn-metadata.ts](lib/pgn-metadata.ts) for the full recognized tag set). Blank or placeholder fields (chess.js's `"?"` / `"????.??.??"` defaults for tags the file never set) are hidden rather than shown.
3. **Step through the game** using the `|<` `<` `>` `>|` buttons, the left/right arrow keys, or by clicking any move directly in the move list. The status line above the board shows the last move played and whose turn is next, and on the final move shows how the game ended (checkmate, stalemate, a specific draw reason, or resignation) instead.
4. **Image files** currently show a preview with a "not implemented yet" placeholder — see below for the extension point.

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
- `app/api/parse-image/route.ts` — accepts an uploaded image; currently a stub (see below).
- `lib/` — framework-agnostic logic used by both the route handlers and their tests: `parse-pgn.ts`, `pgn-metadata.ts`, `game-ending.ts`, `parse-image.ts`.

PGN parsing intentionally happens server-side rather than in the browser — `page.tsx` doesn't import chess.js at all; it just posts the uploaded text to `/api/parse-pgn` and renders whatever comes back.

## Extending: Handwritten Scoresheet Recognition

The app already accepts an image upload in the UI and has a server route wired up for it, but the actual recognition (OCR/handwriting-to-moves) isn't implemented — this section documents *where that logic belongs and what it must return*, not how to build it.

**Where to add it**: [lib/parse-image.ts](lib/parse-image.ts), inside `parseImage(image: Blob): Promise<ParseImageResult>`. This is the single function the rest of the app depends on — everything upstream and downstream of it is already built and shouldn't need to change:

- [app/api/parse-image/route.ts](app/api/parse-image/route.ts) already handles the HTTP side: validates the incoming `multipart/form-data` request, extracts the `image` field, calls `parseImage`, and maps its result to the right status code (`200` for success, `501` while it's still a stub, `400` for a malformed request). A real implementation replacing the stub body doesn't require touching this file unless the request/response contract itself changes.
- The client (`app/page.tsx`'s `handleImage`) currently only shows an image preview and a placeholder message — it does not yet call `/api/parse-image`. Wiring that up is a separate, small step once `parseImage` does something real: POST the file to `/api/parse-image`, and on success feed the returned PGN text through the exact same path `handleFile` already uses for uploaded `.pgn` files (i.e. `/api/parse-pgn` — see `lib/parse-pgn.ts`'s `parsePgn`). No new move-parsing logic is needed for images; recognition only needs to produce PGN text, and the existing pipeline takes it from there.

**What `parseImage` must return** — the `ParseImageResult` type already defines the contract:

```ts
export type ParseImageResult =
  | { ok: true; pgn: string }
  | { ok: false; error: string };
```

- On success: `{ ok: true, pgn }`, where `pgn` is a **valid PGN string** — movetext (SAN moves) is required; header tags (`[Event ...]`, etc.) are optional but supported if extracted. It does not need to be a *correct* transcription of the photo to satisfy the contract, only syntactically valid PGN that `lib/parse-pgn.ts`'s `parsePgn()` can parse — accuracy is the implementation's problem, not the interface's.
- On failure: `{ ok: false, error }`, where `error` is a short, user-facing message (shown directly in the UI's error area, the same way PGN parse errors are). Use this for "couldn't read the image," "no moves detected," partial-confidence failures, or any other case where you don't have usable PGN to return — not for exceptions, which should still be thrown/caught normally.

This keeps recognition swappable — whatever approach ends up implementing `parseImage` (a hosted OCR API, a self-hosted model, a call to another service) only needs to satisfy this one function signature; nothing else in the app needs to know how it works.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [chess.js](https://github.com/jhlywa/chess.js)
- [react-chessboard](https://github.com/Clariity/react-chessboard)
