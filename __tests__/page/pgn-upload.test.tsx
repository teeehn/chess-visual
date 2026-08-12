import { render, screen } from "@testing-library/react";
import Home from "@/app/page";
import { makePgnFile, mockParsePgnFetch, uploadFile } from "../test-utils";

describe("PGN upload", () => {
  beforeEach(() => mockParsePgnFetch());

  it("loads a valid PGN and starts at the pre-move position", async () => {
    render(<Home />);
    await uploadFile(makePgnFile("1. e4 e5 2. Nf3 Nc6 1-0", "game.pgn"));

    expect(await screen.findByText("Loaded: game.pgn")).toBeInTheDocument();
    expect(screen.getByText("Start")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "< Prev" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next >" })).toBeEnabled();
  });

  it("shows an error for malformed PGN and doesn't crash", async () => {
    render(<Home />);
    await uploadFile(makePgnFile("this is not a pgn", "bad.pgn"));

    expect(await screen.findByText(/Could not parse PGN/)).toBeInTheDocument();
    expect(screen.queryByText(/^Loaded:/)).not.toBeInTheDocument();
  });

  it("shows an error when the PGN has no moves", async () => {
    render(<Home />);
    await uploadFile(
      makePgnFile('[Event "Test"]\n[Result "*"]\n\n*', "empty.pgn"),
    );

    expect(
      await screen.findByText("No moves found in this PGN."),
    ).toBeInTheDocument();
  });

  it("recovers cleanly after an error when a valid PGN is uploaded next", async () => {
    render(<Home />);
    await uploadFile(makePgnFile("garbage", "bad.pgn"));
    expect(await screen.findByText(/Could not parse PGN/)).toBeInTheDocument();

    await uploadFile(makePgnFile("1. e4 e5 1-0", "good.pgn"));
    expect(await screen.findByText("Loaded: good.pgn")).toBeInTheDocument();
    expect(screen.queryByText(/Could not parse PGN/)).not.toBeInTheDocument();
  });
});
