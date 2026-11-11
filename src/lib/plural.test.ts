import { describe, expect, it } from "vitest";
import { plural, singularizeOnes, verb } from "./plural";

describe("plural", () => {
  it("uses the singular only for exactly 1", () => {
    expect(plural(1, "home")).toBe("1 home");
    expect(plural(0, "home")).toBe("0 homes");
    expect(plural(2308, "home")).toBe("2,308 homes");
    expect(plural(1, "person", "people")).toBe("1 person");
    expect(verb(1, "needs", "need")).toBe("needs");
    expect(verb(3, "needs", "need")).toBe("need");
  });

  it("fixes '1 homes' in filled templates without touching 11, 21 or 1,001", () => {
    expect(singularizeOnes("after 1 hours below 20°F")).toBe("after 1 hour below 20°F");
    expect(singularizeOnes("1 casas de riesgo alto")).toBe("1 casa de riesgo alto");
    expect(singularizeOnes("11 homes and 21 homes")).toBe("11 homes and 21 homes");
    expect(singularizeOnes("2,001 homes")).toBe("2,001 homes");
  });
});
