import { Chess } from "chess.js";
import {
  assembleGameFromRecognizedCells,
  type RecognizedCell,
} from "@/lib/recognize-scoresheet";

// Covers a real bug found testing against real handwritten scoresheets:
// a player often omits SAN disambiguation even when chess.js's own move
// list requires it (writing "Nf3" when two knights can legally reach f3,
// so the actual legal move strings are "Ngf3"/"Ndf3"). The old matcher
// treated any tie as unresolvable and stopped the whole game there —
// on a real 76-move game this meant only 8 plies came back. Kept
// separate from recognize-scoresheet.test.ts so that file's existing
// cases stay untouched.

function cellsFrom(moves: string[]): RecognizedCell[] {
  return moves.map((text, i) => ({
    moveNumber: Math.floor(i / 2) + 1,
    color: i % 2 === 0 ? "w" : "b",
    text,
  }));
}

describe("assembleGameFromRecognizedCells resolves disambiguation ties via lookahead", () => {
  it("resolves an underspecified knight move using later moves as evidence", () => {
    // After 1.d4 Nf6 2.Bf4 g6 3.e3 d6 4.Nd2 Bg7, both knights (g1 and d2)
    // can legally reach f3, so "Nf3" as written is ambiguous between
    // "Ngf3" and "Ndf3". Only "Ngf3" leaves the later "Nc4" (a d2-knight
    // move) playable — "Ndf3" would leave no knight able to reach c4.
    const moves = [
      "d4", "Nf6", "Bf4", "g6", "e3", "d6", "Nd2", "Bg7", "Nf3", "O-O",
      "Bd3", "Nd7", "c3", "c5", "Qc2", "Qc7", "Rc1", "b6", "O-O", "Bb7",
      "Rfe1", "Rfc8", "e4", "e5", "dxe5", "Nxe5", "Nxe5", "dxe5", "Bg3",
      "Re8", "f3", "Rad8", "Nc4",
    ];
    const result = assembleGameFromRecognizedCells(cellsFrom(moves));

    expect(result.movesRecognized).toBe(moves.length);
    const chess = new Chess();
    chess.loadPgn(result.pgn);
    expect(chess.history()).toContain("Ngf3");
    expect(chess.history()).not.toContain("Ndf3");
  });

  it("resolves an underspecified two-knight move the same way (Nd7 -> Nbd7)", () => {
    // At move 6, both black knights (b8 and f6) can legally reach d7.
    const moves = [
      "d4", "Nf6", "Bf4", "g6", "e3", "d6", "Nd2", "Bg7", "Nf3", "O-O",
      "Bd3", "Nd7",
    ];
    const result = assembleGameFromRecognizedCells(cellsFrom(moves));

    expect(result.movesRecognized).toBe(moves.length);
    const chess = new Chess();
    chess.loadPgn(result.pgn);
    expect(chess.history()).toContain("Nbd7");
  });

  it("prefers same-piece candidates over a coincidentally tied different piece", () => {
    // After 1.e4 c5 2.Nf3 Nc6 3.Nc3 g6 4.Bc4 d6 5.Bxf7+ Kxf7 6.Ng5+ Ke8
    // 7.d3 e5 8.Qf3 Qf6 9.Nd5 Qxf3 10.gxf3 Bh6 11.Nc7+ Kd8 12.Nxa8, both
    // black knights (c6 and g8, since only the c6 one has moved) can
    // legally reach e7 -- but "Ke7" (the king) is *also* edit-distance 1
    // from "Ne7" purely by coincidence (N -> K). Without piece-letter
    // scoping the tie-break lookahead picked the king move; with it,
    // only the two genuine knight candidates are considered.
    const moves = [
      "e4", "c5", "Nf3", "Nc6", "Nc3", "g6", "Bc4", "d6", "Bxf7+", "Kxf7",
      "Ng5+", "Ke8", "d3", "e5", "Qf3", "Qf6", "Nd5", "Qxf3", "gxf3", "Bh6",
      "Nc7+", "Kd8", "Nxa8", "Ne7",
    ];
    const result = assembleGameFromRecognizedCells(cellsFrom(moves));

    expect(result.movesRecognized).toBe(moves.length);
    const chess = new Chess();
    chess.loadPgn(result.pgn);
    const lastMove = chess.history()[chess.history().length - 1];
    expect(["Nge7", "Nce7"]).toContain(lastMove);
  });

  it("fully reconstructs a real 76-ply game with a mid-game disambiguation tie", () => {
    // The exact recognized move list from a real photographed scoresheet
    // that regressed to only 8 recognized plies before this fix.
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
    expect(result.movesRecognized).toBe(moves.length);
  });

  it("fully reconstructs a real 105-ply game with a coincidental-tie disambiguation and OCR typos", () => {
    // The exact recognized move list from a second real photographed
    // scoresheet, including two genuine OCR typos ("Qxes" for "Qxe5",
    // "Ral" for "Ra1") that the existing fuzzy matching already handled,
    // plus the "Ne7" vs "Ke7"/"Nge7"/"Nce7" coincidental tie above.
    const moves = [
      "e4", "c5", "Nf3", "Nc6", "Nc3", "g6", "Bc4", "d6", "Bxf7+", "Kxf7",
      "Ng5+", "Ke8", "d3", "e5", "Qf3", "Qf6", "Nd5", "Qxf3", "gxf3", "Bh6",
      "Nc7+", "Kd8", "Nxa8", "Ne7", "Nf7+", "Ke8", "Nxh8", "Bg7", "Nxg6",
      "hxg6", "Rg1", "Nd4", "Kf1", "Bh3+", "Rg2", "Nxf3", "Nc7+", "Kf7",
      "a4", "Bxg2+", "Kxg2", "Ne1+", "Kg1", "Nxc2", "Ra2", "Nc4", "Ral",
      "Nxd3", "a5", "Nxel", "Rel", "Bh6", "Ral", "Nc6", "a6", "b6", "Rd1",
      "Nd4", "Rxd4", "cxd4", "Nb4", "c3", "Ke1", "Bc1", "Kd1", "Bxb2",
      "Nxa7", "Bd4", "Nb5", "Bxf2", "a7", "g5", "a8=Q", "Kg6", "Nxd6",
      "Kh5", "h3", "Kh4", "Qh8+", "Kg3", "Nf5+", "Kf3", "Qxes", "g4",
      "Nd4+", "Bxd4", "Qxd4", "gxh3", "Qxd3+", "Kg4", "e5", "h2", "Qf1",
      "b5", "Qg2+", "Kf5", "Qxh2", "e4", "Ke1", "Ke6", "Kb2", "Kd5", "Qe2",
      "Ke5", "e6",
    ];
    const result = assembleGameFromRecognizedCells(
      cellsFrom(moves),
      "1-0",
    );
    expect(result.movesRecognized).toBe(moves.length);
  }, 10000);
});
