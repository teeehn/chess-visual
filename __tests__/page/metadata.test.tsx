import { render, screen } from "@testing-library/react";
import Home from "@/app/page";
import { makePgnFile, mockParsePgnFetch, uploadFile } from "../test-utils";

describe("PGN metadata panel", () => {
  beforeEach(() => mockParsePgnFetch());

  it("displays populated header tags", async () => {
    const pgn = `[Event "World Championship 25th"]
[Site "Moscow"]
[Date "1963.??.??"]
[Round "1"]
[White "Petrosian, Tigran V"]
[Black "Botvinnik, Mikhail"]
[Result "0-1"]
[WhiteElo ""]
[BlackElo ""]
[ECO "E35"]

1. d4 Nf6 0-1`;
    render(<Home />);
    await uploadFile(makePgnFile(pgn, "game.pgn"));

    expect(await screen.findByText("Event:")).toBeInTheDocument();
    expect(
      screen.getByText("World Championship 25th"),
    ).toBeInTheDocument();
    expect(screen.getByText("Moscow")).toBeInTheDocument();
    expect(screen.getByText("1963.??.??")).toBeInTheDocument();
    expect(screen.getByText("Petrosian, Tigran V")).toBeInTheDocument();
    expect(screen.getByText("Botvinnik, Mikhail")).toBeInTheDocument();
    expect(screen.getByText("E35")).toBeInTheDocument();
  });

  it("hides tags that are blank in the file", async () => {
    const pgn = `[Event "Test"]\n[WhiteElo ""]\n[BlackElo ""]\n[Result "1-0"]\n\n1. e4 1-0`;
    render(<Home />);
    await uploadFile(makePgnFile(pgn, "game.pgn"));

    await screen.findByText("Event:");
    expect(screen.queryByText("White Elo:")).not.toBeInTheDocument();
    expect(screen.queryByText("Black Elo:")).not.toBeInTheDocument();
  });

  it("still shows an unknown '*' result even with no other tag data", async () => {
    render(<Home />);
    await uploadFile(makePgnFile("1. e4 e5 2. Nf3 Nc6 *", "bare.pgn"));

    // "*" isn't a "?"/"." placeholder, so unlike the backfilled Seven Tag
    // Roster defaults it's treated as real data (see lib/pgn-metadata tests).
    expect(await screen.findByText("Result:")).toBeInTheDocument();
    expect(screen.getByText("*")).toBeInTheDocument();
    expect(screen.queryByText("Event:")).not.toBeInTheDocument();
  });

  it("shows only Result when a decisive result is inferred but no tags exist", async () => {
    render(<Home />);
    await uploadFile(makePgnFile("1. e4 e5 2. Nf3 Nc6 1-0", "bare.pgn"));

    expect(await screen.findByText("Result:")).toBeInTheDocument();
    expect(screen.getByText("1-0")).toBeInTheDocument();
    expect(screen.queryByText("Event:")).not.toBeInTheDocument();
  });
});
