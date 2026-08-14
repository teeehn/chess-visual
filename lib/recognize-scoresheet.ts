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

// Matches raw OCR text against the actual legal moves at a position, rather
// than trying to deterministically "clean up" the text with regex rules.
// This handles case normalization ("NF3" -> "Nf3") and minor OCR noise
// ("c4-" -> "c4") the same way: whichever legal move(s) it's closest to.
// Returns every move tied for closest — most of the time that's exactly
// one, but a real case is more than one: a player writes "Nf3" without
// disambiguation even though two knights can legally reach f3, so
// chess.js's own move list has "Ngf3" and "Ndf3", both equidistant from
// what was written. bestLegalMoveMatch treats any real tie as "no
// confident match" (see there for why) — this just finds the tied set.
function candidateMoveMatches(rawText: string, legalMoves: string[]): string[] {
  const cleaned = rawText.trim();
  if (!cleaned || legalMoves.length === 0) return [];
  const normalized = cleaned.toLowerCase();

  const exact = legalMoves.filter((m) => m.toLowerCase() === normalized);
  if (exact.length > 0) return exact;

  const distances = legalMoves.map((move) => ({
    move,
    distance: levenshtein(normalized, move.toLowerCase()),
  }));
  const minDistance = Math.min(...distances.map((d) => d.distance));
  const shortestAtMin = Math.min(
    ...distances.filter((d) => d.distance === minDistance).map((d) => d.move.length),
  );
  const maxAllowed = Math.max(1, Math.ceil(shortestAtMin * 0.4));
  if (minDistance > maxAllowed) return [];

  const tied = distances
    .filter((d) => d.distance === minDistance)
    .map((d) => d.move);

  // A real disambiguation tie (two knights can both legally reach the
  // written square) never changes the leading SAN piece letter — inserting
  // a file/rank only adds a character. A tie against a *different* piece
  // letter (e.g. "Ke7" tied with "Nge7"/"Nce7" purely by edit-distance
  // coincidence, one substitution away) is a different piece entirely, not
  // a real ambiguity, so it's dropped whenever a same-letter candidate
  // exists. Scoped to actual SAN piece letters specifically (not pawn
  // moves, whose "leading letter" is just a file, or arbitrary non-chess
  // text) so this doesn't reach past what the notation itself justifies.
  const SAN_PIECE_LETTERS = new Set(["n", "b", "r", "q", "k"]);
  if (SAN_PIECE_LETTERS.has(normalized[0])) {
    const sameLeadingChar = tied.filter(
      (move) => move[0].toLowerCase() === normalized[0],
    );
    if (sameLeadingChar.length > 0) return sameLeadingChar;
  }
  return tied;
}

// Deliberately conservative — an ambiguous or too-distant match returns
// null rather than guessing, since a wrong correction is worse than
// stopping recognition at that cell (treated as end of the recorded game).
export function bestLegalMoveMatch(
  rawText: string,
  legalMoves: string[],
): string | null {
  const candidates = candidateMoveMatches(rawText, legalMoves);
  return candidates.length === 1 ? candidates[0] : null;
}

const PGN_RESULT_TOKENS = new Set(["1-0", "0-1", "1/2-1/2", "*"]);

// The scoresheet template's own header fields (Event/Date/Round/Board/
// Section/Time Control/player Name+Rating boxes), mapped to their PGN tag
// names. Anything recognized outside this set is dropped rather than
// written into the PGN — this is specifically for fields the physical
// sheet has a box for, not an open channel for arbitrary tags.
const RECOGNIZABLE_HEADER_TAGS = new Set([
  "Event",
  "Date",
  "Round",
  "Board",
  "Section",
  "TimeControl",
  "White",
  "Black",
  "WhiteElo",
  "BlackElo",
]);

// Walks cells in order, matching each against the position reached so far
// via bestLegalMoveMatch, and stops at the first cell that doesn't
// confidently match anything (including a genuine tie — see
// candidateMoveMatches). An earlier version tried to resolve ties by
// looking ahead and guessing whichever candidate let recognition continue
// furthest; rolled back after finding it wasn't reliable enough on messy
// real scoresheets (it could pick a plausible-looking but wrong candidate,
// silently continuing the game on the wrong branch rather than surfacing
// something the player should check). Stopping at a tie and reporting
// exactly where (see parseImage's `warning`) is more honest than guessing.
function matchCells(cells: RecognizedCell[]): string[] {
  const chess = new Chess();
  const matched: string[] = [];

  for (const cell of cells) {
    const legalMoves = chess.moves();
    if (legalMoves.length === 0) break;

    const match = bestLegalMoveMatch(cell.text, legalMoves);
    if (!match) break;

    chess.move(match);
    matched.push(match);
  }

  return matched;
}

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
//
// headers is optional, separately-recognized text for the sheet's other
// header fields (Event, Date, Round, player names/ratings, etc.) — see
// RECOGNIZABLE_HEADER_TAGS. Blank entries are skipped rather than written
// as empty tags.
export function assembleGameFromRecognizedCells(
  cells: RecognizedCell[],
  result?: string,
  headers?: Record<string, string>,
): AssembledGame {
  const matchedMoves = matchCells(cells);
  const chess = new Chess();
  for (const move of matchedMoves) chess.move(move);
  const movesRecognized = matchedMoves.length;

  if (result && PGN_RESULT_TOKENS.has(result)) {
    chess.setHeader("Result", result);
  }

  for (const [tag, value] of Object.entries(headers ?? {})) {
    const trimmed = value?.trim();
    if (trimmed && RECOGNIZABLE_HEADER_TAGS.has(tag)) {
      chess.setHeader(tag, trimmed);
    }
  }

  return { pgn: chess.pgn(), movesRecognized };
}
