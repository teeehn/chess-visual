"use client";
import { useCallback, useEffect, useState } from "react";
import { Chessboard } from "react-chessboard";
import type { MetadataEntry } from "@/lib/pgn-metadata";
import type { PlyMove, ParsePgnResult } from "@/lib/parse-pgn";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function isImageFile(file: File) {
  return file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name);
}

export default function Home() {
  const [moves, setMoves] = useState<PlyMove[]>([]);
  const [currentPly, setCurrentPly] = useState(-1); // -1 = starting position
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [gameEndText, setGameEndText] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<MetadataEntry[]>([]);

  const canGoBack = currentPly > -1;
  const canGoForward = currentPly < moves.length - 1;

  const goToStart = useCallback(() => setCurrentPly(-1), []);
  const goBack = useCallback(
    () => setCurrentPly((p) => Math.max(-1, p - 1)),
    [],
  );
  const goForward = useCallback(
    () => setCurrentPly((p) => Math.min(moves.length - 1, p + 1)),
    [moves.length],
  );
  const goToEnd = useCallback(
    () => setCurrentPly(moves.length - 1),
    [moves.length],
  );

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    function resetToFailed(message: string) {
      setMoves([]);
      setCurrentPly(-1);
      setFileName(null);
      setGameEndText(null);
      setMetadata([]);
      setError(message);
    }

    try {
      const text = await file.text();
      const response = await fetch("/api/parse-pgn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pgn: text }),
      });
      const result: ParsePgnResult = await response.json();

      if (!result.ok) {
        resetToFailed(result.error);
        return;
      }

      setMoves(result.moves);
      setCurrentPly(-1);
      setFileName(file.name);
      setGameEndText(result.gameEndText);
      setMetadata(result.metadata);
    } catch {
      resetToFailed("Could not reach the PGN parsing service.");
    }
  }, []);

  const handleImage = useCallback((file: File) => {
    setError(null);
    setMoves([]);
    setCurrentPly(-1);
    setFileName(file.name);
    setGameEndText(null);
    setMetadata([]);
    setImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isImageFile(file)) {
      handleImage(file);
    } else {
      handleFile(file);
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight") goForward();
      if (e.key === "ArrowLeft") goBack();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goForward, goBack]);

  const currentFen =
    currentPly === -1 ? START_FEN : (moves[currentPly]?.fen ?? START_FEN);

  const currentMove = currentPly === -1 ? null : moves[currentPly];
  const currentMoveLabel =
    currentMove &&
    `${currentMove.moveNumber}${currentMove.color === "w" ? "." : "..."} ${currentMove.san}`;
  const sideToMove =
    !currentMove || currentMove.color === "b" ? "White" : "Black";
  const isAtLastMove = moves.length > 0 && currentPly === moves.length - 1;
  const totalMoveNumber =
    moves.length > 0 ? moves[moves.length - 1].moveNumber : 0;
  const statusText =
    isAtLastMove && gameEndText ? gameEndText : `${sideToMove} to move`;

  const chessboardOptions = {
    position: currentFen,
    allowDragging: false,
    id: "pgn-replay",
  };

  const moveListButtons = moves.map((m, i) => (
    <button
      key={i}
      onClick={() => setCurrentPly(i)}
      className={`text-left px-1 rounded ${
        i === currentPly ? "bg-blue-200" : "hover:bg-gray-100"
      }`}
    >
      {m.color === "w" ? `${m.moveNumber}. ` : ""}
      {m.san}
    </button>
  ));

  return (
    <div className="max-w-2xl lg:max-w-4xl mr-auto ml-auto p-4">
      <h1 className="text-xl font-semibold mb-4">Chess Game Visualizer</h1>

      {!fileName && (
        <p className="mb-3 text-sm text-gray-600">
          Upload a PGN or a photo of a handwritten scoresheet to get started.
        </p>
      )}

      <label
        htmlFor="fileUpload"
        className="flex flex-col items-center justify-center gap-1 w-full rounded-lg border-2 border-dashed border-gray-300 px-4 py-8 text-center cursor-pointer transition-colors hover:border-blue-400 hover:bg-blue-50"
      >
        <span className="text-sm font-medium text-gray-700">
          {fileName ? "Choose a different file" : "Click to upload"}
        </span>
        <span className="text-xs text-gray-400">
          .pgn / .txt, or an image (.png, .jpg, .heic)
        </span>
      </label>
      <input
        id="fileUpload"
        type="file"
        accept=".pgn,text/plain,.png,.jpg,.jpeg,.gif,.heic,.heif"
        onChange={onFileInputChange}
        className="hidden"
      />

      {fileName && (
        <p className="text-sm text-gray-500 mt-2 mb-2">Loaded: {fileName}</p>
      )}
      {error && <p className="text-sm text-red-600 mt-2 mb-2">{error}</p>}

      {metadata.length > 0 && (
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm mt-2 mb-2 rounded border border-gray-200 p-3">
          {metadata.map(({ label, value }) => (
            <div key={label} className="flex gap-1">
              <dt className="text-gray-500">{label}:</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {imagePreviewUrl ?
        <div className="mt-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imagePreviewUrl}
            alt="Uploaded scoresheet"
            className="max-w-md mx-auto rounded border border-gray-200"
          />
          <p className="text-sm text-gray-500 text-center mt-2">
            Image scoresheet recognition isn&apos;t implemented yet — this is
            a placeholder for the next phase.
          </p>
        </div>
      : <>
          {/* Own row (not inside the items-start row below) so the status
              text doesn't push the board down relative to the move list
              sidebar. The spacer matches the sidebar's width so the text
              still centers over the board column, not the full row. */}
          <div className="lg:flex lg:gap-6">
            <p className="lg:flex-1 text-center text-sm font-medium mt-4 mb-2">
              {currentMoveLabel && `${currentMoveLabel} `}
              {statusText}
            </p>
            <div className="hidden lg:block lg:w-64 lg:flex-shrink-0" />
          </div>

          <div className="lg:flex lg:items-start lg:gap-6">
            <div className="lg:flex-1">
              <div className="max-w-md mr-auto ml-auto mb-4">
                <Chessboard options={chessboardOptions} />
              </div>

            {/* Width-matched to the nav row below via the shared w-fit
                wrapper — the mobile move list stretches to fill whatever
                width the nav row's own content naturally needs. */}
            <div className="w-fit mx-auto">
              <div className="flex items-center gap-2 mb-4">
                <button onClick={goToStart} disabled={!canGoBack}>
                  |&lt;
                </button>
                <button onClick={goBack} disabled={!canGoBack}>
                  &lt; Prev
                </button>
                <span className="px-2 text-sm">
                  {currentMove ?
                    `Move ${currentMove.moveNumber} / ${totalMoveNumber}`
                  : "Start"}
                </span>
                <button onClick={goForward} disabled={!canGoForward}>
                  Next &gt;
                </button>
                <button onClick={goToEnd} disabled={!canGoForward}>
                  &gt;|
                </button>
              </div>

              {moves.length > 0 && (
                <div className="grid grid-cols-2 gap-1 text-sm w-full lg:hidden">
                  {moveListButtons}
                </div>
              )}
            </div>
          </div>

          {moves.length > 0 && (
            <div className="hidden lg:grid grid-cols-2 gap-1 text-sm w-64 flex-shrink-0 max-h-[600px] overflow-y-auto">
              {moveListButtons}
            </div>
          )}
          </div>
        </>
      }
    </div>
  );
}
