/**
 * @jest-environment node
 */
import { readFileSync } from "fs";
import sharp from "sharp";
import { segmentScoresheet } from "@/lib/segment-scoresheet";

const FIXTURE_PATH = "__tests__/fixtures/1963-round21.jpg";

describe("segmentScoresheet", () => {
  it("produces one White and one Black crop per requested move", async () => {
    const imageBuffer = readFileSync(FIXTURE_PATH);
    const crops = await segmentScoresheet(imageBuffer, 10);

    expect(crops).toHaveLength(20);
    for (let moveNumber = 1; moveNumber <= 10; moveNumber++) {
      expect(crops).toContainEqual(
        expect.objectContaining({ moveNumber, color: "w" }),
      );
      expect(crops).toContainEqual(
        expect.objectContaining({ moveNumber, color: "b" }),
      );
    }
  }, 30000);

  it("produces crops with sane, non-degenerate dimensions", async () => {
    const imageBuffer = readFileSync(FIXTURE_PATH);
    const crops = await segmentScoresheet(imageBuffer, 3);

    for (const crop of crops) {
      const meta = await sharp(crop.image).metadata();
      expect(meta.width).toBeGreaterThan(20);
      expect(meta.height).toBeGreaterThan(20);
    }
  }, 30000);

  it("keeps row crops aligned without drift across the sheet (spot-checked visually during development)", async () => {
    // Regression guard for the header-detection bug where a false-positive
    // band (dark photo background, not the header bar) was picked instead
    // of the real one — row 1 and row 10 should be roughly the same height
    // apart consistently, not drifting.
    const imageBuffer = readFileSync(FIXTURE_PATH);
    const crops = await segmentScoresheet(imageBuffer, 10);
    const heights = await Promise.all(
      crops.map(async (c) => (await sharp(c.image).metadata()).height ?? 0),
    );
    const avg = heights.reduce((a, b) => a + b, 0) / heights.length;
    for (const h of heights) {
      expect(Math.abs(h - avg)).toBeLessThan(avg * 0.3);
    }
  }, 30000);

  it("throws a clear error for an image that isn't the scoresheet template", async () => {
    const blankImage = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .png()
      .toBuffer();

    await expect(segmentScoresheet(blankImage, 5)).rejects.toThrow(
      /Could not locate the scoresheet header/,
    );
  }, 30000);
});
