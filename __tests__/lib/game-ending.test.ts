import { Chess } from "chess.js";
import { describeGameEnding } from "@/lib/game-ending";

describe("describeGameEnding", () => {
  it("detects checkmate", () => {
    const chess = new Chess();
    chess.loadPgn(
      "1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 " +
        "7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 " +
        "12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ " +
        "Nxb8 17. Rd8# 1-0",
    );

    expect(describeGameEnding(chess, chess.header().Result)).toBe(
      "Checkmate",
    );
  });

  it("detects stalemate", () => {
    const chess = new Chess("k7/2K5/1Q6/8/8/8/8/8 b - - 0 1");
    expect(describeGameEnding(chess)).toBe("Stalemate");
  });

  it("detects insufficient material", () => {
    const chess = new Chess("8/8/8/4k3/8/8/4K3/8 w - - 0 1");
    expect(describeGameEnding(chess)).toBe("Draw by insufficient material");
  });

  it("detects the fifty-move rule", () => {
    const chess = new Chess("4k3/8/8/8/8/8/8/R3K3 w Q - 100 60");
    expect(describeGameEnding(chess)).toBe("Draw by the 50-move rule");
  });

  it("detects threefold repetition", () => {
    const chess = new Chess();
    ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"].forEach((m) =>
      chess.move(m),
    );
    expect(describeGameEnding(chess)).toBe("Draw by repetition");
  });

  it("attributes resignation to the losing side when White won", () => {
    const chess = new Chess(); // non-terminal position, decisive result tag
    expect(describeGameEnding(chess, "1-0")).toBe("Black resigns");
  });

  it("attributes resignation to the losing side when Black won", () => {
    const chess = new Chess();
    expect(describeGameEnding(chess, "0-1")).toBe("White resigns");
  });

  it("reports a plain draw when the result is drawn but not a forced draw", () => {
    const chess = new Chess();
    expect(describeGameEnding(chess, "1/2-1/2")).toBe("Draw");
  });

  it("returns null when the game hasn't concluded", () => {
    const chess = new Chess();
    expect(describeGameEnding(chess, "*")).toBeNull();
    expect(describeGameEnding(chess, undefined)).toBeNull();
  });
});
