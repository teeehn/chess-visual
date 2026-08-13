import { Chess } from "chess.js";

export type RecognizedCell = {
  moveNumber: number;
  color: "w" | "b";
  text: string;
};

export type AssembledGame = {
  pgn: string;
  movesRecognized: number;
};

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () =>
    new Array(cols).fill(0),
  );
  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1] ?
          dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// Matches raw OCR text against the actual legal moves at a position,
// rather than trying to deterministically "clean up" the text with regex
// rules. This handles case normalization ("NF3" -> "Nf3") and minor OCR
// noise ("c4-" -> "c4") the same way: whichever legal move it's closest to.
// Deliberately conservative — an ambiguous or too-distant match returns
// null rather than guessing, since a wrong correction is worse than
// stopping recognition at that cell (treated as end of the recorded game).
export function bestLegalMoveMatch(
  rawText: string,
  legalMoves: string[],
): string | null {
  const cleaned = rawText.trim();
  if (!cleaned || legalMoves.length === 0) return null;
  const normalized = cleaned.toLowerCase();

  const exact = legalMoves.find((m) => m.toLowerCase() === normalized);
  if (exact) return exact;

  const distances = legalMoves
    .map((move) => ({
      move,
      distance: levenshtein(normalized, move.toLowerCase()),
    }))
    .sort((a, b) => a.distance - b.distance);

  const [best, secondBest] = distances;
  const maxAllowed = Math.max(1, Math.ceil(best.move.length * 0.4));
  if (best.distance > maxAllowed) return null;
  if (secondBest && secondBest.distance === best.distance) return null;

  return best.move;
}

const PGN_RESULT_TOKENS = new Set(["1-0", "0-1", "1/2-1/2", "*"]);

// Walks recognized cells in play order (1w, 1b, 2w, 2b, ...), matching each
// against the legal moves at the position reached so far, and stops at the
// first cell that doesn't confidently match anything — which naturally
// handles both "this is the end of the recorded game" (a blank cell won't
// match) and "recognition failed here" the same way, since we can't tell
// those apart from OCR output alone.
//
// result is optional, separately-recognized text for the sheet's own
// result box (e.g. "1/2-1/2") — not derived from the final position, since
// a scoresheet's recorded result (resignation, time forfeit, agreed draw)
// often isn't something the move list alone implies. Anything that isn't
// one of the four PGN result tokens is ignored rather than trusted, since
// it's more likely a misread than a valid but unusual value.
export function assembleGameFromRecognizedCells(
  cells: RecognizedCell[],
  result?: string,
): AssembledGame {
  const chess = new Chess();
  let movesRecognized = 0;

  for (const cell of cells) {
    const legalMoves = chess.moves();
    const match = bestLegalMoveMatch(cell.text, legalMoves);
    if (!match) break;
    chess.move(match);
    movesRecognized++;
  }

  if (result && PGN_RESULT_TOKENS.has(result)) {
    chess.setHeader("Result", result);
  }

  return { pgn: chess.pgn(), movesRecognized };
}
