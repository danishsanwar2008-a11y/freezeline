import { describe, expect, it } from "vitest";
import { advance, beatAt, last, parsePosition, retreat, scenes, start, toSearch } from "./timeline";

describe("deck timeline", () => {
  it("steps forward through every beat of every scene, then stops", () => {
    let p = start;
    const seen = [beatAt(p)];
    for (let i = 0; i < 50; i++) {
      const n = advance(p);
      if (n === p) break;
      p = n;
      seen.push(beatAt(p));
    }
    expect(seen).toEqual(scenes.flatMap((s) => [...s.beats]));
    expect(p).toEqual(last());
  });

  it("steps back across scene boundaries and stops at the start", () => {
    expect(retreat({ scene: 1, beat: 0 })).toEqual({ scene: 0, beat: scenes[0].beats.length - 1 });
    expect(retreat(start)).toBe(start);
  });

  it("reads and writes the URL position, clamping bad values", () => {
    expect(parsePosition("2", "3")).toEqual({ scene: 1, beat: 2 });
    expect(parsePosition("99", "99")).toEqual(last());
    expect(parsePosition("abc")).toEqual(start);
    expect(toSearch({ scene: 2, beat: 0 })).toBe("?scene=3");
    expect(toSearch({ scene: 2, beat: 1 })).toBe("?scene=3&beat=2");
  });
});
