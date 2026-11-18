export type AdReward = "boost_works" | "finish_work";

export interface AdSessionResponse {
  ok: boolean;
  sessionId?: string;
  reward?: AdReward;
  rewardLabel?: string;
  error?: string;
  retryAfterMs?: number;
  validation?: string;
}

export async function requestAdSession(playerKey: string, reward: AdReward): Promise<AdSessionResponse> {
  try {
    const response = await fetch("/api/teste-escola/ads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "session", playerKey, reward }),
    });
    const body = (await response.json()) as AdSessionResponse;
    if (!response.ok) return { ...body, ok: false, error: body.error ?? `HTTP ${response.status}` };
    return body;
  } catch {
    return { ok: false, error: "ads_unavailable" };
  }
}

export async function claimAdSession(playerKey: string, sessionId: string): Promise<{ ok: boolean; reward?: AdReward; error?: string }> {
  try {
    const response = await fetch("/api/teste-escola/ads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "claim", playerKey, sessionId }),
    });
    const body = (await response.json()) as { ok: boolean; reward?: AdReward; error?: string };
    return body;
  } catch {
    return { ok: false, error: "ads_unavailable" };
  }
}

export const AD_REWARD_LABELS: Record<AdReward, string> = {
  boost_works: "Adiantar 50% de todas as obras ativas",
  finish_work: "Concluir a obra selecionada",
};

export const AD_MIN_WATCH_SECONDS = 8;
