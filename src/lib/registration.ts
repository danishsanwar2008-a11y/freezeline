// Household sign-up + home survey: one set of rules shared by the /register form, the
// /api/register route and the placeholder seed. Pure (no I/O), so it is tested directly.
// Household-facing wording: plain sentences to "you".

import { z } from "zod";

/** Shown next to the consent checkbox and stored (by version) with every sign-up. */
export const CONSENT_VERSION = "2026-11-v1";
export const CONSENT_TEXT =
  "I agree that FreezeLine and my water utility may send me automated texts and calls about freezes and water service at this number. Message and data rates may apply. Reply STOP to opt out at any time.";

export const PIPE_LOCATIONS = ["basement", "crawlspace", "garage", "none", "not_sure"] as const;
export type PipeLocation = (typeof PIPE_LOCATIONS)[number];
/** "None of these" and "Not sure" can't be combined with a place. */
export const EXCLUSIVE_PIPE: PipeLocation[] = ["none", "not_sure"];

export const PIPE_LABEL: Record<PipeLocation, string> = {
  basement: "Basement",
  crawlspace: "Crawlspace (under the house)",
  garage: "Garage",
  none: "None of these",
  not_sure: "I'm not sure",
};

// ---------- normalizers ----------

/** US phone number -> E.164 ("+17135550123"), or null if it isn't a valid 10-digit US number. */
export function normalizePhone(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10 || !/^[2-9]\d{2}[2-9]/.test(d)) return null;
  return `+1${d}`;
}

/** "+17135550123" -> "(713) 555-0123". */
export function formatPhone(e164: string): string {
  const d = e164.replace(/^\+1/, "");
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

const collapse = (s: string) => s.trim().replace(/\s+/g, " ");

// ---------- schema ----------

const optionalText = (max: number, tooLong: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? collapse(v) : ""))
    .refine((v) => v.length <= max, tooLong)
    .transform((v) => v || null);

const yesNo = z
  .enum(["yes", "no", ""])
  .optional()
  .transform((v) => (v === "yes" ? true : v === "no" ? false : null));

const phoneField = (missing: string, invalid: string) =>
  z
    .string({ error: missing })
    .transform(collapse)
    .refine((v) => v.length > 0, missing)
    .refine((v) => v.length === 0 || normalizePhone(v) !== null, invalid)
    .transform((v) => normalizePhone(v) ?? v);

