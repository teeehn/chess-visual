import "@testing-library/jest-dom";

// jsdom's Blob/File don't implement .text() (as of the jsdom version behind
// jest-environment-jsdom), but app code relies on it (file.text() when
// reading an uploaded PGN). Polyfill it via FileReader, which jsdom does
// support, so tests exercise the same code path real browsers use.
if (typeof Blob !== "undefined" && !Blob.prototype.text) {
  Blob.prototype.text = function (): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

// jsdom doesn't run a real layout engine, so every element's
// getBoundingClientRect() reports 0x0. react-chessboard measures square
// size from it to compute piece-move animations and throws if it comes
// back falsy. Stub a plausible fixed square size so navigating between
// positions in tests doesn't hit that guard.
if (typeof Element !== "undefined") {
  Element.prototype.getBoundingClientRect = function () {
    return {
      width: 60,
      height: 60,
      top: 0,
      left: 0,
      right: 60,
      bottom: 60,
      x: 0,
      y: 0,
      toJSON() {},
    } as DOMRect;
  };
}

// jsdom doesn't implement the Blob URL registry at all. App code uses these
// for image-scoresheet previews; tests don't need a real usable URL, just
// something that doesn't throw and stays consistent across calls.
if (typeof URL.createObjectURL === "undefined") {
  URL.createObjectURL = jest.fn(() => "blob:mock-url");
}
if (typeof URL.revokeObjectURL === "undefined") {
  URL.revokeObjectURL = jest.fn();
}
