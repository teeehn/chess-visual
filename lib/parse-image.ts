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
  'This is a photo of a handwritten chess scoresheet. Read the moves ' +
  "recorded in the White and Black columns, in order. Respond with ONLY " +
  'a JSON array of SAN move strings in play order (e.g. ["e4","e5","Nf3"]), ' +
  "and nothing else.";

async function recognizeMoves(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
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
  });

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
  // code fence, so pull out the array rather than requiring an exact match.
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Could not recognize any moves in the image.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("Could not recognize any moves in the image.");
  }

  if (!Array.isArray(parsed) || !parsed.every((m) => typeof m === "string")) {
    throw new Error("Could not recognize any moves in the image.");
  }

  return parsed;
}

export async function parseImage(image: Blob): Promise<ParseImageResult> {
  const buffer = Buffer.from(await image.arrayBuffer());

  let moves: string[];
  try {
    moves = await recognizeMoves(buffer, image.type);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not read the image.",
    };
  }

  // Reuses the same legal-move matching as the recognized text still isn't
  // guaranteed to be clean SAN (misreads, stray punctuation) even though
  // it's a vision model's best guess rather than a low-level HTR reading.
  const cells: RecognizedCell[] = moves.map((text, i) => ({
    moveNumber: Math.floor(i / 2) + 1,
    color: i % 2 === 0 ? "w" : "b",
    text,
  }));
  const { pgn, movesRecognized } = assembleGameFromRecognizedCells(cells);

  if (movesRecognized === 0) {
    return {
      ok: false,
      error:
        "Could not recognize any moves in the image. Make sure it's a clear, reasonably front-on photo of a chess scoresheet.",
    };
  }

  return { ok: true, pgn };
}
