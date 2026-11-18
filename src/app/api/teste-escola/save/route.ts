import { db } from "@/db";
import { schoolSaves } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const MAX_BYTES = 2_500_000;

function sanitizeKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 64);
  return /^[a-zA-Z0-9_-]{8,64}$/.test(trimmed) ? trimmed : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const playerKey = sanitizeKey(url.searchParams.get("playerKey"));
  if (!playerKey) {
    return Response.json({ ok: false, error: "playerKey inválido" }, { status: 400 });
  }
  try {
    const rows = await db
      .select()
      .from(schoolSaves)
      .where(and(eq(schoolSaves.playerKey, playerKey), eq(schoolSaves.slot, "main")))
      .orderBy(desc(schoolSaves.updatedAt))
      .limit(1);
    const row = rows[0];
    if (!row) return Response.json({ ok: true, save: null });
    return Response.json({
      ok: true,
      save: { version: row.version, schoolName: row.schoolName, data: row.data, updatedAt: row.updatedAt },
    });
  } catch (error) {
    console.error("school save GET failed", error);
    return Response.json({ ok: false, error: "storage_unavailable" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }
  const payload = body as { playerKey?: unknown; data?: unknown; version?: unknown; schoolName?: unknown };
  const playerKey = sanitizeKey(payload.playerKey);
  if (!playerKey || typeof payload.data !== "object" || payload.data === null) {
    return Response.json({ ok: false, error: "payload inválido" }, { status: 400 });
  }
  const serialized = JSON.stringify(payload.data);
  if (serialized.length > MAX_BYTES) {
    return Response.json({ ok: false, error: "save_too_large" }, { status: 413 });
  }
  const version = typeof payload.version === "number" && Number.isFinite(payload.version) ? payload.version : 1;
  const schoolName =
    typeof payload.schoolName === "string" && payload.schoolName.trim().length > 0
      ? payload.schoolName.trim().slice(0, 120)
      : "Escola PEG";

  try {
    await db
      .insert(schoolSaves)
      .values({ playerKey, slot: "main", version, schoolName, data: payload.data })
      .onConflictDoUpdate({
        target: [schoolSaves.playerKey, schoolSaves.slot],
        set: { version, schoolName, data: payload.data, updatedAt: new Date() },
      });
    return Response.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (error) {
    console.error("school save PUT failed", error);
    return Response.json({ ok: false, error: "storage_unavailable" }, { status: 500 });
  }
}
