import { describe, expect, it } from "vitest";
import { T, clockLabel, dayLabel } from "./i18n";

describe("homeowner wording", () => {
  it("formats the freeze clock time in both languages without doubled periods", () => {
    expect(T.en.clockAtRisk(clockLabel("2021-02-16T03:00", "en"))).toBe("If the heat goes out, your pipes are at risk around 3 AM.");
    expect(T.es.clockAtRisk(clockLabel("2021-02-16T03:00", "es"))).toBe("Si se va la calefacción, sus tuberías corren riesgo alrededor de las 3 a. m.");
    expect(clockLabel("2021-02-16T15:00", "en")).toBe("3 PM");
  });

  it("formats days", () => {
    expect(dayLabel("2021-02-16T06:00", "en")).toBe("Tue, Feb 16");
    expect(dayLabel("2021-02-16T06:00", "es")).toBe("mar 16 feb");
  });

  it("has the same five burst steps in both languages", () => {
    expect(T.en.burstSteps).toHaveLength(5);
    expect(T.es.burstSteps).toHaveLength(5);
  });
});
