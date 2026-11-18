import type { GameWorld } from "./types";
import { SAVE_VERSION } from "./config";

const PLAYER_KEY = "peg.minhaescola.player";
const SAVE_KEY = "peg.minhaescola.save.v3";
const BACKUP_KEY = "peg.minhaescola.backup.v3";

export interface StoredSave {
  version: number;
  savedAt: number;
  world: GameWorld;
}

function browser(): boolean {
  return typeof window !== "undefined";
}

export function getPlayerKey(): string {
  if (!browser()) return "server";
  const existing = window.localStorage.getItem(PLAYER_KEY);
  if (existing && /^[a-zA-Z0-9_-]{8,64}$/.test(existing)) return existing;
  const generated = `peg_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36).slice(-6)}`;
  window.localStorage.setItem(PLAYER_KEY, generated);
  return generated;
}

export function readLocalSave(): StoredSave | null {
  if (!browser()) return null;
  for (const key of [SAVE_KEY, BACKUP_KEY]) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as StoredSave;
      if (parsed && parsed.world && typeof parsed.version === "number") return parsed;
    } catch {
      // corrupted entries are ignored, the other slot is still tried
    }
  }
  return null;
}

export function writeLocalSave(world: GameWorld): { ok: boolean; bytes: number } {
  if (!browser()) return { ok: false, bytes: 0 };
  try {
    const payload: StoredSave = { version: SAVE_VERSION, savedAt: Date.now(), world };
    const serialized = JSON.stringify(payload);
    const previous = window.localStorage.getItem(SAVE_KEY);
    if (previous) window.localStorage.setItem(BACKUP_KEY, previous);
    window.localStorage.setItem(SAVE_KEY, serialized);
    return { ok: true, bytes: serialized.length };
  } catch {
    return { ok: false, bytes: 0 };
  }
}

export function clearLocalSave() {
  if (!browser()) return;
  window.localStorage.removeItem(SAVE_KEY);
  window.localStorage.removeItem(BACKUP_KEY);
}

export async function fetchServerSave(playerKey: string): Promise<StoredSave | null> {
  try {
    const response = await fetch(`/api/teste-escola/save?playerKey=${encodeURIComponent(playerKey)}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { ok: boolean; save?: { version: number; data: unknown; updatedAt: string } | null };
    if (!body.ok || !body.save) return null;
    return {
      version: body.save.version,
      savedAt: new Date(body.save.updatedAt).getTime(),
      world: body.save.data as GameWorld,
    };
  } catch {
    return null;
  }
}

export async function pushServerSave(playerKey: string, world: GameWorld): Promise<boolean> {
  try {
    const response = await fetch("/api/teste-escola/save", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerKey, version: SAVE_VERSION, schoolName: world.schoolName, data: world }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function downloadSave(world: GameWorld): void {
  if (!browser()) return;
  const payload: StoredSave = { version: SAVE_VERSION, savedAt: Date.now(), world };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `peg-minha-escola-dia-${world.day}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function readImportedFile(file: File): Promise<StoredSave | null> {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as StoredSave;
    if (!parsed || !parsed.world) return null;
    return parsed;
  } catch {
    return null;
  }
}
