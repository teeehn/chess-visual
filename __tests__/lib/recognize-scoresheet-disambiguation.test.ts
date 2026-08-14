import { Chess } from "chess.js";
import {
  assembleGameFromRecognizedCells,
  type RecognizedCell,
} from "@/lib/recognize-scoresheet";

// Covers disambiguation ties found testing against real handwritten
// scoresheets: a player often omits SAN disambiguation even when
// chess.js's own move list requires it (writing "Nf3" when two knights
// can legally reach f3, so the actual legal move strings are "Ngf3"/
// "Ndf3"). A tie is treated as "no confident match" and stops recognition
// there, keeping the correctly-recognized prefix — an earlier version
// tried to resolve ties by guessing via lookahead, but that wasn't
// reliable enough on messy real scoresheets and was rolled back. Kept
// separate from recognize-scoresheet.test.ts so that file's existing
// cases stay untouched.

function cellsFrom(moves: string[]): RecognizedCell[] {
  return moves.map((text, i) => ({
    moveNumber: Math.floor(i / 2) + 1,
    color: i % 2 === 0 ? "w" : "b",
    text,
  }));
}

describe("assembleGameFromRecognizedCells stops cleanly at a disambiguation tie", () => {
  it("stops at an underspecified knight move rather than guessing which knight", () => {
    // After 1.d4 Nf6 2.Bf4 g6 3.e3 d6 4.Nd2 Bg7, both knights (g1 and d2)
    // can legally reach f3, so "Nf3" as written is ambiguous between
    // "Ngf3" and "Ndf3" -- a genuine tie, not resolvable from the text
    // alone.
    const moves = [
      "d4", "Nf6", "Bf4", "g6", "e3", "d6", "Nd2", "Bg7", "Nf3", "O-O",
    ];
    const result = assembleGameFromRecognizedCells(cellsFrom(moves));

    expect(result.movesRecognized).toBe(8);
    const chess = new Chess();
    chess.loadPgn(result.pgn);
    expect(chess.history()).toEqual([
      "d4", "Nf6", "Bf4", "g6", "e3", "d6", "Nd2", "Bg7",
    ]);
  });

  it("stops at a coincidental tie between different pieces the same way", () => {
    // After 1.e4 c5 2.Nf3 Nc6 3.Nc3 g6 4.Bc4 d6 5.Bxf7+ Kxf7 6.Ng5+ Ke8
    // 7.d3 e5 8.Qf3 Qf6 9.Nd5 Qxf3 10.gxf3 Bh6 11.Nc7+ Kd8 12.Nxa8, both
    // black knights (c6 and g8) can legally reach e7, so "Ne7" is
    // ambiguous between "Nge7"/"Nce7" -- a genuine tie (the piece-letter
    // scoping in candidateMoveMatches excludes the coincidentally-tied
    // "Ke7", but the remaining two-knight tie is real and unresolved).
    const moves = [
      "e4", "c5", "Nf3", "Nc6", "Nc3", "g6", "Bc4", "d6", "Bxf7+", "Kxf7",
      "Ng5+", "Ke8", "d3", "e5", "Qf3", "Qf6", "Nd5", "Qxf3", "gxf3", "Bh6",
      "Nc7+", "Kd8", "Nxa8", "Ne7",
    ];
    const result = assembleGameFromRecognizedCells(cellsFrom(moves));

    expect(result.movesRecognized).toBe(23);
  });

  it("keeps the correct prefix on a longer real game with a mid-game tie, instead of guessing at it", () => {
    // The exact recognized move list from a real photographed scoresheet.
    // The tie at "Nf3" (index 8) previously got resolved (sometimes
    // correctly, sometimes not) via lookahead; now it just stops there.
    const moves = [
      "d4", "Nf6", "Bf4", "g6", "e3", "d6", "Nd2", "Bg7", "Nf3", "O-O",
      "Bd3", "Nd7", "c3", "c5", "Qc2", "Qc7", "Rc1", "b6", "O-O", "Bb7",
      "Rfe1", "Rfc8", "e4", "e5", "dxe5", "Nxe5", "Nxe5", "dxe5", "Bg3",
      "Re8", "f3", "Rad8", "Nc4", "Nh5", "Bh4", "f6", "Qb3", "Kh8", "Bb1",
      "Rd7", "Red1", "Red8", "Rxd7", "Rxd7", "Qa4", "Bc6", "Qb3", "b5",
      "Ne3", "c4", "Nxc4", "bxc4", "Qxc4", "Qb7", "b4", "Nf4", "a3", "Bb5",
      "Qb3", "Qc8", "Kh1", "Bc4", "Qa4", "a6", "Rd1", "Bb5", "Qc2", "Bd3",
      "Qb3", "Qb8", "Bxd3", "Rxd3", "Rxd3", "Qxd3", "h3", "Qd2",
    ];
    const result = assembleGameFromRecognizedCells(cellsFrom(moves));

    expect(result.movesRecognized).toBe(8);
    const chess = new Chess();
    chess.loadPgn(result.pgn);
    expect(chess.history()).toEqual([
      "d4", "Nf6", "Bf4", "g6", "e3", "d6", "Nd2", "Bg7",
    ]);
  });
});
