import { parsePgn } from "@/lib/parse-pgn";

describe("parsePgn", () => {
  it("parses a valid PGN into moves, metadata, and game-ending info", () => {
    const result = parsePgn(
      `[Event "Test"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0`,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.moves).toHaveLength(4);
    expect(result.moves[0]).toEqual({
      san: "e4",
      fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      moveNumber: 1,
      color: "w",
    });
    expect(result.metadata).toContainEqual({ label: "Event", value: "Test" });
    expect(result.gameEndText).toBe("Black resigns");
  });

  it("detects checkmate via the game-ending helper", () => {
    const result = parsePgn(
      "1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 " +
        "7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 " +
        "12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ " +
        "Nxb8 17. Rd8# 1-0",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.gameEndText).toBe("Checkmate");
  });

  it("returns an error for malformed PGN", () => {
    const result = parsePgn("this is not a pgn");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Could not parse PGN/);
  });

  it("returns an error for a PGN with no moves", () => {
    const result = parsePgn('[Event "Test"]\n[Result "*"]\n\n*');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("No moves found in this PGN.");
  });
});
