import userEvent from "@testing-library/user-event";
import { parsePgn } from "@/lib/parse-pgn";

export function makePgnFile(pgn: string, name = "game.pgn") {
  return new File([pgn], name, { type: "text/plain" });
}

export function makeImageFile(name = "scoresheet.png") {
  return new File(["fake-image-bytes"], name, { type: "image/png" });
}

// The file input has no accessible name distinct enough to query reliably
// (its label's text changes between "Click to upload" / "Choose a
// different file"), so tests upload through the raw input element.
// page.tsx now posts to /api/parse-pgn instead of parsing locally. Tests
// run under jsdom with no real server listening, so stub fetch to run the
// same parsePgn logic the real route handler calls — this keeps tests
// exercising real parsing behavior without a network round trip, and stays
// correct automatically if parsePgn's behavior changes.
export function mockParsePgnFetch() {
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (!url.endsWith("/api/parse-pgn")) {
      throw new Error(`mockParsePgnFetch: unexpected fetch to ${url}`);
    }
    const { pgn } = JSON.parse((init?.body as string) ?? "{}");
    const result = parsePgn(pgn ?? "");
    return { json: async () => result } as Response;
  }) as jest.Mock;
}

export async function uploadFile(file: File) {
  const user = userEvent.setup();
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  await user.upload(input, file);
}
