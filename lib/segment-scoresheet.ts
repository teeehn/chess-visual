import sharp from "sharp";

// Calibrated for the ChessTournamentGuide.com "OFFICIAL SCORE SHEET"
// template (the one used for the fixtures in __tests__/fixtures/) — not a
// generic scoresheet segmenter. Anchors on the dark-blue "# | White |
// Black" header bar of the first column-group (moves 1-30), detected by
// color, and computes row/column positions as fractions of that header's
// own bounding box. This makes it robust to photo scale/zoom differences
// (a closer or farther photo of the same page still works) but not to
// rotation/perspective skew — it assumes a reasonably front-on photo.
//
// Row/column proportions below were measured directly against a real
// photographed, filled-in copy of the template (see README's Handwritten
// Scoresheet Recognition section for the detection method).

export type MoveCellCrop = {
  moveNumber: number;
  color: "w" | "b";
  image: Buffer;
};

type Box = { left: number; top: number; right: number; bottom: number };

function isHeaderBlue(r: number, g: number, b: number): boolean {
  return b > r + 5 && r < 130 && g < 130 && b < 150;
}

// Detects the first column-group's header bar. Scans a downscaled copy for
// speed, then scales the result back up to the original image's coordinates.
async function findHeaderBar(imageBuffer: Buffer): Promise<Box> {
  const original = sharp(imageBuffer);
  const meta = await original.metadata();
  const fullWidth = meta.width ?? 0;
  const fullHeight = meta.height ?? 0;
  if (!fullWidth || !fullHeight) {
    throw new Error("Could not read image dimensions.");
  }

  const scanWidth = 800;
  const scale = fullWidth / scanWidth;

  const { data, info } = await original
    .resize({ width: scanWidth })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const isBlue = (x: number, y: number) => {
    const idx = (y * width + x) * channels;
    return isHeaderBlue(data[idx], data[idx + 1], data[idx + 2]);
  };

  // Find rows with a wide contiguous blue span (header bar candidate rows).
  // A dark photo background around the page can produce thin false-positive
  // bands (a couple of rows, modest counts) — pick the band with the
  // highest peak count instead of the first one crossing the threshold,
  // since the real header bar is a strong, wide, multi-row signal.
  const headerRowThreshold = width * 0.15;
  const rowCounts: number[] = new Array(height).fill(0);
  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = 0; x < width; x++) {
      if (isBlue(x, y)) count++;
    }
    rowCounts[y] = count;
  }

  const bands: { top: number; bottom: number; peak: number }[] = [];
  let bandTop = -1;
  let bandBottom = -1;
  let bandPeak = 0;
  for (let y = 0; y < height; y++) {
    if (rowCounts[y] > headerRowThreshold) {
      if (bandTop === -1) bandTop = y;
      bandBottom = y;
      bandPeak = Math.max(bandPeak, rowCounts[y]);
    } else if (bandTop !== -1 && y - bandBottom > 3) {
      bands.push({ top: bandTop, bottom: bandBottom, peak: bandPeak });
      bandTop = -1;
      bandPeak = 0;
    }
  }
  if (bandTop !== -1) bands.push({ top: bandTop, bottom: bandBottom, peak: bandPeak });

  if (bands.length === 0) {
    throw new Error(
      "Could not locate the scoresheet header — is this a photo of the official score sheet template?",
    );
  }
  const best = bands.reduce((a, b) => (b.peak > a.peak ? b : a));
  const top = best.top;
  const bottom = best.bottom;

  // Within that row band, find the left/right extent of the first
  // column-group specifically (its own contiguous blue span).
  const colHasBlue = new Array(width).fill(false);
  for (let y = top; y <= bottom; y++) {
    for (let x = 0; x < width; x++) {
      if (isBlue(x, y)) colHasBlue[x] = true;
    }
  }
  const left = colHasBlue.indexOf(true);
  let right = left;
  for (let x = left; x < width; x++) {
    if (colHasBlue[x]) {
      right = x;
    } else if (x - right > width * 0.02) {
      // Gap between the first and second column-group's header — stop.
      break;
    }
  }

  return {
    left: Math.round(left * scale),
    right: Math.round(right * scale),
    top: Math.round(top * scale),
    bottom: Math.round(bottom * scale),
  };
}

// Column boundaries as fractions of the header's own width (left edge = 0).
const COLUMN_FRACTIONS = {
  numberEnd: 0.105,
  whiteEnd: 0.559,
  blackEnd: 0.998,
};

// Row spacing as fractions of the header's own width (rows are roughly
// square-ish relative to the header in this template, so header width is a
// stable reference for vertical spacing too, not just horizontal).
const FIRST_ROW_HEIGHT_FRACTION = 0.071;
const ROW_HEIGHT_FRACTION = 0.0825;

// Extra margin added around each cell's strict boundaries so ascenders/
// descenders and slightly misaligned handwriting aren't clipped.
const PADDING_FRACTION = 0.15;

export async function segmentScoresheet(
  imageBuffer: Buffer,
  maxMoveNumber = 30,
): Promise<MoveCellCrop[]> {
  const header = await findHeaderBar(imageBuffer);
  const headerWidth = header.right - header.left;

  const image = sharp(imageBuffer);
  const meta = await image.metadata();
  const imageWidth = meta.width ?? 0;
  const imageHeight = meta.height ?? 0;

  const numberEndX = header.left + headerWidth * COLUMN_FRACTIONS.numberEnd;
  const whiteEndX = header.left + headerWidth * COLUMN_FRACTIONS.whiteEnd;
  const blackEndX = header.left + headerWidth * COLUMN_FRACTIONS.blackEnd;

  const firstRowHeight = headerWidth * FIRST_ROW_HEIGHT_FRACTION;
  const rowHeight = headerWidth * ROW_HEIGHT_FRACTION;
  const padding = rowHeight * PADDING_FRACTION;

  function rowTop(moveNumber: number): number {
    if (moveNumber <= 1) return header.bottom;
    return header.bottom + firstRowHeight + (moveNumber - 2) * rowHeight;
  }

  function clampBox(box: Box): Box {
    return {
      left: Math.max(0, Math.round(box.left)),
      top: Math.max(0, Math.round(box.top)),
      right: Math.min(imageWidth, Math.round(box.right)),
      bottom: Math.min(imageHeight, Math.round(box.bottom)),
    };
  }

  async function cropCell(box: Box): Promise<Buffer> {
    const clamped = clampBox(box);
    return image
      .clone()
      .extract({
        left: clamped.left,
        top: clamped.top,
        width: Math.max(1, clamped.right - clamped.left),
        height: Math.max(1, clamped.bottom - clamped.top),
      })
      .png()
      .toBuffer();
  }

  const crops: MoveCellCrop[] = [];
  for (let moveNumber = 1; moveNumber <= maxMoveNumber; moveNumber++) {
    const top = rowTop(moveNumber) - padding;
    const bottom = rowTop(moveNumber + 1) + padding;

    const whiteBox: Box = {
      left: numberEndX,
      top,
      right: whiteEndX,
      bottom,
    };
    const blackBox: Box = {
      left: whiteEndX,
      top,
      right: blackEndX,
      bottom,
    };

    crops.push({
      moveNumber,
      color: "w",
      image: await cropCell(whiteBox),
    });
    crops.push({
      moveNumber,
      color: "b",
      image: await cropCell(blackBox),
    });
  }

  return crops;
}
