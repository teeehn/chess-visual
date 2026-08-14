import { Chess } from "chess.js";
import {
  bestLegalMoveMatch,
  assembleGameFromRecognizedCells,
  type RecognizedCell,
} from "@/lib/recognize-scoresheet";

describe("bestLegalMoveMatch", () => {
  it("matches an exact case-insensitive reading", () => {
    expect(bestLegalMoveMatch("nf3", ["Nf3", "Nc3", "e4"])).toBe("Nf3");
  });

  it("matches real near-miss OCR errors found in testing (stray trailing char)", () => {
    // Actual result from testing against the real fixture: "c4" -> "c4-"
    expect(bestLegalMoveMatch("c4-", ["c4", "d4", "Nf3"])).toBe("c4");
  });

  it("matches real near-miss OCR errors found in testing (wrong letter case)", () => {
    // Actual result from testing against the real fixture: "Nf3" -> "NF3"
    expect(bestLegalMoveMatch("NF3", ["Nf3", "Nc3", "e4"])).toBe("Nf3");
  });

  it("does not match a badly wrong reading rather than guessing", () => {
    // Actual result from testing: isolated "Nf6" -> "NFC 2"
    expect(bestLegalMoveMatch("NFC 2", ["Nf6", "Nc6", "d5", "e5"])).toBeNull();
  });

  it("returns null for a blank cell", () => {
    expect(bestLegalMoveMatch("   ", ["e4", "d4"])).toBeNull();
  });

  it("refuses to guess when two legal moves are equally close", () => {
    // "e4" is edit-distance 1 from both "e5" and "d4"... construct a
    // genuinely tied case instead: "xy" is distance 1 from both "xz" and
    // "wy".
    expect(bestLegalMoveMatch("xy", ["xz", "wy"])).toBeNull();
  });

  it("returns null when nothing is close enough", () => {
    expect(bestLegalMoveMatch("zzzzzz", ["e4", "d4", "Nf3"])).toBeNull();
  });
});

describe("assembleGameFromRecognizedCells", () => {
  // Round 21, 1963 World Championship (see __tests__/fixtures/1963-round21.pgn):
  // 1.c4 Nf6 2.Nf3 g6 3.Nc3 d5 4.cxd5 Nxd5 5.e4 Nxc3 6.dxc3 Qxd1+ 7.Kxd1 Bg4
  // 8.Be2 Nd7 9.Be3 e5 10.Nd2

  it("assembles a full game from perfectly recognized cells", () => {
    const cells: RecognizedCell[] = [
      { moveNumber: 1, color: "w", text: "c4" },
      { moveNumber: 1, color: "b", text: "Nf6" },
      { moveNumber: 2, color: "w", text: "Nf3" },
      { moveNumber: 2, color: "b", text: "g6" },
    ];
    const result = assembleGameFromRecognizedCells(cells);
    expect(result.movesRecognized).toBe(4);

    const chess = new Chess();
    chess.loadPgn(result.pgn);
    expect(chess.history()).toEqual(["c4", "Nf6", "Nf3", "g6"]);
  });

  it("assembles the real game correctly despite the real near-miss OCR errors found in testing", () => {
    const cells: RecognizedCell[] = [
      { moveNumber: 1, color: "w", text: "c4-" }, // real near-miss
      { moveNumber: 1, color: "b", text: "Nf6" },
      { moveNumber: 2, color: "w", text: "NF3" }, // real near-miss
      { moveNumber: 2, color: "b", text: "g6" },
    ];
    const result = assembleGameFromRecognizedCells(cells);
    expect(result.movesRecognized).toBe(4);

    const chess = new Chess();
    chess.loadPgn(result.pgn);
    expect(chess.history()).toEqual(["c4", "Nf6", "Nf3", "g6"]);
  });

  it("stops at the first cell that doesn't confidently match, keeping the correct prefix", () => {
    const cells: RecognizedCell[] = [
      { moveNumber: 1, color: "w", text: "c4" },
      { moveNumber: 1, color: "b", text: "Nf6" },
      { moveNumber: 2, color: "w", text: "totally wrong garbage" },
      { moveNumber: 2, color: "b", text: "g6" }, // never reached
    ];
    const result = assembleGameFromRecognizedCells(cells);
    expect(result.movesRecognized).toBe(2);

    const chess = new Chess();
    chess.loadPgn(result.pgn);
    expect(chess.history()).toEqual(["c4", "Nf6"]);
  });

  it("stops at a blank cell (end of the recorded game)", () => {
    const cells: RecognizedCell[] = [
      { moveNumber: 1, color: "w", text: "c4" },
      { moveNumber: 1, color: "b", text: "Nf6" },
      { moveNumber: 2, color: "w", text: "" },
      { moveNumber: 2, color: "b", text: "" },
    ];
    const result = assembleGameFromRecognizedCells(cells);
    expect(result.movesRecognized).toBe(2);
  });

  it("returns an empty-game PGN when nothing matches at all", () => {
    const cells: RecognizedCell[] = [
      { moveNumber: 1, color: "w", text: "garbage" },
    ];
    const result = assembleGameFromRecognizedCells(cells);
    expect(result.movesRecognized).toBe(0);
  });
});
