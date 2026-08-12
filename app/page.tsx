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

// PGN spec tags (Seven Tag Roster + supplemental tags), in spec order,
// with a display label for each. See:
// https://github.com/mliebelt/pgn-spec-commented/blob/main/pgn-specification.md
const PGN_TAGS: { key: string; label: string }[] = [
  // Seven Tag Roster
  { key: "Event", label: "Event" },
  { key: "Site", label: "Site" },
  { key: "Date", label: "Date" },
  { key: "Round", label: "Round" },
  { key: "White", label: "White" },
  { key: "Black", label: "Black" },
  { key: "Result", label: "Result" },
  // Player-related
  { key: "WhiteTitle", label: "White Title" },
  { key: "BlackTitle", label: "Black Title" },
  { key: "WhiteElo", label: "White Elo" },
  { key: "BlackElo", label: "Black Elo" },
  { key: "WhiteUSCF", label: "White USCF" },
  { key: "BlackUSCF", label: "Black USCF" },
  { key: "WhiteNA", label: "White Contact" },
  { key: "BlackNA", label: "Black Contact" },
  { key: "WhiteType", label: "White Type" },
  { key: "BlackType", label: "Black Type" },
  // Event-related
  { key: "EventDate", label: "Event Date" },
  { key: "EventSponsor", label: "Event Sponsor" },
  { key: "Section", label: "Section" },
  { key: "Stage", label: "Stage" },
  { key: "Board", label: "Board" },
  // Opening info
  { key: "Opening", label: "Opening" },
  { key: "Variation", label: "Variation" },
  { key: "SubVariation", label: "Sub-Variation" },
  { key: "ECO", label: "ECO" },
  { key: "NIC", label: "NIC" },
  // Time and date
  { key: "Time", label: "Time" },
  { key: "UTCTime", label: "UTC Time" },
  { key: "UTCDate", label: "UTC Date" },
  { key: "TimeControl", label: "Time Control" },
  // Alternative starting position
  { key: "SetUp", label: "Set Up" },
  { key: "FEN", label: "Starting FEN" },
  // Conclusion / misc
  { key: "Termination", label: "Termination" },
  { key: "Annotator", label: "Annotator" },
  { key: "Mode", label: "Mode" },
  { key: "PlyCount", label: "Ply Count" },
];

type MetadataEntry = { label: string; value: string };

// Matches PGN's spec-defined "unknown value" placeholders (e.g. "?",
// "????.??.??") that chess.js backfills for missing Seven Tag Roster
// tags — these carry no real information, so treat them as blank too.
const PLACEHOLDER_VALUE = /^[?.]+$/;

function extractMetadata(chess: Chess): MetadataEntry[] {
  const header = chess.header();
  return PGN_TAGS.reduce<MetadataEntry[]>((entries, { key, label }) => {
    const value = header[key]?.trim();
    if (value && !PLACEHOLDER_VALUE.test(value)) {
      entries.push({ label, value });
    }
    return entries;
  }, []);
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
        setMetadata([]);
        return;
      }

      setMoves(parsed);
      setCurrentPly(-1);
      setFileName(file.name);
      setGameEndText(describeGameEnding(chess, chess.header().Result));
      setMetadata(extractMetadata(chess));
    } catch (err) {
      setMoves([]);
      setCurrentPly(-1);
      setFileName(null);
      setGameEndText(null);
      setMetadata([]);
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
