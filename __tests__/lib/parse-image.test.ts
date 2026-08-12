import { parseImage } from "@/lib/parse-image";

describe("parseImage", () => {
  it("returns a not-implemented-yet error describing the received file", async () => {
    const blob = new Blob(["fake-image-bytes"], { type: "image/png" });
    const result = await parseImage(blob);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/not implemented yet/i);
    expect(result.error).toContain("image/png");
    expect(result.error).toContain(String(blob.size));
  });
});
