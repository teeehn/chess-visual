/**
 * @jest-environment node
 */
// Mocked for the same reason as lib/parse-image.test.ts: model loading is
// expensive and network-dependent. This file tests the route's own HTTP
// concerns (request validation, status codes), not recognition accuracy.
jest.mock("@huggingface/transformers", () => ({
  pipeline: jest.fn(),
}));

async function loadRoute(generatedText: string) {
  jest.resetModules();
  const { pipeline } = await import("@huggingface/transformers");
  (pipeline as jest.Mock).mockResolvedValue(
    jest.fn().mockResolvedValue([{ generated_text: generatedText }]),
  );
  const { POST } = await import("@/app/api/parse-image/route");
  return POST;
}

describe("POST /api/parse-image", () => {
  it("returns 200 with PGN when the recognized text forms a valid game", async () => {
    const POST = await loadRoute("1. e4 e5 2. Nf3 Nc6 1-0");
    const formData = new FormData();
    formData.set(
      "image",
      new Blob(["fake"], { type: "image/png" }),
      "test.png",
    );
    const request = new Request("http://localhost/api/parse-image", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, pgn: "1. e4 e5 2. Nf3 Nc6 1-0" });
  });

  it("returns 400 when the recognized text doesn't form a valid game", async () => {
    const POST = await loadRoute("not a game");
    const formData = new FormData();
    formData.set(
      "image",
      new Blob(["fake"], { type: "image/png" }),
      "test.png",
    );
    const request = new Request("http://localhost/api/parse-image", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it("returns 400 when no image field is present", async () => {
    const POST = await loadRoute("irrelevant");
    const request = new Request("http://localhost/api/parse-image", {
      method: "POST",
      body: new FormData(),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 400 instead of throwing for a non-multipart body", async () => {
    // No body/content-type at all — request.formData() itself rejects,
    // distinct from "valid empty form" above which parses fine.
    const POST = await loadRoute("irrelevant");
    const request = new Request("http://localhost/api/parse-image", {
      method: "POST",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
