import { afterEach, describe, expect, it, vi } from "vitest";
import { newSession, passwordMatches, requireConsole, safeNext, SESSION_COOKIE, validSession } from "./consoleAuth";

afterEach(() => vi.unstubAllEnvs());

describe("console password gate", () => {
  it("fails closed when CONSOLE_PASSWORD isn't set", () => {
    vi.stubEnv("CONSOLE_PASSWORD", "");
    expect(passwordMatches("")).toBe(false);
    expect(passwordMatches("anything")).toBe(false);
    expect(validSession("123.abc")).toBe(false);
    expect(() => newSession()).toThrow();
  });

  it("accepts only the right password", () => {
    vi.stubEnv("CONSOLE_PASSWORD", "correct horse");
    expect(passwordMatches("correct horse")).toBe(true);
    expect(passwordMatches("correct hors")).toBe(false);
    expect(passwordMatches("")).toBe(false);
  });

  it("session cookie: never contains the password, expires after 12 hours, dies when the password changes", () => {
    vi.stubEnv("CONSOLE_PASSWORD", "correct horse");
    const now = Date.UTC(2026, 10, 11, 12);
    const s = newSession(now);
    expect(s).not.toContain("correct");
    expect(validSession(s, now + 60_000)).toBe(true);
    expect(validSession(s, now + 12 * 3_600_000 + 1)).toBe(false);
    expect(validSession(s.replace(/.$/, (c) => (c === "0" ? "1" : "0")), now)).toBe(false); // tampered
    expect(validSession(`${now + 3_600_000}.${s.split(".")[1]}`, now)).toBe(false); // forged time
    vi.stubEnv("CONSOLE_PASSWORD", "new password");
    expect(validSession(s, now + 60_000)).toBe(false);
  });

  it("API routes get 401 without a valid cookie", () => {
    vi.stubEnv("CONSOLE_PASSWORD", "correct horse");
    expect(requireConsole(new Request("http://x/api/ops"))?.status).toBe(401);
    const ok = new Request("http://x/api/ops", { headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(newSession())}` } });
    expect(requireConsole(ok)).toBeNull();
  });

  it("only same-site paths are allowed after sign-in", () => {
    expect(safeNext("/console?x=1")).toBe("/console?x=1");
    expect(safeNext("//evil.example")).toBe("/console");
    expect(safeNext("https://evil.example")).toBe("/console");
    expect(safeNext("/\\evil.example")).toBe("/console");
    // The URL parser drops tabs/newlines: these would become "//evil.example" in the browser.
    expect(safeNext("/\t/evil.example")).toBe("/console");
    expect(safeNext("/\n/evil.example")).toBe("/console");
    expect(safeNext("/\r\n/evil.example")).toBe("/console");
    expect(safeNext(undefined)).toBe("/console");
  });
});
