// Sending a text through Twilio's REST API: Basic auth with the account SID and auth token, a
// form-encoded body, no SDK. It reads the same three variables the voice agent uses, so one
// .env covers both the call and the text.
//
// Deliberately NOT under src/lib/server: that folder carries `import "server-only"`, which
// throws outside Next, so the CLI in scripts/ could not use it. Server-side only in practice:
// it reads process.env and needs the auth token, which the browser never has.

export type SmsResult = {
  to: string;
  ok: boolean;
  sid?: string;
  code?: number;
  error?: string;
};

/** US mobile numbers only, the same rule the sign-up form enforces. */
const US_E164 = /^\+1[2-9][0-9]{9}$/;

export const isUsMobile = (number: string): boolean => US_E164.test(number);

/** The Twilio credentials, or null when any of the three is missing. */
export function smsConfig(): { sid: string; token: string; from: string } | null {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  return sid && token && from ? { sid, token, from } : null;
}

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  if (!US_E164.test(to)) {
    return { to, ok: false, error: "Not a US mobile number in +1XXXXXXXXXX form." };
  }
  const cfg = smsConfig();
  if (!cfg) {
    return {
      to,
      ok: false,
      error: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER are not set.",
    };
  }

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.sid}/Messages.json`, {
    method: "POST",
    headers: {
      authorization: "Basic " + Buffer.from(`${cfg.sid}:${cfg.token}`).toString("base64"),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: cfg.from, Body: body }),
    cache: "no-store",
  });

  const data = (await res.json().catch(() => null)) as
    | { sid?: string; message?: string; code?: number }
    | null;

  if (!res.ok) {
    return {
      to,
      ok: false,
      code: data?.code,
      // 21608 is Twilio's trial gate: unverified destination. Saying so saves an hour of
      // hunting for a bug on our side.
      error:
        data?.code === 21608
          ? "A trial account can only text numbers verified in the Twilio console. Verify this number, or upgrade the account."
          : data?.message ?? `Twilio refused the message (HTTP ${res.status}).`,
    };
  }
  return { to, ok: true, sid: data?.sid };
}
