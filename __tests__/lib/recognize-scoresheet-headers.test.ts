import { Chess } from "chess.js";
import {
  assembleGameFromRecognizedCells,
  type RecognizedCell,
} from "@/lib/recognize-scoresheet";

// Covers the optional `headers` parameter added to
// assembleGameFromRecognizedCells for the scoresheet's other recognized
// header fields (Event, Round, player names, etc.) — kept separate from
// recognize-scoresheet.test.ts so that file's existing cases stay untouched.
describe("assembleGameFromRecognizedCells with headers", () => {
  const cells: RecognizedCell[] = [
    { moveNumber: 1, color: "w", text: "c4" },
    { moveNumber: 1, color: "b", text: "Nf6" },
  ];

  it("sets recognizable header tags", () => {
    const result = assembleGameFromRecognizedCells(cells, undefined, {
      Round: "21",
      White: "Petrosian, Tigran V",
      WhiteElo: "2705",
    });

    const chess = new Chess();
    chess.loadPgn(result.pgn);
    const header = chess.header();
    expect(header.Round).toBe("21");
    expect(header.White).toBe("Petrosian, Tigran V");
    expect(header.WhiteElo).toBe("2705");
  });

  it("ignores tags outside the recognizable set", () => {
    const result = assembleGameFromRecognizedCells(cells, undefined, {
      Round: "21",
      NotARealTag: "should be dropped",
    });

    const chess = new Chess();
    chess.loadPgn(result.pgn);
    expect(chess.header().NotARealTag).toBeUndefined();
  });

  it("skips blank values instead of writing empty tags", () => {
    const result = assembleGameFromRecognizedCells(cells, undefined, {
      Round: "  ",
      Event: "",
    });

    const chess = new Chess();
    chess.loadPgn(result.pgn);
    // Untouched -> chess.js's own backfilled placeholder, not an empty string.
    expect(chess.header().Round).toBe("?");
  });

  it("works with no headers given at all, same as before this parameter existed", () => {
    const result = assembleGameFromRecognizedCells(cells);

    const chess = new Chess();
    chess.loadPgn(result.pgn);
    expect(chess.header().Round).toBe("?");
  });
});
