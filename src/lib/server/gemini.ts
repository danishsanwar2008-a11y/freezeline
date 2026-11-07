import "server-only";
import { z } from "zod";

/**
 * Gemini (free tier) for the photo check only. Key: GEMINI_API_KEY in .env.local, server-side only.
 * Model: GEMINI_MODEL if set; otherwise the current free-tier Flash models, tried in order
 * (Google retires model IDs for new keys, e.g. gemini-2.5-flash, so a 404 moves to the next one).
 */
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
/** Per-model time limit; a slow free-tier model falls through to the next one. */
export const GEMINI_TIMEOUT_MS = 25_000;
export const DEFAULT_GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"];
export const geminiModels = () => (process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : DEFAULT_GEMINI_MODELS);

const Result = z.object({ outdoor_faucet: z.enum(["covered", "bare", "unclear"]), note: z.string() });
export type GeminiPhotoResult = z.infer<typeof Result>;

export async function geminiClassifyFaucet(jpegBase64: string, instructions: string): Promise<GeminiPhotoResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  let res: Response | null = null;
  for (const model of geminiModels()) {
    try {
      res = await callModel(model, key, jpegBase64, instructions);
    } catch (err) {
      // Timed out (or network error): try the next model; if it was the last one, report it.
      res = new Response(String(err instanceof Error ? err.message : err), { status: 504 });
      continue;
    }
    // 404 = retired for this key, 429 = free-tier rate limit, 503 = overloaded: try the next free model.
    if (![404, 429, 503, 504].includes(res.status)) break;
  }
  if (!res || !res.ok) throw new Error(`Gemini ${res?.status}: ${((await res?.text()) ?? "").slice(0, 300)}`);
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  let parsed: ReturnType<typeof Result.safeParse>;
  try {
    parsed = Result.safeParse(JSON.parse(text || "{}"));
  } catch {
    parsed = Result.safeParse(null);
  }
  // Anything we can't read safely counts as "unclear", never as a confident answer.
  return parsed.success ? parsed.data : { outdoor_faucet: "unclear", note: "We couldn't check this photo." };
}

function callModel(model: string, key: string, jpegBase64: string, instructions: string) {
  return fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instructions }] },
      contents: [
        {
          role: "user",
          parts: [{ inlineData: { mimeType: "image/jpeg", data: jpegBase64 } }, { text: "Is this outdoor faucet covered?" }],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            outdoor_faucet: { type: "STRING", enum: ["covered", "bare", "unclear"] },
            note: { type: "STRING" },
          },
          required: ["outdoor_faucet", "note"],
        },
      },
    }),
  });
}
