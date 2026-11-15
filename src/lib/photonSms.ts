// Texts through Photon (photon.codes, its 2.0 API): an iMessage from the project's free SHARED
// iMessage line. Photon's rule for a shared line: it can only reply, in a direct conversation, to the
// person assigned to it who has messaged it first. So the household (in the demo, your own phone) texts
// the agent's number once; after that every text here goes out as an iMessage reply in that conversation.
//
//   1. find the newest message this phone sent to the project (its conversation + the agent's user id)
//   2. send the text into that conversation, as the agent
//
// Env: PHOTON_PROJECT_ID (pho_prj_...), PHOTON_API_KEY (a project API key, pho_sk_..., with project:read
// and project:write). Server and scripts only: the key never reaches the browser.
import { randomUUID } from "node:crypto";
import type { SmsResult } from "./twilioSms";

const API = "https://api.photon.codes/v1";
const US_E164 = /^\+1[2-9][0-9]{9}$/;

export function photonConfig(): { projectId: string; apiKey: string } | null {
  const projectId = process.env.PHOTON_PROJECT_ID?.trim();
  const apiKey = process.env.PHOTON_API_KEY?.trim();
  return projectId && apiKey ? { projectId, apiKey } : null;
}

interface PhotonMessage {
  id: string;
  createdAt?: string;
  platform?: string;
  space?: { id?: string; kind?: string };
  sentBy?: { id?: string; handle?: string };
  receivedBy?: { id?: string; handle?: string };
}

/** Digits only, so "+1 (713) 555-0142", "17135550142" and "+17135550142" all match. */
const digits = (s: string | undefined) => (s ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

/** The conversation this phone last messaged the project in, and the agent user to reply as. */
export async function findConversation(
  to: string,
  cfg: { projectId: string; apiKey: string },
): Promise<{ spaceId: string; senderId: string } | { error: string }> {
  const url = `${API}/projects/${encodeURIComponent(cfg.projectId)}/messages?platform=imessage&direction=received&pageSize=100`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${cfg.apiKey}` }, cache: "no-store" });
  const data = (await res.json().catch(() => null)) as { items?: PhotonMessage[]; message?: string; error?: string } | null;
  if (!res.ok) return { error: data?.message ?? data?.error ?? `Photon refused the lookup (HTTP ${res.status}).` };
  const mine = (data?.items ?? [])
    .filter((m) => digits(m.sentBy?.handle) === digits(to) && m.space?.id && m.receivedBy?.id)
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  const m = mine[0];
  if (!m) return { error: "This phone hasn't messaged the Photon agent's number yet. A shared line can only reply: text it once from this phone first." };
  return { spaceId: m.space!.id!, senderId: m.receivedBy!.id! };
}

export async function sendPhotonText(to: string, body: string): Promise<SmsResult> {
  if (!US_E164.test(to)) return { to, ok: false, error: "Not a US mobile number in +1XXXXXXXXXX form." };
  const cfg = photonConfig();
  if (!cfg) return { to, ok: false, error: "PHOTON_PROJECT_ID / PHOTON_API_KEY are not set." };

  const conv = await findConversation(to, cfg);
  if ("error" in conv) return { to, ok: false, error: conv.error };

  const res = await fetch(`${API}/projects/${encodeURIComponent(cfg.projectId)}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json", "idempotency-key": randomUUID() },
    body: JSON.stringify({ spaceId: conv.spaceId, senderId: conv.senderId, content: { type: "text", format: "plain", text: body } }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as { id?: string; message?: string; error?: string; detail?: unknown } | null;
  if (!res.ok) {
    const said = data?.message ?? data?.error ?? (typeof data?.detail === "string" ? data.detail : undefined);
    return { to, ok: false, code: res.status, error: said ?? `Photon refused the message (HTTP ${res.status}).` };
  }
  // Photon accepts it for delivery; whether it arrived shows on the message later.
  return { to, ok: true, sid: data?.id };
}
