import { afterEach, describe, expect, it, vi } from "vitest";
import { findConversation, sendPhotonText } from "./photonSms";

const cfg = { projectId: "pho_prj_test", apiKey: "pho_sk_test" };
const inbound = (handle: string, createdAt: string, space: string, agent: string) => ({
  id: `pho_msg_${space}`,
  createdAt,
  platform: "imessage",
  space: { id: space, kind: "direct" },
  sentBy: { id: "pho_usr_human", handle },
  receivedBy: { id: agent, handle: "+15125550000" },
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Photon texts (shared iMessage line: reply-only)", () => {
  it("replies in the newest conversation this phone started, as the agent it messaged", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ items: [
      inbound("+17135550142", "2026-11-15T01:00:00Z", "pho_spc_old", "pho_usr_agentA"),
      inbound("+1 (713) 555-0142", "2026-11-15T02:00:00Z", "pho_spc_new", "pho_usr_agentB"),
      inbound("+17135550123", "2026-11-15T03:00:00Z", "pho_spc_other", "pho_usr_agentC"),
    ] })));
    expect(await findConversation("+17135550142", cfg)).toEqual({ spaceId: "pho_spc_new", senderId: "pho_usr_agentB" });
  });

  it("says the phone must text first when it never has (a shared line can't start a chat)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ items: [] })));
    const r = await findConversation("+17135550142", cfg);
    expect("error" in r && r.error).toMatch(/hasn't messaged/);
  });

  it("sends plain text into that conversation with an idempotency key and the project key", async () => {
    vi.stubEnv("PHOTON_PROJECT_ID", "pho_prj_test");
    vi.stubEnv("PHOTON_API_KEY", "pho_sk_test");
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (!init?.method) return Response.json({ items: [inbound("+17135550142", "2026-11-15T02:00:00Z", "pho_spc_new", "pho_usr_agentB")] });
      return Response.json({ id: "pho_msg_sent" });
    }));
    const r = await sendPhotonText("+17135550142", "FreezeLine (simulated): your checklist.");
    expect(r).toEqual({ to: "+17135550142", ok: true, sid: "pho_msg_sent" });
    const send = calls[1];
    expect(send.url).toBe("https://api.photon.codes/v1/projects/pho_prj_test/messages");
    const headers = send.init!.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer pho_sk_test");
    expect(headers["idempotency-key"]).toMatch(/[0-9a-f-]{36}/);
    expect(JSON.parse(String(send.init!.body))).toEqual({
      spaceId: "pho_spc_new",
      senderId: "pho_usr_agentB",
      content: { type: "text", format: "plain", text: "FreezeLine (simulated): your checklist." },
    });
  });

  it("refuses without keys, and passes Photon's own error back", async () => {
    vi.stubEnv("PHOTON_PROJECT_ID", "");
    vi.stubEnv("PHOTON_API_KEY", "");
    expect((await sendPhotonText("+17135550142", "hi")).error).toMatch(/PHOTON_PROJECT_ID/);
    vi.stubEnv("PHOTON_PROJECT_ID", "pho_prj_test");
    vi.stubEnv("PHOTON_API_KEY", "pho_sk_test");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "insufficient permissions" }, { status: 403 })));
    expect((await sendPhotonText("+17135550142", "hi")).error).toBe("insufficient permissions");
  });
});