/** What the form sends (strings, as typed). */
export const RegistrationInput = z
  .object({
    fullName: z
      .string({ error: "Please enter your full name." })
      .transform(collapse)
      .refine((v) => v.length >= 2, "Please enter your full name.")
      .refine((v) => v.length <= 120, "That name is too long."),
    email: z
      .string({ error: "Please enter your email address." })
      .transform((v) => v.trim().toLowerCase())
      .refine((v) => v.length > 0, "Please enter your email address.")
      .refine((v) => v.length === 0 || (v.length <= 254 && z.email().safeParse(v).success), "That email address doesn't look right."),
    phone: phoneField("Please enter your phone number.", "Please enter a 10-digit US phone number."),
    language: z.enum(["en", "es"]).default("en"),

    addressLine1: z
      .string({ error: "Please enter your street address." })
      .transform(collapse)
      .refine((v) => v.length >= 3, "Please enter your street address.")
      .refine((v) => v.length <= 160, "That address is too long."),
    addressLine2: optionalText(80, "That apartment or unit is too long."),
    city: z
      .string()
      .optional()
      .transform((v) => collapse(v ?? "") || "Houston")
      .refine((v) => v.length >= 2 && v.length <= 80, "Please enter your city."),
    zip: z
      .string({ error: "Please enter your ZIP code." })
      .transform((v) => v.trim())
      .refine((v) => /^\d{5}(-?\d{4})?$/.test(v), "Please enter a 5-digit ZIP code.")
      .transform((v) => v.slice(0, 5)),

    dwellingType: z
      .enum(["house", "apartment", ""])
      .optional()
      .transform((v) => v || null),
    pipeLocations: z
      .array(z.enum(PIPE_LOCATIONS))
      .optional()
      .transform((v) => (v && v.length ? [...new Set(v)] : null))
      .refine(
        (v) => !v || v.length === 1 || !v.some((p) => EXCLUSIVE_PIPE.includes(p)),
        "Pick the places your pipes run, or \"None of these\" or \"I'm not sure\" on its own.",
      ),
    knowsShutoff: yesNo,
    hasGenerator: yesNo,
    someoneHome3Days: z
      .enum(["yes", "no", "not_sure", ""])
      .optional()
      .transform((v) => v || null),
    emergencyName: optionalText(120, "That name is too long."),
    emergencyPhone: z
      .string()
      .optional()
      .transform((v) => collapse(v ?? ""))
      .refine((v) => v.length === 0 || normalizePhone(v) !== null, "Please enter a 10-digit US phone number for your emergency contact.")
      .transform((v) => (v ? normalizePhone(v) : null)),

    consent: z.literal(true, { error: "Please agree to texts and calls so we can reach you during a freeze." }),
    /** Honeypot: hidden from people; bots fill it in. */
    website: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.emergencyName && !v.emergencyPhone)
      ctx.addIssue({ code: "custom", path: ["emergencyPhone"], message: "Please add a phone number for your emergency contact." });
    if (v.emergencyPhone && !v.emergencyName)
      ctx.addIssue({ code: "custom", path: ["emergencyName"], message: "Please add your emergency contact's name." });
    if (v.emergencyPhone && v.emergencyPhone === v.phone)
      ctx.addIssue({ code: "custom", path: ["emergencyPhone"], message: "Your emergency contact needs a different number than yours." });
  });

export type RegistrationInputRaw = z.input<typeof RegistrationInput>;
export type Registration = z.output<typeof RegistrationInput>;
export type FieldErrors = Partial<Record<keyof RegistrationInputRaw, string>>;

/** Validate a sign-up. Errors are one friendly sentence per field (first problem only). */
export function parseRegistration(raw: unknown): { ok: true; data: Registration } | { ok: false; errors: FieldErrors } {
  const r = RegistrationInput.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  const errors: FieldErrors = {};
  for (const issue of r.error.issues) {
    const key = (issue.path[0] ?? "fullName") as keyof RegistrationInputRaw;
    errors[key] ??= issue.message;
  }
  return { ok: false, errors };
}

/** Database row (supabase/004_registrations.sql) for a validated sign-up. */
export interface RegistrationRow {
  full_name: string;
  email: string;
  phone: string;
  preferred_language: "en" | "es";
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
  home_id: string | null;
  dwelling_type: "house" | "apartment" | null;
  pipe_locations: PipeLocation[] | null;
  knows_shutoff: boolean | null;
  has_generator: boolean | null;
  someone_home_3_days: "yes" | "no" | "not_sure" | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  consent_texts_calls: true;
  consent_version: string;
  source: "signup" | "placeholder";
  simulated: boolean;
}

export function toRow(
  r: Registration,
  opts: { homeId?: string | null; source?: RegistrationRow["source"]; simulated?: boolean } = {},
): RegistrationRow {
  return {
    full_name: r.fullName,
    email: r.email,
    phone: r.phone,
    preferred_language: r.language,
    address_line1: r.addressLine1,
    address_line2: r.addressLine2,
    city: r.city,
    state: "TX",
    zip: r.zip,
    home_id: opts.homeId ?? null,
    dwelling_type: r.dwellingType,
    pipe_locations: r.pipeLocations,
    knows_shutoff: r.knowsShutoff,
    has_generator: r.hasGenerator,
    someone_home_3_days: r.someoneHome3Days,
    emergency_name: r.emergencyName,
    emergency_phone: r.emergencyPhone,
    consent_texts_calls: true,
    consent_version: CONSENT_VERSION,
    source: opts.source ?? "signup",
    simulated: opts.simulated ?? false,
  };
}
