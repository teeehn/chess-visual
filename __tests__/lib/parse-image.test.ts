// Model loading is expensive and network-dependent, so @huggingface/transformers
// is mocked here — these tests exercise parseImage's own logic (recognized
// text → PGN validation → result shape), not the real model's accuracy.
jest.mock("@huggingface/transformers", () => ({
  pipeline: jest.fn(),
}));

// parseImage caches its pipeline in a module-level singleton (so the real
// model only loads once per server process, not per request). That's
// exactly what we want in production but means tests need a fresh module
// instance each time, or they'd all share one test's mock after the first
// call. Re-import both the mock and the module under test together after
// resetModules so they stay in sync.
async function loadParseImage() {
  jest.resetModules();
  const { pipeline } = await import("@huggingface/transformers");
  const { parseImage } = await import("@/lib/parse-image");
  return { parseImage, mockPipeline: pipeline as jest.Mock };
}

function mockRecognizedText(text: string) {
  return jest.fn().mockResolvedValue([{ generated_text: text }]);
}

describe("parseImage", () => {
  it("returns the recognized text as PGN when it parses as a valid game", async () => {
    const { parseImage, mockPipeline } = await loadParseImage();
    mockPipeline.mockResolvedValue(
      mockRecognizedText("1. e4 e5 2. Nf3 Nc6 1-0"),
    );

    const result = await parseImage(
      new Blob(["fake-image-bytes"], { type: "image/png" }),
    );

    expect(result).toEqual({ ok: true, pgn: "1. e4 e5 2. Nf3 Nc6 1-0" });
  });

  it("returns an error including the raw recognized text when it isn't a valid game", async () => {
    const { parseImage, mockPipeline } = await loadParseImage();
    mockPipeline.mockResolvedValue(mockRecognizedText("Mr. Brown commented icily."));

    const result = await parseImage(
      new Blob(["fake-image-bytes"], { type: "image/png" }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Mr. Brown commented icily.");
  });

  it("returns an error when no text is recognized", async () => {
    const { parseImage, mockPipeline } = await loadParseImage();
    mockPipeline.mockResolvedValue(mockRecognizedText("   "));

    const result = await parseImage(
      new Blob(["fake-image-bytes"], { type: "image/png" }),
    );

    expect(result).toEqual({
      ok: false,
      error: "Could not recognize any text in the image.",
    });
  });

  it("loads the model pipeline only once across multiple calls", async () => {
    const { parseImage, mockPipeline } = await loadParseImage();
    mockPipeline.mockResolvedValue(mockRecognizedText("1. e4 1-0"));

    const blob = new Blob(["fake-image-bytes"], { type: "image/png" });
    await parseImage(blob);
    await parseImage(blob);

    expect(mockPipeline).toHaveBeenCalledTimes(1);
  });
});
