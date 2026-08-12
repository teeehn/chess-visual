import userEvent from "@testing-library/user-event";

export function makePgnFile(pgn: string, name = "game.pgn") {
  return new File([pgn], name, { type: "text/plain" });
}

export function makeImageFile(name = "scoresheet.png") {
  return new File(["fake-image-bytes"], name, { type: "image/png" });
}

// The file input has no accessible name distinct enough to query reliably
// (its label's text changes between "Click to upload" / "Choose a
// different file"), so tests upload through the raw input element.
export async function uploadFile(file: File) {
  const user = userEvent.setup();
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  await user.upload(input, file);
}
