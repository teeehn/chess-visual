import { Chess } from "chess.js";
import { extractMetadata } from "@/lib/pgn-metadata";

function loadPgn(pgn: string) {
  const chess = new Chess();
  chess.loadPgn(pgn);
  return chess;
}

describe("extractMetadata", () => {
  it("extracts populated tags in spec order with friendly labels", () => {
    const chess = loadPgn(
      `[Event "World Championship 25th"]
[Site "Moscow"]
[Date "1963.??.??"]
[Round "1"]
[White "Petrosian, Tigran V"]
[Black "Botvinnik, Mikhail"]
[Result "0-1"]
[ECO "E35"]

1. d4 Nf6 0-1`,
    );

    expect(extractMetadata(chess)).toEqual([
      { label: "Event", value: "World Championship 25th" },
      { label: "Site", value: "Moscow" },
      { label: "Date", value: "1963.??.??" },
      { label: "Round", value: "1" },
      { label: "White", value: "Petrosian, Tigran V" },
      { label: "Black", value: "Botvinnik, Mikhail" },
      { label: "Result", value: "0-1" },
      { label: "ECO", value: "E35" },
    ]);
  });

  it("omits tags that are present but blank", () => {
    const chess = loadPgn(
      `[Event "Test"]
[WhiteElo ""]
[BlackElo ""]
[Result "1-0"]

1. e4 1-0`,
    );

    const labels = extractMetadata(chess).map((e) => e.label);
    expect(labels).not.toContain("White Elo");
    expect(labels).not.toContain("Black Elo");
  });

  it("omits chess.js's spec-placeholder values for tags the file never set", () => {
    // No tag section at all — chess.js backfills Seven Tag Roster
    // defaults ("?", "????.??.??") that shouldn't be treated as real data.
    const chess = loadPgn("1. e4 e5 2. Nf3 Nc6 1-0");

    const labels = extractMetadata(chess).map((e) => e.label);
    expect(labels).toEqual(["Result"]);
  });

  it("keeps partially-known values like a year with unknown month/day", () => {
    const chess = loadPgn(`[Date "1963.??.??"]\n\n1. e4 *`);
    const dateEntry = extractMetadata(chess).find((e) => e.label === "Date");
    expect(dateEntry?.value).toBe("1963.??.??");
  });

  it("still includes an unknown '*' result, unlike '?' placeholders", () => {
    // "*" isn't matched by the "?"/"." placeholder pattern, so — unlike
    // the backfilled Seven Tag Roster defaults — it's treated as real data.
    const chess = loadPgn("1. e4 e5 *");
    expect(extractMetadata(chess)).toEqual([{ label: "Result", value: "*" }]);
  });
});
