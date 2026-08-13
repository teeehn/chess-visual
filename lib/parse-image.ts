import {
  assembleGameFromRecognizedCells,
  type RecognizedCell,
} from "./recognize-scoresheet";

export type ParseImageResult =
  | { ok: true; pgn: string }
  | { ok: false; error: string };

// Gemini reads the whole photographed scoresheet directly rather than
// needing it segmented into per-move crops first (unlike TrOCR, a
// single-line handwriting model with no concept of page layout, a
// general vision model trained on document understanding can locate the
// White/Black columns itself). Verified against a real handwritten
// scoresheet (see README) — recovered all 19 moves of a real game
// correctly in one call, versus a local CPU-run vision model (MiniCPM-V
// via Ollama) which took ~5 minutes and got only the first two moves
// right before diverging.
const GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const RECOGNITION_PROMPT =
  "This is a photo of a handwritten chess scoresheet. Read the moves " +
  "recorded in the White and Black columns, in order, and any other " +
  "filled-in fields on the sheet: the game result (however it's marked " +
  "— checkboxes, fractions, a written score), event name, date, round " +
  "number, board number, section, time control, the two players' names, " +
  "and their ratings. Leave out anything that's blank or illegible " +
  'rather than guessing. Respond with ONLY a JSON object of the form ' +
  '{"moves": ["e4","e5","Nf3"], "result": "1-0", "headers": {"Round": "3", ' +
  '"White": "Smith, John", "WhiteElo": "1850"}} and nothing else — omit ' +
  "any header key you didn't find on the sheet, don't include one with an " +
  'empty value. The result field must be exactly one of "1-0", "0-1", ' +
  '"1/2-1/2", or "*" (use "*" if blank/illegible) — translate whatever ' +
  "notation the sheet uses into one of those four. The headers object's " +
  "keys must be exactly one of: Event, Date, Round, Board, Section, " +
  "TimeControl, White, Black, WhiteElo, BlackElo.";

type RecognizedGame = {
  moves: string[];
  result: string | null;
  headers: Record<string, string>;
};

// Gemini's free tier intermittently returns 503 ("model overloaded") even
// with no rate-limit issue on our end — observed in practice on back-to-
// back requests after an idle gap. 429 (rate limited) is the other case
// worth a short wait rather than failing immediately. Other error codes
// (4xx like a bad request, or a persistent 5xx) aren't retried — a retry
// wouldn't fix them.
const RETRYABLE_STATUS_CODES = new Set([429, 503]);
const RETRY_DELAYS_MS = [500, 1500];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchGeminiWithRetry(
  url: string,
  init: RequestInit,
): Promise<Response> {
  let response: Response;
  for (let attempt = 0; ; attempt++) {
    response = await fetch(url, init);
    if (response.ok || !RETRYABLE_STATUS_CODES.has(response.status)) {
      return response;
    }
    if (attempt >= RETRY_DELAYS_MS.length) {
      return response;
    }
    await sleep(RETRY_DELAYS_MS[attempt]);
  }
}

async function recognizeGame(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<RecognizedGame> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const response = await fetchGeminiWithRetry(
    `${GEMINI_ENDPOINT}?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: RECOGNITION_PROMPT },
              {
                inline_data: {
                  mime_type: mimeType || "image/jpeg",
                  data: imageBuffer.toString("base64"),
                },
              },
            ],
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `The recognition service couldn't process this image (HTTP ${response.status}).`,
    );
  }

  const data = await response.json();
  const text: unknown = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Could not recognize any text in the image.");
  }

  // The model is asked for bare JSON but may still wrap it in prose or a
  // code fence, so pull out the object rather than requiring an exact
  // match. Also accepts a bare array (just moves, no result) as a fallback
  // in case the model doesn't follow the object shape.
  const objectMatch = text.match(/\{[\s\S]*\}/);
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  const jsonText = objectMatch?.[0] ?? arrayMatch?.[0];
  if (!jsonText) {
    throw new Error("Could not recognize any moves in the image.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Could not recognize any moves in the image.");
  }

  const moves = Array.isArray(parsed) ? parsed : (
    (parsed as { moves?: unknown })?.moves
  );
  if (!Array.isArray(moves) || !moves.every((m) => typeof m === "string")) {
    throw new Error("Could not recognize any moves in the image.");
  }

  const result = Array.isArray(parsed) ? null : (
    (parsed as { result?: unknown }).result
  );

  const rawHeaders = Array.isArray(parsed) ? null : (
    (parsed as { headers?: unknown }).headers
  );
  const headers: Record<string, string> = {};
  if (rawHeaders && typeof rawHeaders === "object") {
    for (const [key, value] of Object.entries(rawHeaders)) {
      if (typeof value === "string") headers[key] = value;
    }
  }

  return {
    moves,
    result: typeof result === "string" ? result : null,
    headers,
  };
}

export async function parseImage(image: Blob): Promise<ParseImageResult> {
  const buffer = Buffer.from(await image.arrayBuffer());

  let game: RecognizedGame;
  try {
    game = await recognizeGame(buffer, image.type);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not read the image.",
    };
  }

  // Reuses the same legal-move matching as the recognized text still isn't
  // guaranteed to be clean SAN (misreads, stray punctuation) even though
  // it's a vision model's best guess rather than a low-level HTR reading.
  const cells: RecognizedCell[] = game.moves.map((text, i) => ({
    moveNumber: Math.floor(i / 2) + 1,
    color: i % 2 === 0 ? "w" : "b",
    text,
  }));
  const { pgn, movesRecognized } = assembleGameFromRecognizedCells(
    cells,
    game.result ?? undefined,
    game.headers,
  );

  if (movesRecognized === 0) {
    return {
      ok: false,
      error:
        "Could not recognize any moves in the image. Make sure it's a clear, reasonably front-on photo of a chess scoresheet.",
    };
  }

  return { ok: true, pgn };
}
