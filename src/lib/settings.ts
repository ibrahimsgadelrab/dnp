import type { EvaluationSettings } from "../types";

export const defaultSettings: EvaluationSettings = {
  excludedPrefixes: ["2222"],
  freeMonthPrefixes: ["3333"],
  freeMonthRequiredVisits: 3,
  validVisitGapDays: 6,
  densityThreshold: 7,
  densityFormula: "subscriptionsAndReviewerVisits",
  idealLossKg: 4.5,
  idealBmiMax: 26,
  maintenanceVisits: 5,
  maintenanceBmiMax: 26,
  maintenanceMode: "last",
  highWeightCwfBufferPct: 10,
  impactfulBrands: [
    "Luxury Healthy Lifestyle",
    "EN",
    "Pio Protection",
    "Body Builder",
    "Optitect",
    "Wow Woman",
    "Laperva"
  ],
  criteria: [
    { id: "density", label: "الكثافة اليومية", target: 7, points: 10, appliesTo: ["nutrition_specialist", "supplement_consultant"] },
    { id: "clients", label: "العدد الإجمالي للعملاء", target: 80, points: 10, appliesTo: ["nutrition_specialist", "supplement_consultant"] },
    { id: "lossKg", label: "إجمالي الكيلوجرامات المخفضة", target: 120, points: 8, appliesTo: ["nutrition_specialist", "supplement_consultant"] },
    { id: "avgVisits", label: "متوسط عدد الزيارات", target: 3, points: 10, appliesTo: ["nutrition_specialist", "supplement_consultant"] },
    { id: "idealWeight", label: "الوصول للوزن المثالي", target: 8, points: 5, appliesTo: ["nutrition_specialist"] },
    { id: "maintenance", label: "تثبيت الوزن", target: 5, points: 5, appliesTo: ["nutrition_specialist"] },
    { id: "freeMonth", label: "عملاء الشهر المجاني المؤهلون", target: 10, points: 5, appliesTo: ["nutrition_specialist"] },
    { id: "scientific", label: "المستوى العلمي", target: 100, points: 3, appliesTo: ["nutrition_specialist", "supplement_consultant"] },
    { id: "admin", label: "التقييم الإداري", target: 100, points: 3, appliesTo: ["nutrition_specialist", "supplement_specialist", "supplement_consultant"] },
    { id: "freeCheck", label: "الفحص المجاني", target: 20, points: 3, appliesTo: ["nutrition_specialist", "supplement_consultant"] },
    { id: "successStories", label: "قصص النجاح", target: 5, points: 3, appliesTo: ["nutrition_specialist", "supplement_consultant"] }
  ],
  targetAdjustment: {
    increase: [
      { min: 100, max: 110.99, values: [0.3, 0.2, 0.1, 0.05] },
      { min: 111, max: 120.99, values: [0.4, 0.3, 0.2, 0.1] },
      { min: 121, max: 130.99, values: [0.5, 0.4, 0.3, 0.2] },
      { min: 131, max: 140.99, values: [0.6, 0.5, 0.4, 0.3] },
      { min: 141, max: 150.99, values: [0.7, 0.6, 0.5, 0.4] },
      { min: 151, max: 160.99, values: [0.8, 0.7, 0.6, 0.5] },
      { min: 161, max: 170.99, values: [0.9, 0.8, 0.7, 0.6] },
      { min: 171, values: [1, 0.9, 0.8, 0.7] }
    ],
    decrease: [
      { min: 90, max: 99.99, values: [0, 0.1, 0.1, 0.2] },
      { min: 80, max: 89.99, values: [-0.1, -0.2, -0.3, -0.4] },
      { min: 70, max: 79.99, values: [-0.2, -0.3, -0.4, -0.5] },
      { min: 60, max: 69.99, values: [-0.3, -0.4, -0.5, -0.6] },
      { min: 50, max: 59.99, values: [-0.4, -0.5, -0.6, -0.7] },
      { min: 0, max: 49.99, values: [-0.5, -0.7, -0.8, -0.9] }
    ]
  }
};
