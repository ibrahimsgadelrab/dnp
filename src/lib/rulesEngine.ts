import type { ClientProfile, CriteriaMetric, EvaluationCase } from "../types";
import type { WeightAttribution } from "./leaveAttribution";
import { caseCriteria, type ManualInputs, type ScoreRow } from "./caseEvaluation";

export type AuditRow = {
  criterion: string;
  formula: string;
  included: string;
  excluded: string;
  achieved: string;
  target: string;
  points: string;
  earned: string;
  impact: string;
};

export type DecisionAuditRow = {
  type: string;
  client: string;
  id: string;
  decision: string;
  reason: string;
  impact: string;
};

export const criterionExplanations: Record<string, string> = {
  density: "الكثافة = الاشتراكات الجديدة المختارة × 3 + زيارات العملاء المحسوبين، ثم القسمة على عدد أيام التقييم.",
  free_count: "عدد العملاء المميزين كشهر مجاني من الملف أو بادئة الشهر المجاني.",
  free_loss_pct: "نسبة نزول عملاء الشهر المجاني = إجمالي فرق أول وزن إلى أقل وزن ÷ إجمالي أول وزن × 100.",
  clients: "عدد العملاء المحسوبين بعد استبعاد المستبعدين وعملاء الشهر المجاني والاستثناءات اليدوية.",
  kg_last: "إجمالي النزول الإيجابي للعملاء المحسوبين من أول وزن إلى آخر وزن، أو حسب سياسة الإجازة عند اختيار موظف.",
  kg_min: "إجمالي النزول الإيجابي للعملاء المحسوبين من أول وزن إلى أقل وزن، أو حسب سياسة الإجازة عند اختيار موظف.",
  weekly_60: "متوسط النزول الأسبوعي = نزول العميل خلال أول 60 يوم ÷ عدد الأيام × 7، مع إدخال الأوزان الرشيقة المختارة.",
  reviewers: "عدد العملاء المحسوبين الذين يدخلون في قاعدة المراجعين.",
  avg_visits: "متوسط الزيارات = عدد الزيارات الصحيحة للموظف محل التقييم ÷ عدد العملاء المحسوبين.",
  ideal: "عدد العملاء الذين حققوا حد النزول ووصل BMI لديهم لحد الوزن المثالي.",
  maintenance: "عدد العملاء الذين حققوا عدد زيارات التثبيت وحد BMI الخاص بالتثبيت.",
  ideal_pct: "نسبة الوزن المثالي = عدد عملاء الوزن المثالي ÷ عدد العملاء المحسوبين × 100.",
  maintenance_pct: "نسبة تثبيت الوزن = عدد عملاء التثبيت ÷ عدد العملاء المحسوبين × 100.",
  high_loss_pct: "نسبة نزول الأوزان المرتفعة حسب CWF وفرق الوزن المسند للموظف.",
  high_count: "عدد العملاء ذوي الوزن المرتفع حسب CWF.",
  slim_loss_pct: "نسبة نزول الأوزان الرشيقة بعد اختيار العملاء الرشيقين المراد إدخالهم في الحساب.",
  slim_count: "عدد العملاء غير المصنفين كأوزان مرتفعة.",
  sales_target: "قيمة تحقيق مستهدف المبيعات المدخلة يدويًا.",
  branch_target: "قيمة تحقيق مستهدف دخل الفرع المدخلة يدويًا.",
  scientific: "درجة التقييم العلمي المدخلة يدويًا.",
  admin: "درجة التقييم الإداري المدخلة يدويًا.",
  free_check: "عدد أو درجة الفحوص المجانية المدخلة يدويًا.",
  success_stories: "عدد قصص النجاح المدخلة يدويًا.",
  violations: "عدد المخالفات المدخل يدويًا ويخصم من الدرجة.",
  late: "عدد مرات التأخير المدخل يدويًا ويخصم من الدرجة.",
  permissions: "عدد مرات الاستئذان المدخل يدويًا ويخصم من الدرجة.",
  absence: "عدد الغياب المدخل يدويًا ويخصم من الدرجة.",
  attendance_penalty: "قيمة جزاء الحضور والمخالفات المدخلة يدويًا."
};

const listClients = (profiles: ClientProfile[], limit = 40) => {
  if (!profiles.length) return "-";
  const names = profiles.slice(0, limit).map((profile) => `${profile.name} (${profile.id})`);
  return profiles.length > limit ? `${names.join("، ")}، +${profiles.length - limit} آخرين` : names.join("، ");
};

