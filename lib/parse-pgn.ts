import { Chess } from "chess.js";
import { extractMetadata, type MetadataEntry } from "./pgn-metadata";
import { describeGameEnding } from "./game-ending";

export type PlyMove = {
  san: string;
  fen: string;
  moveNumber: number;
  color: "w" | "b";
};

export type ParsePgnResult =
  | {
      ok: true;
      moves: PlyMove[];
      metadata: MetadataEntry[];
      gameEndText: string | null;
    }
  | { ok: false; error: string };

export function parsePgn(pgnText: string): ParsePgnResult {
  const chess = new Chess();

  try {
    chess.loadPgn(pgnText);
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ?
          `Could not parse PGN: ${err.message}`
        : "Could not parse PGN.",
    };
  }

  const history = chess.history({ verbose: true });
  const moves: PlyMove[] = history.map((m, i) => ({
    san: m.san,
    fen: m.after,
    moveNumber: Math.floor(i / 2) + 1,
    color: m.color,
  }));

  if (moves.length === 0) {
    return { ok: false, error: "No moves found in this PGN." };
  }

  return {
    ok: true,
    moves,
    metadata: extractMetadata(chess),
    gameEndText: describeGameEnding(chess, chess.header().Result),
  };
}
