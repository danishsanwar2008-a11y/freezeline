// Outbound calls through an ElevenLabs agent. ElevenLabs holds the conversation - prompt, voice,
// speech recognition - so this module only says who to dial and which household facts to
// personalise the greeting with. Nothing here needs a tunnel or a local process.
//
// The Twilio number is imported into ElevenLabs once; after that the phone number id is fixed
// and this file never touches Twilio's call API.

export type AgentCallResult = {
  to: string;
  ok: boolean;
  conversationId?: string;
  callSid?: string;
  error?: string;
};

const US_E164 = /^\+1[2-9][0-9]{9}$/;

export function elevenLabsConfig(): { apiKey: string; agentId: string; numberId: string } | null {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const numberId = process.env.ELEVENLABS_PHONE_NUMBER_ID;
  return apiKey && agentId && numberId ? { apiKey, agentId, numberId } : null;
}

export async function placeAgentCall(opts: {
  to: string;
  /** Fills {{first_name}}, {{street}}, {{lang}} in the agent's prompt. */
  variables?: Record<string, string>;
}): Promise<AgentCallResult> {
  const { to, variables = {} } = opts;
  if (!US_E164.test(to)) {
    return { to, ok: false, error: "Not a US mobile number in +1XXXXXXXXXX form." };
  }
  const cfg = elevenLabsConfig();
  if (!cfg) {
    return {
      to,
      ok: false,
      error: "ELEVENLABS_API_KEY / ELEVENLABS_AGENT_ID / ELEVENLABS_PHONE_NUMBER_ID are not set.",
    };
  }

  const res = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
    method: "POST",
    headers: { "xi-api-key": cfg.apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      agent_id: cfg.agentId,
      agent_phone_number_id: cfg.numberId,
      to_number: to,
      conversation_initiation_client_data: { dynamic_variables: variables },
    }),
    cache: "no-store",
  });

  const data = (await res.json().catch(() => null)) as
    | { success?: boolean; message?: string; conversation_id?: string; callSid?: string; detail?: unknown }
    | null;

  if (!res.ok) {
    const detail = typeof data?.detail === "string" ? data.detail : data?.message;
    return { to, ok: false, error: detail ?? `ElevenLabs refused the call (HTTP ${res.status}).` };
  }
  return { to, ok: true, conversationId: data?.conversation_id, callSid: data?.callSid };
}