const matchingProfiles = (metricId: string | undefined, profiles: ClientProfile[]) => {
  const main = profiles.filter((profile) => !profile.excluded && !profile.freeMonthClient && !profile.manualExcluded);
  if (!metricId) return main;
  if (metricId.startsWith("free_")) return profiles.filter((profile) => !profile.excluded && profile.freeMonthClient);
  if (metricId === "ideal" || metricId === "ideal_pct") return main.filter((profile) => profile.idealWeight);
  if (metricId === "maintenance" || metricId === "maintenance_pct") return main.filter((profile) => profile.maintenance);
  if (metricId === "weekly_60") return main.filter((profile) => profile.manualSlimIncluded || profile.validVisits.length >= 2);
  return main;
};

export const buildScoreAuditRows = (
  evaluationCase: EvaluationCase | null,
  scoreRows: ScoreRow[],
  metrics: CriteriaMetric[],
  profiles: ClientProfile[],
  attributionRows: WeightAttribution[],
  employeeName: string,
  manualInputs: ManualInputs
): AuditRow[] => {
  const criteria = evaluationCase ? caseCriteria[evaluationCase] : [];
  const metricMap = new Map(metrics.map((metric) => [metric.id, metric]));
  const excluded = profiles.filter((profile) => profile.excluded || profile.freeMonthClient || profile.manualExcluded);
  const manualReviewCount = attributionRows.filter((row) => row.status === "manual_review").length;

  return scoreRows.map((row) => {
    const criterion = criteria.find((item) => item.id === row.id);
    const metric = metricMap.get(criterion?.metricId ?? "");
    const includedProfiles = matchingProfiles(criterion?.metricId, profiles);
    const achieved = row.missing ? "مطلوب إدخال" : String(row.achieved);
    const earned = row.missing ? "-" : String(row.earned);
    const impact = row.missing
      ? "لا يدخل في الإجمالي حتى يتم إدخاله."
      : row.points < 0
        ? `خصم ${Math.abs(Number(row.earned ?? 0))} درجة من الإجمالي.`
        : `أضاف ${earned} من أصل ${row.points} درجة.`;
    return {
      criterion: row.label,
      formula: criterionExplanations[row.id] ?? criterionExplanations[criterion?.metricId ?? ""] ?? "قيمة مباشرة حسب المانيوال.",
      included: row.source === "device" ? listClients(includedProfiles) : `إدخال يدوي: ${manualInputs[row.id] ?? "غير مدخل"}`,
      excluded: row.source === "device" ? listClients(excluded) : "-",
      achieved: metric ? String(metric.value) : achieved,
      target: String(row.target),
      points: String(row.points),
      earned,
      impact: `${impact}${employeeName ? ` الموظف محل التقييم: ${employeeName}.` : ""}${manualReviewCount ? ` توجد ${manualReviewCount} حالة إسناد وزن تحتاج مراجعة يدوية.` : ""}`
    };
  });
};

export const buildDecisionAuditRows = (
  profiles: ClientProfile[],
  selectedExceptionIds: string[],
  selectedSlimIds: string[],
  selectedNewSubscriptionIds: string[],
  eligibleNewSubscriptionIds: string[]
): DecisionAuditRow[] => {
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const rows: DecisionAuditRow[] = [];

  for (const id of selectedExceptionIds) {
    const profile = byId.get(id);
    rows.push({
      type: "استثناء عميل",
      client: profile?.name ?? "-",
      id,
      decision: "مستثنى من حساب المعايير",
      reason: "اختيار يدوي من تبويب الاستثناءات وفق النسبة المسموحة.",
      impact: "يخرج من العدد والكثافة ومؤشرات النزول."
    });
  }

  for (const id of selectedSlimIds) {
    const profile = byId.get(id);
    rows.push({
      type: "وزن رشيق",
      client: profile?.name ?? "-",
      id,
      decision: "مضاف لمتوسط النزول الأسبوعي",
      reason: "اختيار يدوي لإدخال عميل وزن رشيق في معيار النزول الأسبوعي.",
      impact: "لا يُستثنى العميل، لكن يدخل في معيار النزول الأسبوعي."
    });
  }

  for (const id of eligibleNewSubscriptionIds) {
    const profile = byId.get(id);
    const selected = selectedNewSubscriptionIds.includes(id);
    rows.push({
      type: "اشتراك جديد",
      client: profile?.name ?? "-",
      id,
      decision: selected ? "محسوب كاشتراك جديد" : "غير محسوب كاشتراك جديد",
      reason: selected ? "مرشح تلقائيًا ومؤكد بالاختيار." : "مرشح تلقائيًا لكن تم إلغاء اختياره، غالبًا عميل منقول أو قرار مراجعة.",
      impact: selected ? "يدخل في الكثافة بقيمة 3 زيارات." : "لا يضيف وزن الاشتراك الجديد للكثافة."
    });
  }

  return rows;
};
