import type { CriteriaMetric, EvaluationCase } from "../types";

export type ManualInputs = Record<string, number>;

export interface CaseCriterion {
  id: string;
  label: string;
  points: number;
  target: number;
  source: "device" | "manual" | "penalty";
  metricId?: string;
}

export interface ScoreRow extends CaseCriterion {
  achieved?: number;
  earned?: number;
  missing: boolean;
}

export const caseTitles: Record<EvaluationCase, string> = {
  nutrition_specialist: "أخصائي تغذية - فرع عالي الكثافة",
  supplement_consultant_two_employees: "استشاري مكملات - فرع منخفض الكثافة به موظفان",
  supplement_consultant_single_employee: "استشاري مكملات - فرع منخفض الكثافة به موظف واحد"
};

export const caseCriteria: Record<EvaluationCase, CaseCriterion[]> = {
  nutrition_specialist: [
    { id: "density", label: "الكثافة اليومية", points: 10, target: 7, source: "device", metricId: "density" },
    { id: "clients", label: "العدد الإجمالي للعملاء", points: 10, target: 100, source: "device", metricId: "clients" },
    { id: "kg_min", label: "إجمالي الكيلوجرامات المخفضة", points: 8, target: 150, source: "device", metricId: "kg_min" },
    { id: "avg_visits", label: "متوسط عدد الزيارات", points: 10, target: 6.5, source: "device", metricId: "avg_visits" },
    { id: "ideal", label: "الوصول للوزن المثالي", points: 5, target: 10, source: "device", metricId: "ideal" },
    { id: "maintenance", label: "تثبيت الوزن", points: 5, target: 8, source: "device", metricId: "maintenance" },
    { id: "weekly_60", label: "متوسط النزول الأسبوعي أول 60 يوم", points: 5, target: 1.1, source: "device", metricId: "weekly_60" },
    { id: "high_loss_pct", label: "متوسط نسبة نزول الأوزان المرتفعة", points: 5, target: 5, source: "device", metricId: "high_loss_pct" },
    { id: "slim_loss_pct", label: "متوسط نسبة نزول الأوزان الرشيقة", points: 5, target: 3.5, source: "device", metricId: "slim_loss_pct" },
    { id: "free_count", label: "عدد عملاء الشهر المجاني", points: 5, target: 10, source: "device", metricId: "free_count" },
    { id: "free_loss_pct", label: "نسبة نزول الشهر المجاني", points: 5, target: 4, source: "device", metricId: "free_loss_pct" },
    { id: "scientific", label: "المستوى العلمي", points: 3, target: 100, source: "manual" },
    { id: "admin", label: "التقييم الإداري", points: 3, target: 100, source: "manual" },
    { id: "free_check", label: "الفحص المجاني", points: 3, target: 20, source: "manual" },
    { id: "success_stories", label: "قصص النجاح", points: 3, target: 5, source: "manual" },
    { id: "violations", label: "المخالفات", points: -1, target: 1, source: "penalty" },
    { id: "late", label: "التأخير", points: -1, target: 1, source: "penalty" },
    { id: "permissions", label: "الاستئذان", points: -1, target: 1, source: "penalty" },
    { id: "absence", label: "الغياب", points: -2, target: 1, source: "penalty" }
  ],
  supplement_consultant_two_employees: [
    { id: "sales_target", label: "مستهدف المبيعات المطلوب", points: 35, target: 100, source: "manual" },
    { id: "density", label: "الكثافة اليومية", points: 5, target: 7, source: "device", metricId: "density" },
    { id: "clients", label: "العدد الإجمالي", points: 8, target: 75, source: "device", metricId: "clients" },
    { id: "kg_min", label: "الكيلوجرامات المخفضة", points: 8, target: 120, source: "device", metricId: "kg_min" },
    { id: "avg_visits", label: "متوسط الزيارات", points: 10, target: 6.5, source: "device", metricId: "avg_visits" },
    { id: "weekly_60", label: "متوسط النزول الأسبوعي أول 60 يوم", points: 5, target: 1.1, source: "device", metricId: "weekly_60" },
    { id: "high_loss_pct", label: "متوسط نسبة نزول الأوزان المرتفعة", points: 5, target: 5, source: "device", metricId: "high_loss_pct" },
    { id: "slim_loss_pct", label: "متوسط نسبة نزول الأوزان الرشيقة", points: 5, target: 3.5, source: "device", metricId: "slim_loss_pct" },
    { id: "scientific", label: "المستوى العلمي", points: 3, target: 100, source: "manual" },
    { id: "admin", label: "التقييم الإداري", points: 3, target: 100, source: "manual" },
    { id: "free_check", label: "الفحص المجاني", points: 3, target: 20, source: "manual" },
    { id: "success_stories", label: "قصص النجاح", points: 3, target: 5, source: "manual" },
    { id: "attendance_penalty", label: "الحضور والمخالفات", points: -5, target: 1, source: "penalty" }
  ],
  supplement_consultant_single_employee: [
    { id: "branch_target", label: "مستهدف دخل الفرع", points: 40, target: 100, source: "manual" },
    { id: "density", label: "الكثافة اليومية", points: 5, target: 7, source: "device", metricId: "density" },
    { id: "clients", label: "العدد الإجمالي", points: 8, target: 75, source: "device", metricId: "clients" },
    { id: "kg_min", label: "الكيلوجرامات المخفضة", points: 8, target: 120, source: "device", metricId: "kg_min" },
    { id: "avg_visits", label: "متوسط الزيارات", points: 10, target: 6.5, source: "device", metricId: "avg_visits" },
    { id: "weekly_60", label: "متوسط النزول الأسبوعي أول 60 يوم", points: 5, target: 1.1, source: "device", metricId: "weekly_60" },
    { id: "high_loss_pct", label: "متوسط نسبة نزول الأوزان المرتفعة", points: 5, target: 5, source: "device", metricId: "high_loss_pct" },
    { id: "slim_loss_pct", label: "متوسط نسبة نزول الأوزان الرشيقة", points: 5, target: 3.5, source: "device", metricId: "slim_loss_pct" },
    { id: "scientific", label: "المستوى العلمي", points: 3, target: 100, source: "manual" },
    { id: "admin", label: "التقييم الإداري", points: 3, target: 100, source: "manual" },
    { id: "free_check", label: "الفحص المجاني", points: 3, target: 20, source: "manual" },
    { id: "success_stories", label: "قصص النجاح", points: 3, target: 5, source: "manual" },
    { id: "violations", label: "المخالفات", points: -1, target: 1, source: "penalty" },
    { id: "late", label: "التأخير", points: -1, target: 1, source: "penalty" },
    { id: "permissions", label: "الاستئذان", points: -1, target: 1, source: "penalty" },
    { id: "absence", label: "الغياب", points: -2, target: 1, source: "penalty" }
  ]
};

export const scoreCase = (
  evaluationCase: EvaluationCase | null,
  metrics: CriteriaMetric[],
  manualInputs: ManualInputs
) => {
  if (!evaluationCase) return { rows: [] as ScoreRow[], total: 0, missingCount: 0 };
  const metricMap = new Map(metrics.map((metric) => [metric.id, metric.value]));
  const rows = caseCriteria[evaluationCase].map((criterion) => {
    const achieved = criterion.source === "device" ? metricMap.get(criterion.metricId ?? "") : manualInputs[criterion.id];
    const missing = achieved === undefined || Number.isNaN(achieved);
    const earned = missing
      ? undefined
      : criterion.points < 0
        ? Math.max(criterion.points, -Math.abs(achieved) * Math.abs(criterion.points))
        : Math.min(criterion.points, ((achieved ?? 0) * criterion.points) / Math.max(criterion.target, 0.0001));
    return { ...criterion, achieved, earned: earned === undefined ? undefined : Number(earned.toFixed(2)), missing };
  });
  return {
    rows,
    total: Number(rows.reduce((sum, row) => sum + (row.earned ?? 0), 0).toFixed(2)),
    missingCount: rows.filter((row) => row.missing).length
  };
};
