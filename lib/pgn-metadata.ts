import { Chess } from "chess.js";

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

export type MetadataEntry = { label: string; value: string };

// Matches PGN's spec-defined "unknown value" placeholders (e.g. "?",
// "????.??.??") that chess.js backfills for missing Seven Tag Roster
// tags — these carry no real information, so treat them as blank too.
const PLACEHOLDER_VALUE = /^[?.]+$/;

export function extractMetadata(chess: Chess): MetadataEntry[] {
  const header = chess.header();
  return PGN_TAGS.reduce<MetadataEntry[]>((entries, { key, label }) => {
    const value = header[key]?.trim();
    if (value && !PLACEHOLDER_VALUE.test(value)) {
      entries.push({ label, value });
    }
    return entries;
  }, []);
}
