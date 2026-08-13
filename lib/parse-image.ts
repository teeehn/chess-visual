import { pipeline } from "@huggingface/transformers";
import { parsePgn } from "./parse-pgn";

export type ParseImageResult =
  | { ok: true; pgn: string }
  | { ok: false; error: string };

// TrOCR, handwriting-tuned variant. It's a single-line HTR model — it
// reads one line of text per call, not a structured multi-row/column
// layout. Run directly on a full scoresheet photo, it will transcribe
// *something* but won't understand rows/columns, so recognized text
// generally won't parse as a real game yet. Segmenting a scoresheet into
// per-move crops before recognizing each one is future work (see README).
//
// base over small: tested both against a real handwritten scoresheet
// (see README). small hallucinated fluent-but-unrelated text even on
// cleanly cropped single moves; base got close ("c4" -> "c4-", "Nf3" ->
// "NF3") on isolated single-move crops specifically — multi-move crops
// still confused it. base is ~5.5x larger (1.3GB vs 239MB
// cached) and slower to load; worth it here since small wasn't just
// less accurate, it was unusable.
const MODEL_ID = "Xenova/trocr-base-handwritten";

type OcrPipeline = Awaited<ReturnType<typeof pipeline<"image-to-text">>>;

// Loading the model is expensive (downloads/initializes weights) — do it
// once per server process and reuse it, not per request.
let ocrPipelinePromise: Promise<OcrPipeline> | null = null;

function getOcrPipeline(): Promise<OcrPipeline> {
  if (!ocrPipelinePromise) {
    ocrPipelinePromise = pipeline("image-to-text", MODEL_ID);
  }
  return ocrPipelinePromise;
}

export async function parseImage(image: Blob): Promise<ParseImageResult> {
  const ocr = await getOcrPipeline();
  const output = await ocr(image);
  const result = Array.isArray(output) ? output[0] : output;
  const recognizedText = result?.generated_text?.trim() ?? "";

  if (!recognizedText) {
    return { ok: false, error: "Could not recognize any text in the image." };
  }

  const parsed = parsePgn(recognizedText);
  if (!parsed.ok) {
    return {
      ok: false,
      error: `Recognized text doesn't form a valid game yet (recognized: "${recognizedText}"). ${parsed.error}`,
    };
  }

  return { ok: true, pgn: recognizedText };
}
