import { afterEach, describe, expect, it, vi } from "vitest";
import { geminiClassifyFaucet } from "./gemini";

const reply = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200, headers: { "content-type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GEMINI_API_KEY;
});

describe("Gemini photo check (free tier)", () => {
  it("sends the key in a header (never the URL) and parses the structured answer", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => reply('{"outdoor_faucet":"covered","note":"A foam cover is on the faucet."}'));
    vi.stubGlobal("fetch", fetchMock);
    const r = await geminiClassifyFaucet("aGVsbG8=", "instructions");
    expect(r).toEqual({ outdoor_faucet: "covered", note: "A foam cover is on the faucet." });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("test-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
  });

  it("treats anything it can't read safely as unclear", async () => {
    process.env.GEMINI_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn(async () => reply('{"outdoor_faucet":"probably fine"}')));
    expect((await geminiClassifyFaucet("aGVsbG8=", "i")).outdoor_faucet).toBe("unclear");
  });

  it("refuses to run without a key", async () => {
    await expect(geminiClassifyFaucet("aGVsbG8=", "i")).rejects.toThrow("GEMINI_API_KEY");
  });
});

describe("Gemini model fallback", () => {
  it("moves to the next free-tier model when one is retired (404) or busy (503)", async () => {
    process.env.GEMINI_API_KEY = "k";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("model retired", { status: 404 }))
      .mockResolvedValueOnce(reply('{"outdoor_faucet":"bare","note":"A brass faucet with no cover."}'));
    vi.stubGlobal("fetch", fetchMock);
    expect((await geminiClassifyFaucet("aGVsbG8=", "i")).outdoor_faucet).toBe("bare");
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toContain("gemini-3.8-flash");
    expect(urls[1]).toContain("gemini-3.5-flash-lite");
  });
});

describe("Gemini timeouts", () => {
  it("falls through to the next model when the first one times out", async () => {
    process.env.GEMINI_API_KEY = "k";
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("The operation was aborted due to timeout", "TimeoutError"))
      .mockResolvedValueOnce(reply('{"outdoor_faucet":"covered","note":"Foam cover."}'));
    vi.stubGlobal("fetch", fetchMock);
    expect((await geminiClassifyFaucet("aGVsbG8=", "i")).outdoor_faucet).toBe("covered");
    expect(String(fetchMock.mock.calls[1][0])).toContain("gemini-3.5-flash-lite");
  });
});
