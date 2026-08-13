/**
 * @jest-environment node
 */
// Gemini is called via plain fetch, so the network call itself is mocked
// here — these tests exercise parseImage's own logic (recognized move list
// -> legal-move matching -> PGN/result shape), not the real model's
// accuracy against real handwriting (see the README for that).
import { parseImage } from "@/lib/parse-image";

function mockGeminiResponse(text: string, status = 200) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
  }) as jest.Mock;
}

const REAL_IMAGE_BLOB = new Blob(["fake-image-bytes"], { type: "image/jpeg" });

describe("parseImage", () => {
  const originalApiKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-api-key";
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalApiKey;
    jest.restoreAllMocks();
  });

  it("assembles a valid PGN from a clean recognized move list", async () => {
    mockGeminiResponse('["c4","Nf6","Nf3","g6"]');

    const result = await parseImage(REAL_IMAGE_BLOB);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pgn).toContain("1. c4 Nf6 2. Nf3 g6");
  });

  it("tolerates the response being wrapped in prose or a code fence", async () => {
    mockGeminiResponse('Here you go:\n```json\n["c4","Nf6"]\n```');

    const result = await parseImage(REAL_IMAGE_BLOB);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pgn).toContain("1. c4 Nf6");
  });

  it("corrects near-miss readings via legal-move matching", async () => {
    // Same real near-misses validated in recognize-scoresheet.test.ts.
    mockGeminiResponse('["c4-","Nf6","NF3"]');

    const result = await parseImage(REAL_IMAGE_BLOB);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pgn).toContain("1. c4 Nf6 2. Nf3");
  });

  it("returns an error when nothing in the response matches a legal move", async () => {
    mockGeminiResponse('["totally wrong garbage"]');

    const result = await parseImage(REAL_IMAGE_BLOB);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Could not recognize any moves/);
  });

  it("returns an error when the response isn't a JSON array", async () => {
    mockGeminiResponse("I couldn't read this image clearly.");

    const result = await parseImage(REAL_IMAGE_BLOB);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Could not recognize any moves/);
  });

  it("returns an error when the API request fails", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    }) as jest.Mock;

    const result = await parseImage(REAL_IMAGE_BLOB);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/503/);
  });

  it("returns an error when GEMINI_API_KEY isn't configured", async () => {
    delete process.env.GEMINI_API_KEY;
    global.fetch = jest.fn();

    const result = await parseImage(REAL_IMAGE_BLOB);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/GEMINI_API_KEY/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
