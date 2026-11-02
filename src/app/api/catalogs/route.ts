import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";

const CATALOGS_PATH = path.join(process.cwd(), "catalogs", "catalogs.json");

export async function GET() {
  try {
    const raw = readFileSync(CATALOGS_PATH, "utf-8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json(
      { error: "No se encontró catalogs/catalogs.json. Corre `npm run catalogs` primero." },
      { status: 404 },
    );
  }
}
