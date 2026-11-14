// TextBee sends SMS through an Android phone's SIM instead of a carrier API: no A2P 10DLC
// registration, no per-message fee, no Twilio trial gate. The trade is throughput and reach -
// one phone sends, and US carriers do filter high-volume "personal" traffic - so this suits a
// demo and small lists, not a city-wide blast.
//
// API: POST {base}/gateway/send-sms with x-api-key. Self-hosted instances work the same way;
// point TEXTBEE_BASE_URL at them.
import type { SmsResult } from "./twilioSms";

const US_E164 = /^\+1[2-9][0-9]{9}$/;

export function textbeeConfig(): { baseUrl: string; apiKey: string } | null {
  const apiKey = process.env.TEXTBEE_API_KEY;
  if (!apiKey) return null;
  const baseUrl = (process.env.TEXTBEE_BASE_URL || "https://api.textbee.dev/api/v1").replace(/\/+$/, "");
  return { baseUrl, apiKey };
}

export async function sendTextbeeSms(to: string, body: string): Promise<SmsResult> {
  if (!US_E164.test(to)) {
    return { to, ok: false, error: "Not a US mobile number in +1XXXXXXXXXX form." };
  }
  const cfg = textbeeConfig();
  if (!cfg) {
    return { to, ok: false, error: "TEXTBEE_API_KEY is not set." };
  }

  const payload: Record<string, unknown> = { recipients: [to], message: body };
  // Optional: pin the sending phone on a multi-device account.
  if (process.env.TEXTBEE_DEVICE_ID) payload.deviceId = process.env.TEXTBEE_DEVICE_ID;

  const res = await fetch(`${cfg.baseUrl}/gateway/send-sms`, {
    method: "POST",
    headers: { "x-api-key": cfg.apiKey, "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const raw = (await res.json().catch(() => null)) as
    | { data?: { smsBatchId?: string }; smsBatchId?: string; message?: string; error?: string }
    | null;

  if (!res.ok) {
    const said = raw?.message ?? raw?.error ?? `TextBee refused the message (HTTP ${res.status}).`;
    return {
      to,
      ok: false,
      error: /device/i.test(said)
        ? `${said} Is the phone registered on this account and online?`
        : said,
    };
  }

  // The batch id is what delivery status is looked up by later.
  return { to, ok: true, sid: raw?.data?.smsBatchId ?? raw?.smsBatchId };
}
