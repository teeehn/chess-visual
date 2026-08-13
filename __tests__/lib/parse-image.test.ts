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

  it("assembles a valid PGN and Result tag from a clean recognized game", async () => {
    mockGeminiResponse(
      '{"moves":["c4","Nf6","Nf3","g6"],"result":"1/2-1/2"}',
    );

    const result = await parseImage(REAL_IMAGE_BLOB);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pgn).toContain("1. c4 Nf6 2. Nf3 g6");
    expect(result.pgn).toContain('[Result "1/2-1/2"]');
  });

  it("tolerates the response being wrapped in prose or a code fence", async () => {
    mockGeminiResponse(
      'Here you go:\n```json\n{"moves":["c4","Nf6"],"result":"*"}\n```',
    );

    const result = await parseImage(REAL_IMAGE_BLOB);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pgn).toContain("1. c4 Nf6");
  });

  it("still works from a bare move array with no result field", async () => {
    mockGeminiResponse('["c4","Nf6","Nf3","g6"]');

    const result = await parseImage(REAL_IMAGE_BLOB);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pgn).toContain("1. c4 Nf6 2. Nf3 g6");
  });

  it("ignores a result value that isn't a valid PGN result token", async () => {
    mockGeminiResponse('{"moves":["c4","Nf6"],"result":"White wins"}');

    const result = await parseImage(REAL_IMAGE_BLOB);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pgn).toContain('[Result "*"]');
  });

  it("recognizes other header fields from the sheet, not just moves and result", async () => {
    mockGeminiResponse(
      '{"moves":["c4","Nf6"],"result":"1/2-1/2","headers":' +
        '{"Round":"21","Event":"World Championship 25th"}}',
    );

    const result = await parseImage(REAL_IMAGE_BLOB);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pgn).toContain('[Round "21"]');
    expect(result.pgn).toContain('[Event "World Championship 25th"]');
  });

  it("drops a recognized header key that isn't one of the sheet's real fields", async () => {
    mockGeminiResponse(
      '{"moves":["c4","Nf6"],"headers":{"NotARealTag":"garbage"}}',
    );

    const result = await parseImage(REAL_IMAGE_BLOB);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pgn).not.toContain("NotARealTag");
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

  it("returns an error when the response isn't JSON at all", async () => {
    mockGeminiResponse("I couldn't read this image clearly.");

    const result = await parseImage(REAL_IMAGE_BLOB);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Could not recognize any moves/);
  });

  it("returns an error when the API request fails with a non-retryable status", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({}),
    }) as jest.Mock;

    const result = await parseImage(REAL_IMAGE_BLOB);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/400/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries a transient 503 and succeeds once the service recovers", async () => {
    jest.useFakeTimers();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '["c4","Nf6"]' }] } }],
        }),
      });
    global.fetch = fetchMock as jest.Mock;

    const resultPromise = parseImage(REAL_IMAGE_BLOB);
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it("gives up and returns an error after repeated 503s", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    }) as jest.Mock;

    const resultPromise = parseImage(REAL_IMAGE_BLOB);
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/503/);
    expect(global.fetch).toHaveBeenCalledTimes(3);
    jest.useRealTimers();
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
