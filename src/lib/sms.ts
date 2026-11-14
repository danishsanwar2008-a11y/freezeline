// One place to choose how a text leaves the building.
//
//   SMS_PROVIDER=twilio   (default) Twilio REST API: any US number, needs an upgraded account
//                         and A2P 10DLC registration before messaging real households.
//   SMS_PROVIDER=textbee  TextBee: an Android phone with a SIM does the sending. No
//                         registration and no per-message fee, but one phone's throughput.
//
// Everything above this file (the CLI, /api/sms) is provider-agnostic.
import { isUsMobile as isTwilioUsMobile, sendSms as twilioSend, smsConfig, type SmsResult } from "./twilioSms";
import { sendTextbeeSms, textbeeConfig } from "./textbeeSms";

export type { SmsResult };

export type SmsProvider = "twilio" | "textbee";

export function smsProvider(): SmsProvider {
  return (process.env.SMS_PROVIDER ?? "").trim().toLowerCase() === "textbee" ? "textbee" : "twilio";
}

/** True when the selected provider has the credentials it needs. */
export function smsConfigured(): boolean {
  return smsProvider() === "textbee" ? Boolean(textbeeConfig()) : Boolean(smsConfig());
}

/** What to put in .env when the selected provider isn't ready. */
export function smsSetupHint(): string {
  return smsProvider() === "textbee"
    ? "Set TEXTBEE_API_KEY (and optionally TEXTBEE_DEVICE_ID, TEXTBEE_BASE_URL) in .env."
    : "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER in .env.";
}

export const isUsMobile = isTwilioUsMobile;

export function sendSms(to: string, body: string): Promise<SmsResult> {
  return smsProvider() === "textbee" ? sendTextbeeSms(to, body) : twilioSend(to, body);
}
