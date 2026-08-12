export type ParseImageResult = { ok: true; pgn: string } | { ok: false; error: string };

/**
 * Stub for future OCR/handwriting-recognition work (see project notes on
 * TrOCR + legal-move validation). Establishes the function/route contract
 * an eventual implementation will fill in — not implemented yet.
 */
export async function parseImage(image: Blob): Promise<ParseImageResult> {
  return {
    ok: false,
    error: `Image scoresheet recognition is not implemented yet (received a ${image.type || "unknown"} file, ${image.size} bytes).`,
  };
}
