import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone, parseRegistration, toRow, type RegistrationInputRaw } from "./registration";
import { generatePlaceholderRegistrations, ZONE_ZIP } from "./seed/registrations";

const valid: RegistrationInputRaw = {
  fullName: "  Maria   Garcia ",
  email: " Maria.Garcia@Example.com ",
  phone: "(713) 555-0142",
  language: "en",
  addressLine1: "1234 E 27th St",
  addressLine2: "",
  city: "",
  zip: "77008-1234",
  consent: true,
};

describe("phone numbers", () => {
  it("normalizes US numbers to E.164", () => {
    expect(normalizePhone("(713) 555-0142")).toBe("+17135550142");
    expect(normalizePhone("1-713-555-0142")).toBe("+17135550142");
    expect(normalizePhone("+1 713.555.0142")).toBe("+17135550142");
    expect(formatPhone("+17135550142")).toBe("(713) 555-0142");
  });
  it("rejects numbers that aren't 10-digit US numbers", () => {
    for (const bad of ["555-0142", "123-456-7890", "713 155 0142", "+44 20 7946 0958", ""]) expect(normalizePhone(bad)).toBeNull();
  });
});

describe("parseRegistration", () => {
  it("accepts the required fields alone and tidies them", () => {
    const r = parseRegistration(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({
      fullName: "Maria Garcia",
      email: "maria.garcia@example.com",
      phone: "+17135550142",
      city: "Houston",
      zip: "77008",
      addressLine2: null,
      dwellingType: null,
      pipeLocations: null,
      knowsShutoff: null,
      emergencyName: null,
      emergencyPhone: null,
    });
  });

  it("explains every missing required field in plain words", () => {
    const r = parseRegistration({});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["addressLine1", "consent", "email", "fullName", "phone", "zip"]);
    for (const msg of Object.values(r.errors)) expect(msg).toMatch(/^[A-Z].*\.$/);
  });

  it("requires consent to texts and calls", () => {
    const r = parseRegistration({ ...valid, consent: false });
    expect(r.ok || r.errors.consent).toMatch(/agree/);
  });

  it("checks email, phone and ZIP format", () => {
    const r = parseRegistration({ ...valid, email: "maria@", phone: "12345", zip: "7700" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.email).toBeTruthy();
    expect(r.errors.phone).toBeTruthy();
    expect(r.errors.zip).toBeTruthy();
  });

  it("maps survey answers", () => {
    const r = parseRegistration({
      ...valid,
      dwellingType: "house",
      pipeLocations: ["crawlspace", "garage", "garage"],
      knowsShutoff: "no",
      hasGenerator: "yes",
      someoneHome3Days: "not_sure",
      emergencyName: "Rosa Garcia",
      emergencyPhone: "281-555-0101",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({
      dwellingType: "house",
      pipeLocations: ["crawlspace", "garage"],
      knowsShutoff: false,
      hasGenerator: true,
      someoneHome3Days: "not_sure",
      emergencyPhone: "+12815550101",
    });
  });

  it("doesn't mix 'None of these' or 'Not sure' with a place", () => {
    const r = parseRegistration({ ...valid, pipeLocations: ["none", "garage"] });
    expect(r.ok || r.errors.pipeLocations).toBeTruthy();
    expect(r.ok).toBe(false);
  });

  it("needs both the emergency contact's name and a different phone number", () => {
    const a = parseRegistration({ ...valid, emergencyName: "Rosa Garcia" });
    expect(!a.ok && a.errors.emergencyPhone).toBeTruthy();
    const b = parseRegistration({ ...valid, emergencyPhone: "281-555-0101" });
    expect(!b.ok && b.errors.emergencyName).toBeTruthy();
    const c = parseRegistration({ ...valid, emergencyName: "Rosa Garcia", emergencyPhone: valid.phone });
    expect(!c.ok && c.errors.emergencyPhone).toMatch(/different/);
  });

  it("builds a database row with consent and source", () => {
    const r = parseRegistration(valid);
    if (!r.ok) throw new Error("expected valid");
    const row = toRow(r.data);
    expect(row).toMatchObject({ state: "TX", consent_texts_calls: true, source: "signup", simulated: false, home_id: null });
    expect(row.consent_version).toBeTruthy();
  });
});

describe("placeholder registrations", () => {
  const all = generatePlaceholderRegistrations();

  it("are deterministic, 100 per area, and every one passes the same validation as the form", () => {
    expect(generatePlaceholderRegistrations()).toEqual(all);
    expect(all).toHaveLength(400);
    for (const p of all) {
      const r = parseRegistration(p.input);
      if (!r.ok) throw new Error(`${p.homeId}: ${JSON.stringify(r.errors)}`);
      expect(Object.values(ZONE_ZIP)).toContain(r.data.zip);
    }
  });

  it("never use a real-looking contact: example.com emails and 555-01XX numbers only, all unique", () => {
    const emails = all.map((p) => p.input.email as string);
    const phones = all.map((p) => normalizePhone(p.input.phone as string));
    expect(new Set(emails).size).toBe(all.length);
    expect(new Set(phones).size).toBe(all.length);
    expect(new Set(all.map((p) => p.homeId)).size).toBe(all.length);
    for (const e of emails) expect(e).toMatch(/@example\.com$/);
    for (const p of [...phones, ...all.map((x) => normalizePhone((x.input.emergencyPhone as string) || "(713) 555-0100"))])
      expect(p).toMatch(/^\+1\d{3}55501\d{2}$/);
  });
});
