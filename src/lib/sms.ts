// One place to choose how a text leaves the building.
//
//   SMS_PROVIDER=twilio   (default) Twilio REST API: any US number, needs an upgraded account
//                         and A2P 10DLC registration before messaging real households.
//   SMS_PROVIDER=textbee  TextBee: an Android phone with a SIM does the sending. No
//                         registration and no per-message fee, but one phone's throughput.
//   SMS_PROVIDER=photon   Photon (photon.codes): an iMessage from the project's free shared
//                         iMessage line. It can only reply, so the recipient texts the agent's
//                         number once first (src/lib/photonSms.ts).
//
// Everything above this file (the CLI, /api/sms, the texts after a call) is provider-agnostic.
import { isUsMobile as isTwilioUsMobile, sendSms as twilioSend, smsConfig, type SmsResult } from "./twilioSms";
import { sendTextbeeSms, textbeeConfig } from "./textbeeSms";
import { photonConfig, sendPhotonText } from "./photonSms";

export type { SmsResult };

export type SmsProvider = "twilio" | "textbee" | "photon";

export function smsProvider(): SmsProvider {
  const p = (process.env.SMS_PROVIDER ?? "").trim().toLowerCase();
  return p === "textbee" || p === "photon" ? p : "twilio";
}

/** True when the selected provider has the credentials it needs. */
export function smsConfigured(): boolean {
  const p = smsProvider();
  return p === "textbee" ? Boolean(textbeeConfig()) : p === "photon" ? Boolean(photonConfig()) : Boolean(smsConfig());
}

/** What to put in .env when the selected provider isn't ready. */
export function smsSetupHint(): string {
  const p = smsProvider();
  if (p === "textbee") return "Set TEXTBEE_API_KEY (and optionally TEXTBEE_DEVICE_ID, TEXTBEE_BASE_URL) in .env.";
  if (p === "photon") return "Set PHOTON_PROJECT_ID and PHOTON_API_KEY (a pho_sk_ project key with project:read + project:write) in .env.local.";
  return "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER in .env.";
}

export const isUsMobile = isTwilioUsMobile;

export function sendSms(to: string, body: string): Promise<SmsResult> {
  const p = smsProvider();
  return p === "textbee" ? sendTextbeeSms(to, body) : p === "photon" ? sendPhotonText(to, body) : twilioSend(to, body);
}
