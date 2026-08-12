import { render, screen } from "@testing-library/react";
import Home from "@/app/page";
import {
  makeImageFile,
  makePgnFile,
  uploadFile,
} from "../test-utils";

describe("image upload", () => {
  it("shows a preview and placeholder message instead of a board", async () => {
    render(<Home />);
    await uploadFile(makeImageFile("scoresheet.png"));

    expect(await screen.findByText("Loaded: scoresheet.png")).toBeInTheDocument();
    expect(
      screen.getByAltText("Uploaded scoresheet"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/isn.t implemented yet/),
    ).toBeInTheDocument();

    // No board/nav for an image upload — nothing has been parsed into moves.
    expect(
      screen.queryByRole("button", { name: "Next >" }),
    ).not.toBeInTheDocument();
  });

  it("recognizes .heic files by extension even without a matching MIME type", async () => {
    render(<Home />);
    const heicFile = new File(["fake"], "scoresheet.heic", { type: "" });
    await uploadFile(heicFile);

    expect(
      await screen.findByAltText("Uploaded scoresheet"),
    ).toBeInTheDocument();
  });

  it("switches cleanly from an image back to a PGN game", async () => {
    render(<Home />);
    await uploadFile(makeImageFile("scoresheet.png"));
    await screen.findByAltText("Uploaded scoresheet");

    await uploadFile(makePgnFile("1. e4 e5 1-0", "game.pgn"));

    expect(await screen.findByText("Loaded: game.pgn")).toBeInTheDocument();
    expect(
      screen.queryByAltText("Uploaded scoresheet"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next >" })).toBeInTheDocument();
  });
});
