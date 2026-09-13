import type { Branch, Employee, EvaluationCycle, RawVisit } from "../types";

export const sampleCycle: EvaluationCycle = {
  id: "cycle-q4-2026",
  name: "دورة أغسطس - ديسمبر 2026",
  startsAt: "2026-08-01",
  endsAt: "2026-12-31",
  workingDays: 122
};

export const sampleBranches: Branch[] = [
  { id: "b1", name: "دبي مول", densityOverride: "high", targetRevenue: 750000 },
  { id: "b2", name: "الشارقة واسط", densityOverride: "low", targetRevenue: 300000 },
  { id: "b3", name: "العين", targetRevenue: 220000 }
];

export const sampleEmployees: Employee[] = [
  { id: "e1", name: "سارة أحمد", role: "nutrition_specialist", branchId: "b1", currentTarget: 1.2, adminScore: 88, scientificScore: 94 },
  { id: "e2", name: "خالد محمود", role: "supplement_specialist", branchId: "b1", currentTarget: 0.9, staffId: "DNP-102", adminScore: 90 },
  { id: "e3", name: "مريم علي", role: "supplement_consultant", branchId: "b2", currentTarget: 0.7, adminScore: 82, scientificScore: 87 },
  { id: "e4", name: "عمر حسن", role: "supplement_specialist", branchId: "b2", currentTarget: 1.0, staffId: "DNP-225", adminScore: 78 }
];

export const sampleVisits: RawVisit[] = [
  { sourceFile: "demo.xlsx", rowNumber: 1, clientName: "أحمد سالم", clientId: "0501234567", visitDate: "2026-08-01", visitTime: "09:00", weight: 104, height: 176, specialist: "سارة أحمد", branch: "دبي مول", customerGoal: "loss", program: "Dr Nutrition", products: "Laperva" },
  { sourceFile: "demo.xlsx", rowNumber: 2, clientName: "أحمد سالم", clientId: "971501234567", visitDate: "2026-08-08", visitTime: "10:00", weight: 101, height: 176, specialist: "سارة أحمد", branch: "دبي مول", customerGoal: "loss", program: "Dr Nutrition", products: "EN" },
  { sourceFile: "demo.xlsx", rowNumber: 3, clientName: "أحمد سالم", clientId: "00971501234567", visitDate: "2026-08-15", visitTime: "11:00", weight: 98.4, height: 176, specialist: "سارة أحمد", branch: "دبي مول", customerGoal: "loss" },
  { sourceFile: "demo.xlsx", rowNumber: 4, clientName: "ليلى ناصر", clientId: "3333398765", visitDate: "2026-08-03", visitTime: "12:00", weight: 82, height: 164, specialist: "سارة أحمد", branch: "دبي مول", customerGoal: "loss", freeMonth: true },
  { sourceFile: "demo.xlsx", rowNumber: 5, clientName: "ليلى ناصر", clientId: "3333398765", visitDate: "2026-08-10", visitTime: "12:00", weight: 80.6, height: 164, specialist: "سارة أحمد", branch: "دبي مول", customerGoal: "loss", freeMonth: true },
  { sourceFile: "demo.xlsx", rowNumber: 6, clientName: "ليلى ناصر", clientId: "3333398765", visitDate: "2026-08-18", visitTime: "12:00", weight: 79.5, height: 164, specialist: "سارة أحمد", branch: "دبي مول", customerGoal: "loss", freeMonth: true },
  { sourceFile: "demo.xlsx", rowNumber: 7, clientName: "فحص داخلي", clientId: "222212345", visitDate: "2026-08-04", weight: 77, height: 170, specialist: "مريم علي", branch: "الشارقة واسط", customerGoal: "loss" },
  { sourceFile: "demo.xlsx", rowNumber: 8, clientName: "مازن فؤاد", clientId: "0557778888", visitDate: "2026-08-01", visitTime: "15:00", weight: 64, height: 175, specialist: "مريم علي", branch: "الشارقة واسط", customerGoal: "gain" },
  { sourceFile: "demo.xlsx", rowNumber: 9, clientName: "مازن فؤاد", clientId: "0557778888", visitDate: "2026-08-07", visitTime: "16:00", weight: 65.5, height: 175, specialist: "مريم علي", branch: "الشارقة واسط", customerGoal: "gain" },
  { sourceFile: "demo.xlsx", rowNumber: 10, clientName: "ندى يوسف", clientId: "0561112222", visitDate: "2026-08-02", weight: 76, height: 168, specialist: "سارة أحمد", branch: "دبي مول", customerGoal: "loss" },
  { sourceFile: "demo.xlsx", rowNumber: 11, clientName: "ندى يوسف", clientId: "0561112222", visitDate: "2026-08-04", weight: 75.5, height: 168, specialist: "سارة أحمد", branch: "دبي مول", customerGoal: "loss" },
  { sourceFile: "demo.xlsx", rowNumber: 12, clientName: "ندى يوسف", clientId: "0561112222", visitDate: "2026-08-10", weight: 72.1, height: 168, specialist: "سارة أحمد", branch: "دبي مول", customerGoal: "loss" }
];
