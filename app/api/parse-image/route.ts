import { NextResponse } from "next/server";
import { parseImage } from "@/lib/parse-image";

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Request body must be multipart/form-data." },
      { status: 400 },
    );
  }

  const image = formData.get("image");

  if (!(image instanceof Blob)) {
    return NextResponse.json(
      { ok: false, error: "Request must include an 'image' file field." },
      { status: 400 },
    );
  }

  const result = await parseImage(image);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
