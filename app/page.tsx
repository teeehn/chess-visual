"use client";
import { useCallback, useEffect, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type PlyMove = {
  san: string;
  fen: string;
  moveNumber: number;
  color: "w" | "b";
};

function isImageFile(file: File) {
  return file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name);
}

function describeGameEnding(chess: Chess, result?: string | null) {
  if (chess.isCheckmate()) return "Checkmate";
  if (chess.isStalemate()) return "Stalemate";
  if (chess.isInsufficientMaterial()) return "Draw by insufficient material";
  if (chess.isThreefoldRepetition()) return "Draw by repetition";
  if (chess.isDrawByFiftyMoves()) return "Draw by the 50-move rule";

  if (result === "1/2-1/2") return "Draw";
  if (result === "1-0") return "Black resigns";
  if (result === "0-1") return "White resigns";
  return null;
}

export default function Home() {
  const [moves, setMoves] = useState<PlyMove[]>([]);
  const [currentPly, setCurrentPly] = useState(-1); // -1 = starting position
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [gameEndText, setGameEndText] = useState<string | null>(null);

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
    try {
      const text = await file.text();
      const chess = new Chess();
      chess.loadPgn(text);

      const history = chess.history({ verbose: true });
      const parsed: PlyMove[] = history.map((m, i) => ({
        san: m.san,
        fen: m.after,
        moveNumber: Math.floor(i / 2) + 1,
        color: m.color,
      }));

      if (parsed.length === 0) {
        setError("No moves found in this PGN.");
        setMoves([]);
        setCurrentPly(-1);
        setFileName(null);
        setGameEndText(null);
        return;
      }

      setMoves(parsed);
      setCurrentPly(-1);
      setFileName(file.name);
      setGameEndText(describeGameEnding(chess, chess.header().Result));
    } catch (err) {
      setMoves([]);
      setCurrentPly(-1);
      setFileName(null);
      setGameEndText(null);
      setError(
        err instanceof Error ?
          `Could not parse PGN: ${err.message}`
        : "Could not parse PGN.",
      );
    }
  }, []);

  const handleImage = useCallback((file: File) => {
    setError(null);
    setMoves([]);
    setCurrentPly(-1);
    setFileName(file.name);
    setGameEndText(null);
    setImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const statusText =
    isAtLastMove && gameEndText ? gameEndText : `${sideToMove} to move`;

  const chessboardOptions = {
    position: currentFen,
    allowDragging: false,
    id: "pgn-replay",
  };

  return (
    <div className="max-w-2xl mr-auto ml-auto p-4">
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
          <p className="text-center text-sm font-medium mt-4 mb-2">
            {currentMoveLabel && `${currentMoveLabel} `}
            {statusText}
          </p>
          <div className="max-w-md mr-auto ml-auto mb-4">
            <Chessboard options={chessboardOptions} />
          </div>

          <div className="flex items-center gap-2 justify-center mb-4">
            <button onClick={goToStart} disabled={!canGoBack}>
              |&lt;
            </button>
            <button onClick={goBack} disabled={!canGoBack}>
              &lt; Prev
            </button>
            <span className="px-2 text-sm">
              {currentPly === -1 ?
                "Start"
              : `Move ${currentPly + 1} / ${moves.length}`}
            </span>
            <button onClick={goForward} disabled={!canGoForward}>
              Next &gt;
            </button>
            <button onClick={goToEnd} disabled={!canGoForward}>
              &gt;|
            </button>
          </div>

          {moves.length > 0 && (
            <div className="grid grid-cols-2 gap-1 text-sm">
              {moves.map((m, i) => (
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
              ))}
            </div>
          )}
        </>
      }
    </div>
  );
}
