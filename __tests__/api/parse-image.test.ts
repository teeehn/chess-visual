/**
 * @jest-environment node
 */
// The route's own job is HTTP concerns (request validation, status codes)
// -- recognition accuracy is parseImage's concern, covered in
// __tests__/lib/parse-image.test.ts -- so parseImage itself is mocked here
// rather than the Gemini network call it makes.
import type { ParseImageResult } from "../../lib/parse-image";

const mockParseImage = jest.fn<Promise<ParseImageResult>, [Blob]>();
jest.mock("../../lib/parse-image", () => ({
  parseImage: (image: Blob) => mockParseImage(image),
}));

async function loadRoute() {
  jest.resetModules();
  const { POST } = await import("@/app/api/parse-image/route");
  return POST;
}

describe("POST /api/parse-image", () => {
  beforeEach(() => {
    mockParseImage.mockReset();
  });

  it("returns 200 with PGN when parseImage succeeds", async () => {
    mockParseImage.mockResolvedValue({ ok: true, pgn: "1. e4 e5 2. Nf3 Nc6 1-0" });
    const POST = await loadRoute();
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

  it("returns 400 when parseImage reports failure", async () => {
    mockParseImage.mockResolvedValue({
      ok: false,
      error: "Could not recognize any moves in the image.",
    });
    const POST = await loadRoute();
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
    const POST = await loadRoute();
    const request = new Request("http://localhost/api/parse-image", {
      method: "POST",
      body: new FormData(),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(mockParseImage).not.toHaveBeenCalled();
  });

  it("returns 400 instead of throwing for a non-multipart body", async () => {
    // No body/content-type at all — request.formData() itself rejects,
    // distinct from "valid empty form" above which parses fine.
    const POST = await loadRoute();
    const request = new Request("http://localhost/api/parse-image", {
      method: "POST",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(mockParseImage).not.toHaveBeenCalled();
  });
});
