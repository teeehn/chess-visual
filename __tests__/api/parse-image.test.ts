/**
 * @jest-environment node
 */
import { POST } from "@/app/api/parse-image/route";

describe("POST /api/parse-image", () => {
  it("returns 501 with a not-implemented message for a valid image upload", async () => {
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

    expect(response.status).toBe(501);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not implemented yet/i);
  });

  it("returns 400 when no image field is present", async () => {
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
    const request = new Request("http://localhost/api/parse-image", {
      method: "POST",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
