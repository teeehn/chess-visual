import { Chess } from "chess.js";
import {
  assembleGameFromRecognizedCells,
  type RecognizedCell,
} from "@/lib/recognize-scoresheet";

// Covers the optional `result` parameter added to
// assembleGameFromRecognizedCells for setting a scoresheet's own recorded
// result (from its RESULT box) — kept separate from
// recognize-scoresheet.test.ts so that file's existing cases stay untouched.
describe("assembleGameFromRecognizedCells with a result", () => {
  const cells: RecognizedCell[] = [
    { moveNumber: 1, color: "w", text: "c4" },
    { moveNumber: 1, color: "b", text: "Nf6" },
  ];

  it("sets the Result header when given a valid PGN result token", () => {
    const result = assembleGameFromRecognizedCells(cells, "1/2-1/2");

    const chess = new Chess();
    chess.loadPgn(result.pgn);
    expect(chess.header().Result).toBe("1/2-1/2");
  });

  it.each(["1-0", "0-1", "1/2-1/2", "*"])(
    "accepts %s as a valid result token",
    (token) => {
      const result = assembleGameFromRecognizedCells(cells, token);
      const chess = new Chess();
      chess.loadPgn(result.pgn);
      expect(chess.header().Result).toBe(token);
    },
  );

  it("ignores a result that isn't one of the four valid PGN tokens", () => {
    const result = assembleGameFromRecognizedCells(cells, "White wins");

    const chess = new Chess();
    chess.loadPgn(result.pgn);
    expect(chess.header().Result).toBe("*");
  });

  it("defaults to '*' when no result is given, same as before this parameter existed", () => {
    const result = assembleGameFromRecognizedCells(cells);

    const chess = new Chess();
    chess.loadPgn(result.pgn);
    expect(chess.header().Result).toBe("*");
  });
});
