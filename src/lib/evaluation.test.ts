import { describe, expect, it } from "vitest";
import { defaultSettings } from "./settings";
import { normalizePhone, normalizeVisits, calculateBmi } from "./normalization";
import { buildClientProfiles, computeBranchMetrics, targetAdjustment } from "./evaluation";
import type { Branch, EvaluationCycle, RawVisit } from "../types";

const baseVisit = (rowNumber: number, clientId: string, visitDate: string, weight = 90): RawVisit => ({
  sourceFile: "test.xlsx",
  rowNumber,
  clientName: "Test",
  clientId,
  visitDate,
  visitTime: "09:00",
  weight,
  height: 170,
  specialist: "Spec",
  branch: "Branch",
  customerGoal: "loss"
});

describe("normalization rules", () => {
  it("normalizes UAE phone formats", () => {
    expect(normalizePhone("0501234567")).toBe("971501234567");
    expect(normalizePhone("00971501234567")).toBe("971501234567");
    expect(normalizePhone("501234567")).toBe("971501234567");
  });

  it("excludes 2222 clients from KPIs", () => {
    const visits = normalizeVisits([baseVisit(1, "222212345", "2026-08-01")], defaultSettings);
    expect(visits[0].excluded).toBe(true);
    expect(visits[0].validVisit).toBe(false);
  });

  it("separates 3333 free month clients and checks eligibility", () => {
    const visits = normalizeVisits([
      baseVisit(1, "333331111", "2026-08-01"),
      baseVisit(2, "333331111", "2026-08-08"),
      baseVisit(3, "333331111", "2026-08-15")
    ], defaultSettings);
    const profile = buildClientProfiles(visits, defaultSettings)[0];
    expect(profile.freeMonthClient).toBe(true);
    expect(profile.freeMonthEligible).toBe(true);
  });

  it("keeps latest same-day visit and applies six-day gap", () => {
    const visits = normalizeVisits([
      baseVisit(1, "0501234567", "2026-08-01", 90),
      { ...baseVisit(2, "0501234567", "2026-08-01", 89), visitTime: "18:00" },
      baseVisit(3, "0501234567", "2026-08-05", 88),
      baseVisit(4, "0501234567", "2026-08-08", 87)
    ], defaultSettings);
    expect(visits[0].duplicateSameDay).toBe(true);
    expect(visits[1].validVisit).toBe(true);
    expect(visits[2].validVisit).toBe(false);
    expect(visits[3].validVisit).toBe(true);
  });
});

describe("evaluation calculations", () => {
  it("calculates BMI, loss progress, ideal weight and maintenance", () => {
    expect(calculateBmi(72, 170)).toBe(24.91);
    const visits = normalizeVisits([
      baseVisit(1, "0501234567", "2026-08-01", 82),
      baseVisit(2, "0501234567", "2026-08-08", 78),
      baseVisit(3, "0501234567", "2026-08-15", 76),
      baseVisit(4, "0501234567", "2026-08-22", 74),
      baseVisit(5, "0501234567", "2026-08-29", 72)
    ], defaultSettings);
    const profile = buildClientProfiles(visits, defaultSettings)[0];
    expect(profile.progress).toBe(10);
    expect(profile.idealWeight).toBe(true);
    expect(profile.maintenance).toBe(true);
  });

  it("supports gain progress without hiding negative values", () => {
    const visits = normalizeVisits([
      { ...baseVisit(1, "0501234567", "2026-08-01", 62), customerGoal: "gain" },
      { ...baseVisit(2, "0501234567", "2026-08-08", 60), customerGoal: "gain" }
    ], defaultSettings);
    expect(buildClientProfiles(visits, defaultSettings)[0].progress).toBe(-2);
  });

  it("calculates density and target adjustment", () => {
    const visits = normalizeVisits([
      baseVisit(1, "0501234567", "2026-08-01"),
      baseVisit(2, "0501234567", "2026-08-08"),
      baseVisit(3, "0509999999", "2026-08-01"),
      baseVisit(4, "0509999999", "2026-08-08")
    ], defaultSettings);
    const branches: Branch[] = [{ id: "b1", name: "Branch", targetRevenue: 10000 }];
    const cycle: EvaluationCycle = { id: "c1", name: "Cycle", startsAt: "2026-08-01", endsAt: "2026-08-31", workingDays: 1 };
    const profiles = buildClientProfiles(visits, defaultSettings);
    const metric = computeBranchMetrics(branches, profiles, visits, cycle, defaultSettings)[0];
    expect(metric.density).toBeGreaterThanOrEqual(7);
    expect(targetAdjustment(151, 0.9, defaultSettings)).toBe(0.8);
    expect(targetAdjustment(79, 2.5, defaultSettings)).toBe(-0.5);
  });
});
