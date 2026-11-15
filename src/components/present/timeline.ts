// The deck's running order: four scenes, each stepped through one beat per key press.
// Pure (tested in timeline.test.ts).

export const scenes = [
  { id: "storm", beats: ["title", "calm", "storm", "peak"] },
  { id: "pressure", beats: ["blanket", "targeted", "stage2"] },
  { id: "outreach", beats: ["text", "call", "door", "crews"] },
  { id: "architecture", beats: ["data", "engine", "agent", "stack"] },
] as const;

export type Beat = (typeof scenes)[number]["beats"][number];
export type Position = { scene: number; beat: number };

const beatsIn = (scene: number) => scenes[scene].beats.length;

export const start: Position = { scene: 0, beat: 0 };

export function advance(p: Position): Position {
  if (p.beat < beatsIn(p.scene) - 1) return { scene: p.scene, beat: p.beat + 1 };
  if (p.scene < scenes.length - 1) return { scene: p.scene + 1, beat: 0 };
  return p;
}

export function retreat(p: Position): Position {
  if (p.beat > 0) return { scene: p.scene, beat: p.beat - 1 };
  if (p.scene === 0) return p;
  return { scene: p.scene - 1, beat: beatsIn(p.scene - 1) - 1 };
}

export const last = (): Position => ({ scene: scenes.length - 1, beat: beatsIn(scenes.length - 1) - 1 });

export const beatAt = (p: Position): Beat => scenes[p.scene].beats[p.beat];

const clamp = (v: number, n: number) => (Number.isFinite(v) ? Math.min(Math.max(Math.trunc(v), 0), n - 1) : 0);

/** The URL counts from 1, the way a presenter says it: ?scene=2&beat=3. */
export function parsePosition(sceneParam?: string, beatParam?: string): Position {
  const scene = clamp(Number(sceneParam ?? 1) - 1, scenes.length);
  return { scene, beat: clamp(Number(beatParam ?? 1) - 1, beatsIn(scene)) };
}

export function toSearch(p: Position): string {
  const q = new URLSearchParams({ scene: String(p.scene + 1) });
  if (p.beat > 0) q.set("beat", String(p.beat + 1));
  return `?${q}`;
}
