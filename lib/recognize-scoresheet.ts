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
// one, but a common real case is more than one: a player writes "Nf3"
// without disambiguation even though two knights can legally reach f3, so
// chess.js's own move list has "Ngf3" and "Ndf3", both equidistant from
// what was written. See assembleGameFromRecognizedCells for how ties are
// resolved using the moves that follow, rather than guessed here.
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
  // exists — otherwise later lookahead-based tie-breaking has no way to
  // tell "which of two legal knights" from "misread the piece itself".
  // Scoped to actual SAN piece letters specifically (not pawn moves, whose
  // "leading letter" is just a file, or arbitrary non-chess text) so this
  // doesn't reach past what the notation itself justifies.
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

// How far ahead to look, in cells, when breaking a tie between candidate
// moves — e.g. resolving a blocked-castling dead end (see below) needs
// enough lookahead to actually reach the castling move, which can be many
// plies later. Bounded rather than exploring to the end of the game:
// unbounded backtracking (trying every candidate and recursing through
// *everything* after it) branches multiplicatively at every tie, and a
// real ~40-move game can easily have several — measured this hang for
// several minutes on a real scoresheet before bounding it.
const TIE_BREAK_LOOKAHEAD = 24;

// Greedily counts how many further cells match *something* legal, without
// itself branching on ties (arbitrarily takes the first candidate at any
// tie it meets) — a cheap, approximate probe used only to score candidates
// at an outer tie, not a search for the true best continuation.
function greedyMatchLength(
  fen: string,
  cells: RecognizedCell[],
  index: number,
  remaining: number,
): number {
  if (remaining <= 0 || index >= cells.length) return 0;

  const chess = new Chess(fen);
  const legalMoves = chess.moves();
  if (legalMoves.length === 0) return 0;

  const candidates = candidateMoveMatches(cells[index].text, legalMoves);
  if (candidates.length === 0) return 0;

  chess.move(candidates[0]);
  return 1 + greedyMatchLength(chess.fen(), cells, index + 1, remaining - 1);
}

// Walks cells in order, matching each against the position reached so far.
// When a cell has more than one tied candidate (see candidateMoveMatches —
// e.g. a player writes "Nf3" without disambiguation even though two
// knights can legally reach f3), picks whichever candidate leads to the
// longest greedy continuation over the next TIE_BREAK_LOOKAHEAD cells,
// rather than guessing at the ambiguous cell itself. This is what lets a
// scoresheet with that kind of underspecified "Nf3" still resolve
// correctly: the wrong knight typically leads to a dead end within a few
// moves (it blocks a later castle, or can no longer reach a square the
// sheet says it goes to), while the right one doesn't.
function matchCellsWithTieBreaking(cells: RecognizedCell[]): string[] {
  const chess = new Chess();
  const matched: string[] = [];

  for (let index = 0; index < cells.length; index++) {
    const legalMoves = chess.moves();
    if (legalMoves.length === 0) break;

    const candidates = candidateMoveMatches(cells[index].text, legalMoves);
    if (candidates.length === 0) break;

    let chosen = candidates[0];
    if (candidates.length > 1) {
      let bestScore = -1;
      for (const candidate of candidates) {
        const trial = new Chess(chess.fen());
        trial.move(candidate);
        const score = greedyMatchLength(
          trial.fen(),
          cells,
          index + 1,
          TIE_BREAK_LOOKAHEAD,
        );
        if (score > bestScore) {
          bestScore = score;
          chosen = candidate;
        }
      }
    }

    chess.move(chosen);
    matched.push(chosen);
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
  const matchedMoves = matchCellsWithTieBreaking(cells);
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
