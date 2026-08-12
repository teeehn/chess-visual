import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import { makePgnFile, uploadFile } from "../test-utils";

const OPERA_GAME = `[Event "Paris"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7
8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7
14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

async function loadGameAtEnd(pgn: string) {
  const user = userEvent.setup();
  render(<Home />);
  await uploadFile(makePgnFile(pgn, "game.pgn"));
  await screen.findByText("Loaded: game.pgn");
  await user.click(screen.getByRole("button", { name: ">|" }));
}

describe("game ending display", () => {
  it("shows Checkmate on the final move of a mating game", async () => {
    await loadGameAtEnd(OPERA_GAME);
    expect(
      await screen.findByText("17. Rd8# Checkmate"),
    ).toBeInTheDocument();
  });

  it("attributes resignation to the losing side on a non-mating decisive result", async () => {
    const pgn = `[Result "0-1"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 0-1`;
    await loadGameAtEnd(pgn);
    expect(await screen.findByText("3... a6 White resigns")).toBeInTheDocument();
  });

  it("shows Draw for an agreed draw", async () => {
    const pgn = `[Result "1/2-1/2"]\n\n1. e4 e5 2. Nf3 Nc6 1/2-1/2`;
    await loadGameAtEnd(pgn);
    expect(await screen.findByText("2... Nc6 Draw")).toBeInTheDocument();
  });

  it("shows the normal side-to-move text away from the final move", async () => {
    await loadGameAtEnd(OPERA_GAME);
    await userEvent.setup().click(screen.getByRole("button", { name: "|<" }));
    expect(await screen.findByText("White to move")).toBeInTheDocument();
    expect(screen.queryByText(/Checkmate/)).not.toBeInTheDocument();
  });
});
