import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import { makePgnFile, uploadFile } from "../test-utils";

const GAME = "1. e4 e5 2. Nf3 Nc6 3. Bb5 1-0";

async function loadGame() {
  render(<Home />);
  await uploadFile(makePgnFile(GAME, "game.pgn"));
  await screen.findByText("Loaded: game.pgn");
}

describe("move navigation", () => {
  it("steps forward and back through moves via the nav buttons", async () => {
    const user = userEvent.setup();
    await loadGame();

    await user.click(screen.getByRole("button", { name: "Next >" }));
    expect(await screen.findByText("1. e4 Black to move")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next >" }));
    expect(
      await screen.findByText("1... e5 White to move"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "< Prev" }));
    expect(await screen.findByText("1. e4 Black to move")).toBeInTheDocument();
  });

  it("jumps to the end and back to the start", async () => {
    const user = userEvent.setup();
    await loadGame();

    await user.click(screen.getByRole("button", { name: ">|" }));
    expect(await screen.findByText("Move 3 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next >" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "|<" }));
    expect(await screen.findByText("Start")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "< Prev" })).toBeDisabled();
  });

  it("jumps directly to a clicked move in the move list", async () => {
    const user = userEvent.setup();
    await loadGame();

    // The move list is intentionally rendered twice (a width-matched
    // mobile copy and a desktop sidebar copy, toggled with CSS only) —
    // both exist in the DOM regardless of viewport, so pick the first.
    const nf3Buttons = await screen.findAllByRole("button", {
      name: "2. Nf3",
    });
    await user.click(nf3Buttons[0]);

    expect(await screen.findByText("Move 2 / 3")).toBeInTheDocument();
  });

  it("supports arrow-key navigation", async () => {
    await loadGame();

    // GAME is 1.e4 e5 2.Nf3 Nc6 3.Bb5 — 5 plies, move numbers 1,1,2,2,3.
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await screen.findByText("1. e4 Black to move")).toBeInTheDocument();
    expect(screen.getByText("Move 1 / 3")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(
      await screen.findByText("1... e5 White to move"),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(
      await screen.findByText("2. Nf3 Black to move"),
    ).toBeInTheDocument();
    expect(screen.getByText("Move 2 / 3")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(
      await screen.findByText("1... e5 White to move"),
    ).toBeInTheDocument();
  });
});
