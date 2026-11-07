import { z } from "zod";
import { getCity } from "@/lib/server/cityState";
import { checkFaucetPhoto, PhotoCheckUnavailable } from "@/lib/server/photoCheck";

export const maxDuration = 60;

// ~1.5 MB of base64; the page shrinks photos to 1024px JPEG first.
const Body = z.object({ homeId: z.string().max(64), image: z.string().min(100).max(2_000_000) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Expected { homeId, image }" }, { status: 400 });
  const { homeId, image } = parsed.data;
  try {
    const city = await getCity();
    const idx = city.byId.get(homeId);
    if (idx === undefined) return Response.json({ error: "Unknown home" }, { status: 404 });
    if (city.homes[idx].outdoor_faucets === 0) return Response.json({ error: "This home has no outdoor faucet" }, { status: 400 });
    const result = await checkFaucetPhoto(homeId, image);
    return Response.json(result);
  } catch (err) {
    if (err instanceof PhotoCheckUnavailable) return Response.json({ error: "Photo check is unavailable" }, { status: 503 });
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
