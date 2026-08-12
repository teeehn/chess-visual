import { Chess } from "chess.js";

export function describeGameEnding(chess: Chess, result?: string | null) {
  if (chess.isCheckmate()) return "Checkmate";
  if (chess.isStalemate()) return "Stalemate";
  if (chess.isInsufficientMaterial()) return "Draw by insufficient material";
  if (chess.isThreefoldRepetition()) return "Draw by repetition";
  if (chess.isDrawByFiftyMoves()) return "Draw by the 50-move rule";

  if (result === "1/2-1/2") return "Draw";
  if (result === "1-0") return "Black resigns";
  if (result === "0-1") return "White resigns";
  return null;
}
