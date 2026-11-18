import { db } from "@/db";
import { schoolAdSessions } from "@/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const REWARDS = {
  boost_works: { label: "Adiantar 50% de todas as obras ativas", minutes: 0, factor: 0.5 },
  finish_work: { label: "Concluir a obra selecionada", minutes: 0, factor: 1 },
} as const;

type RewardKey = keyof typeof REWARDS;

const COOLDOWN_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 45 * 60 * 1000;

function sanitizeKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 64);
  return /^[a-zA-Z0-9_-]{8,64}$/.test(trimmed) ? trimmed : null;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }
  const payload = body as Record<string, unknown>;
  const playerKey = sanitizeKey(payload.playerKey);
  if (!playerKey) return Response.json({ ok: false, error: "playerKey inválido" }, { status: 400 });

  try {
    if (payload.action === "session") {
      const reward = String(payload.reward ?? "boost_works") as RewardKey;
      if (!(reward in REWARDS)) {
        return Response.json({ ok: false, error: "recompensa_desconhecida" }, { status: 400 });
      }
      const since = new Date(Date.now() - COOLDOWN_MS);
      const recent = await db
        .select({ id: schoolAdSessions.id, status: schoolAdSessions.status })
        .from(schoolAdSessions)
        .where(and(eq(schoolAdSessions.playerKey, playerKey), gte(schoolAdSessions.createdAt, since)))
        .orderBy(desc(schoolAdSessions.createdAt))
        .limit(5);
      if (recent.some((row) => row.status === "claimed")) {
        return Response.json(
          { ok: false, error: "limite_de_frequencia", retryAfterMs: COOLDOWN_MS },
          { status: 429 },
        );
      }
      const reusable = recent.find((row) => row.status === "issued");
      if (reusable) {
        return Response.json({
          ok: true,
          sessionId: reusable.id,
          reward,
          rewardLabel: REWARDS[reward].label,
          validation: "local",
        });
      }
      const inserted = await db
        .insert(schoolAdSessions)
        .values({ playerKey, reward, status: "issued" })
        .returning({ id: schoolAdSessions.id });
      return Response.json({
        ok: true,
        sessionId: inserted[0].id,
        reward,
        rewardLabel: REWARDS[reward].label,
        validation: "local",
      });
    }

    if (payload.action === "claim") {
      const sessionId = String(payload.sessionId ?? "");
      if (!/^[0-9a-f-]{36}$/.test(sessionId)) {
        return Response.json({ ok: false, error: "sessao_invalida" }, { status: 400 });
      }
      const expiredBefore = new Date(Date.now() - SESSION_TTL_MS);
      const claimed = await db
        .update(schoolAdSessions)
        .set({ status: "claimed", claimedAt: new Date() })
        .where(
          and(
            eq(schoolAdSessions.id, sessionId),
            eq(schoolAdSessions.playerKey, playerKey),
            eq(schoolAdSessions.status, "issued"),
            gte(schoolAdSessions.createdAt, expiredBefore),
          ),
        )
        .returning({ id: schoolAdSessions.id, reward: schoolAdSessions.reward });

      if (claimed.length === 0) {
        return Response.json({ ok: false, error: "sessao_ja_utilizada_ou_expirada" }, { status: 409 });
      }
      const reward = claimed[0].reward as RewardKey;
      const spec = REWARDS[reward] ?? REWARDS.boost_works;
      return Response.json({
        ok: true,
        reward,
        effect: spec,
        claimedAt: new Date().toISOString(),
        validation: "server-idempotente",
      });
    }

    if (payload.action === "status") {
      const rows = await db
        .select({ claimedAt: schoolAdSessions.claimedAt })
        .from(schoolAdSessions)
        .where(and(eq(schoolAdSessions.playerKey, playerKey), sql`${schoolAdSessions.claimedAt} is not null`))
        .orderBy(desc(schoolAdSessions.claimedAt))
        .limit(1);
      const last = rows[0]?.claimedAt ?? null;
      return Response.json({
        ok: true,
        lastClaimedAt: last,
        nextAvailableAt: last ? new Date(new Date(last).getTime() + COOLDOWN_MS).toISOString() : null,
      });
    }

    return Response.json({ ok: false, error: "ação desconhecida" }, { status: 400 });
  } catch (error) {
    console.error("school ads failed", error);
    // The game must never hard-block on the ad backend.
    return Response.json({ ok: false, error: "ads_unavailable" }, { status: 503 });
  }
}
