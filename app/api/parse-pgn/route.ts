import { NextResponse } from "next/server";
import { parsePgn } from "@/lib/parse-pgn";

function extractPgnField(body: unknown): string | null {
  if (
    typeof body === "object" &&
    body !== null &&
    "pgn" in body &&
    typeof (body as { pgn: unknown }).pgn === "string"
  ) {
    return (body as { pgn: string }).pgn;
  }
  return null;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const pgn = extractPgnField(body);
  if (pgn === null) {
    return NextResponse.json(
      { ok: false, error: "Request body must include a 'pgn' string field." },
      { status: 400 },
    );
  }

  const result = parsePgn(pgn);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
