import { describe, expect, it } from "vitest";
import type { RawVisit } from "../types";
import { defaultSettings } from "./settings";
import { normalizeVisits } from "./normalization";
import { buildWeightAttributions } from "./leaveAttribution";
import { buildClientProfiles, computeCriteriaMetrics } from "./evaluation";

const visit = (rowNumber: number, date: string, specialist?: string, weight = 90): RawVisit => ({
  sourceFile: "leave.xlsx",
  rowNumber,
  clientName: "Client",
  clientId: "0501234567",
  visitDate: date,
  visitTime: "09:00",
  weight,
  height: 170,
  specialist,
  branch: "Branch",
  customerGoal: "loss"
});

describe("leave attribution policy", () => {
  it("attributes visits to the current specialist and weight change to the previous specialist", () => {
    const rows = buildWeightAttributions(normalizeVisits([
      visit(1, "2026-01-03", "Ahmed", 100),
      visit(2, "2026-01-10", "Mohamed", 97),
      visit(3, "2026-01-17", "Mohamed", 95),
      visit(4, "2026-01-24", "Ahmed", 94)
    ], defaultSettings));

    expect(rows.map((row) => row.visitSpecialist)).toEqual(["Ahmed", "Mohamed", "Mohamed", "Ahmed"]);
    expect(rows.map((row) => row.weightSpecialist)).toEqual(["Ahmed", "Ahmed", "Mohamed", "Mohamed"]);
    expect(rows.map((row) => row.status)).toEqual(["first_visit", "handoff", "continuation", "handoff"]);
    expect(rows.map((row) => row.changeKg)).toEqual([undefined, 3, 2, 1]);
  });

  it("sends unclear specialist changes to manual review", () => {
    const rows = buildWeightAttributions(normalizeVisits([
      visit(1, "2026-01-03", "Ahmed", 100),
      visit(2, "2026-01-10", undefined, 97)
    ], defaultSettings));

    expect(rows[1].status).toBe("manual_review");
    expect(rows[1].weightSpecialist).toBe("Ahmed");
  });

  it("feeds attributed weight loss into employee criteria metrics", () => {
    const normalized = normalizeVisits([
      visit(1, "2026-01-03", "Ahmed", 100),
      visit(2, "2026-01-10", "Mohamed", 97),
      visit(3, "2026-01-17", "Mohamed", 95),
      visit(4, "2026-01-24", "Ahmed", 94)
    ], defaultSettings);
    const attributions = buildWeightAttributions(normalized);
    const profiles = buildClientProfiles(normalized, defaultSettings);

    const ahmedMetrics = computeCriteriaMetrics(profiles, defaultSettings, 30, 0, { attributionRows: attributions, employeeName: "Ahmed" });
    const mohamedMetrics = computeCriteriaMetrics(profiles, defaultSettings, 30, 0, { attributionRows: attributions, employeeName: "Mohamed" });

    expect(ahmedMetrics.find((metric) => metric.id === "kg_min")?.value).toBe(3);
    expect(mohamedMetrics.find((metric) => metric.id === "kg_min")?.value).toBe(3);
  });
});
