/**
 * Evaluates parseImage() against real handwritten scoresheet photos, checked
 * against known-correct games rather than just "did it stop early or not".
 *
 * Not part of `npm test`: it makes real Gemini API calls (network-dependent,
 * costs quota, non-deterministic between runs) and reads photos that live
 * outside this repo (see README's Handwritten Scoresheet Recognition
 * section for why real photos aren't committed test fixtures beyond the
 * one already in __tests__/fixtures/).
 *
 * Usage:
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/evaluate-scoresheets.ts
 *
 * Matches files named "<anything>-<round>.jpg" (e.g. "1963-21.jpg") against
 * the game tagged [Round "<round>"] in the PGN file. Edit IMAGE_DIR/
 * PGN_PATH/IMAGE_PATTERN below to point at different data.
 */
import { readFileSync, readdirSync, existsSync } from "fs";
import path from "path";
import { Chess } from "chess.js";
import { parseImage } from "../lib/parse-image";

const IMAGE_DIR = path.join(__dirname, "..", "..", "data");
const PGN_PATH = path.join(IMAGE_DIR, "worldchamp1963.pgn");
const IMAGE_PATTERN = /^1963-(\d+)\.jpg$/;

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim();
    }
  }
}

function loadGamesByRound(pgnPath: string): Map<string, string[]> {
  const text = readFileSync(pgnPath, "utf-8");
  const games = text.split(/\n(?=\[Event )/).filter((g) => g.trim());
  const byRound = new Map<string, string[]>();
  for (const gameText of games) {
    const roundMatch = gameText.match(/\[Round "(\d+)"\]/);
    if (!roundMatch) continue;
    const chess = new Chess();
    chess.loadPgn(gameText);
    byRound.set(roundMatch[1], chess.history());
  }
  return byRound;
}

// Longest common prefix -- how many moves at the start of `recognized`
// exactly match `truth`, before the first divergence (wrong move, not just
// "stopped early").
function matchingPrefixLength(truth: string[], recognized: string[]): number {
  let i = 0;
  while (i < truth.length && i < recognized.length && truth[i] === recognized[i]) {
    i++;
  }
  return i;
}

async function main() {
  loadEnvLocal();
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY not set (checked .env.local) -- aborting.");
    process.exit(1);
  }

  const gamesByRound = loadGamesByRound(PGN_PATH);
  const files = readdirSync(IMAGE_DIR)
    .filter((f) => IMAGE_PATTERN.test(f))
    .sort();

  if (files.length === 0) {
    console.error(`No files matching ${IMAGE_PATTERN} found in ${IMAGE_DIR}`);
    process.exit(1);
  }

  let allCorrect = true;

  for (const file of files) {
    const round = file.match(IMAGE_PATTERN)![1];
    const truth = gamesByRound.get(round);
    console.log(`\n=== ${file} (Round ${round}) ===`);
    if (!truth) {
      console.log(`  no game tagged [Round "${round}"] in ${PGN_PATH} -- skipping`);
      continue;
    }

    const buffer = readFileSync(path.join(IMAGE_DIR, file));
    const blob = new Blob([new Uint8Array(buffer)], { type: "image/jpeg" });

    const start = Date.now();
    const result = await parseImage(blob);
    const elapsedMs = Date.now() - start;

    if (!result.ok) {
      allCorrect = false;
      console.log(`  FAILED (${elapsedMs}ms): ${result.error}`);
      continue;
    }

    const chess = new Chess();
    chess.loadPgn(result.pgn);
    const recognized = chess.history();
    const correctPrefix = matchingPrefixLength(truth, recognized);
    const isFullyCorrect =
      correctPrefix === truth.length && recognized.length === truth.length;

    if (isFullyCorrect) {
      console.log(`  OK (${elapsedMs}ms): all ${truth.length} moves correct`);
    } else {
      allCorrect = false;
      console.log(
        `  MISMATCH (${elapsedMs}ms): ${correctPrefix}/${truth.length} moves correct ` +
          `before diverging or stopping (recognized ${recognized.length} total)`,
      );
      if (correctPrefix < recognized.length) {
        console.log(
          `    first wrong move: recognized "${recognized[correctPrefix]}", ` +
            `expected "${truth[correctPrefix]}"`,
        );
      }
      if (result.warning) {
        console.log(`    warning: ${result.warning}`);
      }
    }
  }

  console.log(`\n${allCorrect ? "All images matched their known-correct game." : "Some images did not fully match -- see above."}`);
  process.exit(allCorrect ? 0 : 1);
}

main();
