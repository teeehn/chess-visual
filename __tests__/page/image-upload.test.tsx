import { render, screen } from "@testing-library/react";
import Home from "@/app/page";
import {
  makeImageFile,
  makePgnFile,
  mockImageUploadFetch,
  mockParsePgnFetch,
  uploadFile,
} from "../test-utils";

describe("image upload", () => {
  it("renders the board once recognition succeeds, same as a direct PGN upload", async () => {
    mockImageUploadFetch({ ok: true, pgn: "1. e4 e5 2. Nf3 Nc6 1-0" });
    render(<Home />);
    await uploadFile(makeImageFile("scoresheet.png"));

    expect(await screen.findByText("Loaded: scoresheet.png")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next >" })).toBeInTheDocument();
    // The image preview is gone once a game is loaded from it.
    expect(
      screen.queryByAltText("Uploaded scoresheet"),
    ).not.toBeInTheDocument();
  });

  it("shows the preview and a loading message while recognition is in progress", async () => {
    let resolveImageFetch: (response: Response) => void = () => {};
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/parse-image")) {
        return new Promise<Response>((resolve) => {
          resolveImageFetch = resolve;
        });
      }
      throw new Error(`unexpected fetch to ${url}`);
    }) as jest.Mock;

    render(<Home />);
    await uploadFile(makeImageFile("scoresheet.png"));

    expect(
      await screen.findByAltText("Uploaded scoresheet"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Recognizing handwriting/),
    ).toBeInTheDocument();

    resolveImageFetch(
      new Response(
        JSON.stringify({ ok: false, error: "Could not recognize any text." }),
        { status: 400 },
      ),
    );

    expect(
      await screen.findByText("Could not recognize any text."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Recognizing handwriting/),
    ).not.toBeInTheDocument();
  });

  it("shows the recognizer's error and keeps the preview when recognition fails", async () => {
    mockImageUploadFetch({
      ok: false,
      error: "Recognized text doesn't form a valid game yet.",
    });
    render(<Home />);
    await uploadFile(makeImageFile("scoresheet.png"));

    expect(
      await screen.findByText("Recognized text doesn't form a valid game yet."),
    ).toBeInTheDocument();
    expect(screen.getByAltText("Uploaded scoresheet")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Next >" }),
    ).not.toBeInTheDocument();
  });

  it("shows a warning and still loads the game when recognition stops partway through", async () => {
    mockImageUploadFetch({
      ok: true,
      pgn: "1. e4 e5 1-0",
      warning:
        'Recognition stopped at move 2 (White): "totally wrong garbage" ' +
        "didn't match a legal move there. The game loaded up to that " +
        "point — check that move on the scoresheet.",
    });
    render(<Home />);
    await uploadFile(makeImageFile("scoresheet.png"));

    expect(await screen.findByText("Loaded: scoresheet.png")).toBeInTheDocument();
    expect(
      await screen.findByText(/Recognition stopped at move 2 \(White\)/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next >" })).toBeInTheDocument();
  });

  it("shows a generic error when the image recognition service is unreachable", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network down"));
    render(<Home />);
    await uploadFile(makeImageFile("scoresheet.png"));

    expect(
      await screen.findByText("Could not reach the image recognition service."),
    ).toBeInTheDocument();
    expect(screen.getByAltText("Uploaded scoresheet")).toBeInTheDocument();
  });

  it("recognizes .heic files by extension even without a matching MIME type", async () => {
    mockImageUploadFetch({ ok: false, error: "irrelevant for this test" });
    render(<Home />);
    const heicFile = new File(["fake"], "scoresheet.heic", { type: "" });
    await uploadFile(heicFile);

    expect(
      await screen.findByAltText("Uploaded scoresheet"),
    ).toBeInTheDocument();
  });

  it("switches cleanly from a successful image recognition back to a direct PGN upload", async () => {
    mockImageUploadFetch({ ok: true, pgn: "1. e4 e5 1-0" });
    render(<Home />);
    await uploadFile(makeImageFile("scoresheet.png"));
    await screen.findByText("Loaded: scoresheet.png");

    mockParsePgnFetch();
    await uploadFile(makePgnFile("1. d4 d5 1-0", "game.pgn"));

    expect(await screen.findByText("Loaded: game.pgn")).toBeInTheDocument();
    expect(
      screen.queryByAltText("Uploaded scoresheet"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next >" })).toBeInTheDocument();
  });

  it("switches cleanly from a failed image recognition back to a direct PGN upload", async () => {
    mockImageUploadFetch({ ok: false, error: "recognition failed" });
    render(<Home />);
    await uploadFile(makeImageFile("scoresheet.png"));
    await screen.findByText("recognition failed");

    mockParsePgnFetch();
    await uploadFile(makePgnFile("1. e4 e5 1-0", "game.pgn"));

    expect(await screen.findByText("Loaded: game.pgn")).toBeInTheDocument();
    expect(
      screen.queryByAltText("Uploaded scoresheet"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("recognition failed")).not.toBeInTheDocument();
  });
});
