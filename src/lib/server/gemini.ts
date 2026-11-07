import "server-only";
import { z } from "zod";

/**
 * Gemini (free tier) for the photo check only. Key: GEMINI_API_KEY in .env.local, server-side only.
 * Model: GEMINI_MODEL (default gemini-2.5-flash, which accepts image input on the free tier).
 */
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const Result = z.object({ outdoor_faucet: z.enum(["covered", "bare", "unclear"]), note: z.string() });
export type GeminiPhotoResult = z.infer<typeof Result>;

export async function geminiClassifyFaucet(jpegBase64: string, instructions: string): Promise<GeminiPhotoResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
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
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const parsed = Result.safeParse(JSON.parse(text || "{}"));
  // Anything we can't read safely counts as "unclear", never as a confident answer.
  return parsed.success ? parsed.data : { outdoor_faucet: "unclear", note: "We couldn't check this photo." };
}
