/**
 * @jest-environment node
 */
import { POST } from "@/app/api/parse-pgn/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/parse-pgn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/parse-pgn", () => {
  it("returns parsed moves for a valid PGN", async () => {
    const response = await POST(makeRequest({ pgn: "1. e4 e5 1-0" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.moves).toHaveLength(2);
    expect(body.moves[0].san).toBe("e4");
  });

  it("returns 400 for malformed PGN", async () => {
    const response = await POST(makeRequest({ pgn: "not a pgn" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/Could not parse PGN/);
  });

  it("returns 400 when the pgn field is missing", async () => {
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(400);
  });

  it("returns 400 for a non-JSON body", async () => {
    const badRequest = new Request("http://localhost/api/parse-pgn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    const response = await POST(badRequest);
    expect(response.status).toBe(400);
  });
});
