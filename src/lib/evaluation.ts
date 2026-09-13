import type {
  Branch,
  BranchMetrics,
  ClientProfile,
  CriteriaMetric,
  Employee,
  EmployeeEvaluation,
  EvaluationCycle,
  EvaluationRow,
  EvaluationSettings,
  NormalizedVisit
} from "../types";
import { achievedPoints, calculateBmi, targetBandIndex } from "./normalization";
import type { WeightAttribution } from "./leaveAttribution";

export interface CriteriaMetricOptions {
  attributionRows?: WeightAttribution[];
  employeeName?: string;
}

export const buildClientProfiles = (visits: NormalizedVisit[], settings: EvaluationSettings): ClientProfile[] => {
  const grouped = new Map<string, NormalizedVisit[]>();
  for (const visit of visits) {
    if (!grouped.has(visit.normalizedClientId)) grouped.set(visit.normalizedClientId, []);
    grouped.get(visit.normalizedClientId)!.push(visit);
  }

  return [...grouped.entries()].map(([id, clientVisits]) => {
    const ordered = [...clientVisits].sort((a, b) => `${a.visitDate}T${a.visitTime || ""}`.localeCompare(`${b.visitDate}T${b.visitTime || ""}`));
    const firstWithName = ordered.find((visit) => visit.clientName)?.clientName ?? "عميل بدون اسم";
    const firstWithHeight = ordered.find((visit) => visit.height)?.height;
    const goal = ordered.find((visit) => visit.customerGoal)?.customerGoal ?? "loss";
    const validVisits = ordered.filter((visit) => visit.validVisit);
    const weights = validVisits.map((visit) => visit.weight).filter((weight): weight is number => typeof weight === "number");
    const firstWeight = weights[0];
    const lastWeight = weights.at(-1);
    const minWeight = weights.length ? Math.min(...weights) : undefined;
    const progress = firstWeight && lastWeight ? (goal === "gain" ? lastWeight - firstWeight : firstWeight - lastWeight) : 0;
    const bmi = calculateBmi(lastWeight, firstWithHeight);
    const freeMonthClient = ordered.some((visit) => visit.freeMonthClient);
    const excluded = ordered.every((visit) => visit.excluded);

    return {
      id,
      name: firstWithName,
      height: firstWithHeight,
      goal,
      visits: ordered,
      validVisits,
      firstWeight,
      lastWeight,
      minWeight,
      progress: Number(progress.toFixed(2)),
      bmi,
      reviewer: validVisits.length >= 2,
      freeMonthClient,
      freeMonthEligible: freeMonthClient && validVisits.length >= settings.freeMonthRequiredVisits,
      idealWeight: goal === "loss" && progress >= settings.idealLossKg && Boolean(bmi && bmi <= settings.idealBmiMax),
      maintenance: validVisits.length >= settings.maintenanceVisits && Boolean(bmi && bmi <= settings.maintenanceBmiMax),
      excluded
    };
  });
};

export const cwf = (height?: number, bufferPct = 10): number | undefined => {
  if (!height) return undefined;
  const base = height - 100;
  return Number((base + base * (bufferPct / 100)).toFixed(2));
};

export const averageLossPercent = (profiles: ClientProfile[]): number => {
  const eligible = profiles.filter((profile) => profile.goal === "loss" && profile.firstWeight && profile.minWeight && !profile.freeMonthClient && !profile.excluded);
  const firstTotal = eligible.reduce((sum, profile) => sum + (profile.firstWeight ?? 0), 0);
  const minTotal = eligible.reduce((sum, profile) => sum + (profile.minWeight ?? 0), 0);
  if (!firstTotal) return 0;
  return Number((((firstTotal - minTotal) / firstTotal) * 100).toFixed(2));
};

const metricRound = (value: number, digits = 4): number => Number(value.toFixed(digits));

const lossPercent = (profiles: ClientProfile[]): number => {
  const eligible = profiles.filter((profile) => profile.firstWeight && profile.minWeight);
  const firstTotal = eligible.reduce((sum, profile) => sum + (profile.firstWeight ?? 0), 0);
  const minTotal = eligible.reduce((sum, profile) => sum + (profile.minWeight ?? 0), 0);
  return firstTotal ? ((firstTotal - minTotal) / firstTotal) * 100 : 0;
};

const weeklyLossFirst60 = (profile: ClientProfile): number => {
  const valid = profile.validVisits.filter((visit) => visit.weight).sort((a, b) => a.visitDate.localeCompare(b.visitDate));
  if (valid.length < 2 || !valid[0].weight) return 0;
  const firstDate = new Date(valid[0].visitDate);
  const windowEnd = new Date(firstDate);
  windowEnd.setDate(windowEnd.getDate() + 60);
  const inWindow = valid.filter((visit) => new Date(visit.visitDate) <= windowEnd);
  if (inWindow.length < 2) return 0;
  const lowest = inWindow.reduce((best, visit) => (visit.weight! < best.weight! ? visit : best), inWindow[0]);
  const days = Math.max(1, Math.round((new Date(lowest.visitDate).getTime() - firstDate.getTime()) / 86400000));
  return ((valid[0].weight - lowest.weight!) / days) * 7;
};

const sameEmployee = (left?: string, right?: string) => Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase());

const attributedRowsForEmployee = (rows: WeightAttribution[] | undefined, employeeName?: string) =>
  employeeName ? (rows ?? []).filter((row) => sameEmployee(row.weightSpecialist, employeeName) && row.status !== "manual_review") : [];

const attributedLossKg = (profiles: ClientProfile[], rows: WeightAttribution[] | undefined, employeeName?: string): number => {
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  return attributedRowsForEmployee(rows, employeeName).reduce((sum, row) => {
    const profile = profileMap.get(row.clientId);
    if (!profile || profile.goal !== "loss" || profile.manualExcluded || row.changeKg === undefined) return sum;
    return sum + Math.max(0, row.changeKg);
  }, 0);
};

const attributedLossPercent = (profiles: ClientProfile[], rows: WeightAttribution[] | undefined, employeeName: string | undefined, sourceProfiles: ClientProfile[]): number => {
  if (!employeeName) return lossPercent(sourceProfiles);
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const relevant = attributedRowsForEmployee(rows, employeeName).filter((row) => {
    const profile = profileMap.get(row.clientId);
    return profile && sourceProfiles.some((item) => item.id === row.clientId) && profile.goal === "loss" && !profile.manualExcluded && row.changeKg !== undefined && row.previousWeight;
  });
  const denominator = relevant.reduce((sum, row) => sum + (row.previousWeight ?? 0), 0);
  const numerator = relevant.reduce((sum, row) => sum + Math.max(0, row.changeKg ?? 0), 0);
  return denominator ? (numerator / denominator) * 100 : 0;
};

const attributedWeeklyLoss = (profiles: ClientProfile[], rows: WeightAttribution[] | undefined, employeeName?: string): number[] => {
  if (!employeeName) return profiles.map(weeklyLossFirst60).filter((value) => value > 0);
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  return attributedRowsForEmployee(rows, employeeName)
    .map((row) => {
      const profile = profileMap.get(row.clientId);
      if (!profile || profile.goal !== "loss" || profile.manualExcluded || row.changeKg === undefined || !row.daysSincePrevious) return 0;
      return (Math.max(0, row.changeKg) / row.daysSincePrevious) * 7;
    })
    .filter((value) => value > 0);
};

export const computeCriteriaMetrics = (profiles: ClientProfile[], settings: EvaluationSettings, workingDays = 122, newSubscriptionsOverride?: number, options: CriteriaMetricOptions = {}): CriteriaMetric[] => {
  const ownedWeightClientIds = new Set(attributedRowsForEmployee(options.attributionRows, options.employeeName).map((row) => row.clientId));
  const densityMain = profiles.filter((profile) => !profile.excluded && !profile.freeMonthClient && (options.employeeName ? profile.validVisits.length > 0 || ownedWeightClientIds.has(profile.id) : profile.validVisits.length >= 2));
  const main = densityMain.filter((profile) => !profile.manualExcluded);
  const freeMonth = profiles.filter((profile) => !profile.excluded && profile.freeMonthClient);
  const highWeight = main.filter((profile) => profile.firstWeight && profile.height && profile.firstWeight > (cwf(profile.height, settings.highWeightCwfBufferPct) ?? Number.POSITIVE_INFINITY));
  const slimWeight = main.filter((profile) => !highWeight.includes(profile));
  const totalValidVisits = main.reduce((sum, profile) => sum + profile.validVisits.length, 0);
  const newSubscriptions = newSubscriptionsOverride ?? densityMain.length;
  const densitySource = main;
  const densityNumerator =
    settings.densityFormula === "subscriptionsAndReviewerVisits"
      ? newSubscriptions * 3 + densitySource.reduce((sum, profile) => sum + profile.validVisits.length, 0)
      : main.length + freeMonth.length + newSubscriptions * 3;
  const attributedKg = attributedLossKg(main, options.attributionRows, options.employeeName);
  const kgToLast = options.employeeName ? attributedKg : main.reduce((sum, profile) => sum + Math.max(0, profile.goal === "loss" ? profile.progress : 0), 0);
  const kgToMinimum = options.employeeName ? attributedKg : main.reduce((sum, profile) => sum + Math.max(0, (profile.firstWeight ?? 0) - (profile.minWeight ?? profile.firstWeight ?? 0)), 0);
  const ideal = main.filter((profile) => profile.idealWeight);
  const maintenance = main.filter((profile) => profile.maintenance);
  const weeklyProfiles = main.filter((profile) => highWeight.includes(profile) || profile.manualSlimIncluded);
  const weeklyValues = attributedWeeklyLoss(weeklyProfiles, options.attributionRows, options.employeeName);

  return [
    { id: "density", label: "الكثافة اليومية", value: metricRound(densityNumerator / Math.max(1, workingDays)), format: "decimal" },
    { id: "free_count", label: "عدد عملاء الشهر المجاني", value: freeMonth.length },
    { id: "free_loss_pct", label: "متوسط نسبة نزول عملاء الشهر المجاني", value: metricRound(lossPercent(freeMonth)), format: "percent" },
    { id: "clients", label: "العدد الإجمالي", value: main.length },
    { id: "kg_last", label: "عدد الكيلوجرامات المخفضة", value: metricRound(kgToLast, 1), format: "kg" },
    { id: "kg_min", label: "عدد الكيلوجرامات المخفضة حسب أقل وزن", value: metricRound(kgToMinimum, 1), format: "kg" },
    { id: "weekly_60", label: "متوسط النزول الأسبوعي أول 60 يوم", value: metricRound(weeklyValues.reduce((sum, item) => sum + item, 0) / Math.max(1, weeklyValues.length)), format: "decimal" },
    { id: "reviewers", label: "عدد مراجعين الفرع أمامه", value: main.length },
    { id: "avg_visits", label: "متوسط الزيارات", value: metricRound(totalValidVisits / Math.max(1, main.length)), format: "decimal" },
    { id: "ideal", label: "الوزن المثالي", value: ideal.length },
    { id: "maintenance", label: "تثبيت الوزن", value: maintenance.length },
    { id: "ideal_pct", label: "نسبة الوزن المثالي من العدد", value: metricRound((ideal.length / Math.max(1, main.length)) * 100), format: "percent" },
    { id: "maintenance_pct", label: "نسبة تثبيت الوزن من العدد", value: metricRound((maintenance.length / Math.max(1, main.length)) * 100), format: "percent" },
    { id: "high_loss_pct", label: "متوسط نسبة نزول الأوزان المرتفعة", value: metricRound(attributedLossPercent(main, options.attributionRows, options.employeeName, highWeight)), format: "percent" },
    { id: "high_count", label: "عددهم", value: highWeight.length },
    { id: "slim_loss_pct", label: "متوسط نسبة نزول الأوزان الرشيقة", value: metricRound(attributedLossPercent(main, options.attributionRows, options.employeeName, slimWeight)), format: "percent" },
    { id: "slim_count", label: "عددهم", value: slimWeight.length }
  ];
};

export const computeBranchMetrics = (
  branches: Branch[],
  profiles: ClientProfile[],
  visits: NormalizedVisit[],
  cycle: EvaluationCycle,
  settings: EvaluationSettings
): BranchMetrics[] => {
  return branches.map((branch) => {
    const branchVisits = visits.filter((visit) => visit.branch === branch.name && !visit.excluded);
    const densityProfiles = profiles.filter((profile) => profile.visits.some((visit) => visit.branch === branch.name) && !profile.excluded && !profile.freeMonthClient && profile.validVisits.length >= 2);
    const branchProfiles = densityProfiles.filter((profile) => !profile.manualExcluded);
    const freeMonthClients = profiles.filter((profile) => profile.visits.some((visit) => visit.branch === branch.name) && profile.freeMonthClient && !profile.excluded).length;
    const reviewerProfiles = densityProfiles.filter((profile) => profile.reviewer);
    const reviewerVisits = branchVisits.filter((visit) => visit.validVisit && !visit.freeMonthClient).length;
    const newSubscriptions = densityProfiles.length;
    const densityNumerator =
      settings.densityFormula === "subscriptionsAndReviewerVisits"
        ? newSubscriptions * 3 + reviewerVisits
        : reviewerProfiles.length + freeMonthClients + newSubscriptions * 3;
    const density = Number((densityNumerator / Math.max(1, cycle.workingDays)).toFixed(2));
    const targetRevenue = branch.targetRevenue;
    const achievedRevenue = Math.round(branchVisits.length * 1850 + branchProfiles.reduce((sum, profile) => sum + Math.max(profile.progress, 0) * 120, 0));

    return {
      branchId: branch.id,
      branchName: branch.name,
      density,
      densityClass: branch.densityOverride ?? (density >= settings.densityThreshold ? "high" : "low"),
      clients: branchProfiles.length,
      reviewers: reviewerProfiles.length,
      validVisits: branchVisits.filter((visit) => visit.validVisit).length,
      freeMonthClients,
      idealWeight: branchProfiles.filter((profile) => profile.idealWeight).length,
      maintenance: branchProfiles.filter((profile) => profile.maintenance).length,
      totalLossKg: Number(branchProfiles.reduce((sum, profile) => sum + Math.max(0, profile.goal === "loss" ? profile.progress : 0), 0).toFixed(2)),
      averageVisits: Number((branchProfiles.reduce((sum, profile) => sum + profile.validVisits.length, 0) / Math.max(1, branchProfiles.length)).toFixed(2)),
      targetRevenue,
      achievedRevenue,
      targetAchievement: targetRevenue > 0 ? Number(((achievedRevenue / targetRevenue) * 100).toFixed(2)) : 0
    };
  });
};

export const targetAdjustment = (score: number, currentTarget: number, settings: EvaluationSettings): number => {
  const band = targetBandIndex(currentTarget);
  const table = score >= 100 ? settings.targetAdjustment.increase : settings.targetAdjustment.decrease;
  const row = table.find((item) => score >= item.min && (item.max === undefined || score <= item.max));
  return row ? row.values[band] : 0;
};

const evaluationPath = (role: Employee["role"], density: BranchMetrics["densityClass"]): string => {
  if (density === "high" && role === "supplement_specialist") return "فرع مرتفع الكثافة - أخصائي مكملات";
  if (density === "high" && role === "nutrition_specialist") return "فرع مرتفع الكثافة - أخصائي تغذية";
  if (density === "low" && role === "supplement_specialist") return "فرع منخفض الكثافة - أخصائي مكملات";
  if (density === "low" && role === "supplement_consultant") return "فرع منخفض الكثافة - استشاري مكملات";
  return "مسار إداري خاص";
};

export const evaluateEmployees = (
  employees: Employee[],
  branches: Branch[],
  metrics: BranchMetrics[],
  profiles: ClientProfile[],
  settings: EvaluationSettings
): EmployeeEvaluation[] => {
  const evaluations = employees.map((employee) => {
    const branch = branches.find((item) => item.id === employee.branchId)!;
    const branchMetric = metrics.find((item) => item.branchId === employee.branchId)!;
    const employeeProfiles = profiles.filter((profile) => profile.visits.some((visit) => visit.specialist === employee.name) && !profile.excluded);
    const roleCriteria = settings.criteria.filter((criterion) => criterion.appliesTo.includes(employee.role));
    const achievedById: Record<string, number> = {
      density: branchMetric.density,
      clients: employeeProfiles.filter((profile) => !profile.freeMonthClient).length,
      lossKg: employeeProfiles.reduce((sum, profile) => sum + Math.max(0, profile.goal === "loss" ? profile.progress : 0), 0),
      avgVisits: employeeProfiles.reduce((sum, profile) => sum + profile.validVisits.length, 0) / Math.max(1, employeeProfiles.length),
      idealWeight: employeeProfiles.filter((profile) => profile.idealWeight).length,
      maintenance: employeeProfiles.filter((profile) => profile.maintenance).length,
      freeMonth: employeeProfiles.filter((profile) => profile.freeMonthEligible).length,
      scientific: employee.scientificScore ?? 0,
      admin: employee.adminScore ?? 0,
      freeCheck: employeeProfiles.filter((profile) => profile.visits.some((visit) => /free|مجاني/i.test(visit.visitType ?? ""))).length,
      successStories: employeeProfiles.filter((profile) => profile.progress >= 8).length
    };

    const rows: EvaluationRow[] = roleCriteria.map((criterion) => ({
      label: criterion.label,
      achieved: Number((achievedById[criterion.id] ?? 0).toFixed(2)),
      target: criterion.target,
      points: criterion.points,
      earned: achievedPoints(achievedById[criterion.id] ?? 0, criterion.target, criterion.points),
      source: criterion.id === "admin" || criterion.id === "scientific" ? "إدخال إداري" : "بيانات الزيارات المستوردة"
    }));

    const supplementTargetRow =
      employee.role === "supplement_specialist" || employee.role === "supplement_consultant"
        ? {
            label: employee.role === "supplement_specialist" && branchMetric.densityClass === "low" ? "مستهدف دخل الفرع" : "مستهدف المبيعات المطلوب",
            achieved: branchMetric.targetAchievement,
            target: 100,
            points: branchMetric.densityClass === "low" && employee.role === "supplement_specialist" ? 70 : 35,
            earned: achievedPoints(branchMetric.targetAchievement, 100, branchMetric.densityClass === "low" && employee.role === "supplement_specialist" ? 70 : 35),
            source: "دخل الفرع خلال فترة دوام الموظف"
          }
        : undefined;

    const allRows = supplementTargetRow ? [supplementTargetRow, ...rows] : rows;
    const score = Number(allRows.reduce((sum, row) => sum + row.earned, 0).toFixed(2));
    const delta = targetAdjustment(score, employee.currentTarget, settings);
    const incentive = branchMetric.densityClass === "high" && employee.role === "supplement_specialist" ? 0.5 * Math.min(1, branchMetric.targetAchievement / 171) : undefined;

    return {
      employee,
      branch,
      path: evaluationPath(employee.role, branchMetric.densityClass),
      score: Number((score + (incentive ?? 0)).toFixed(2)),
      achievementPct: branchMetric.targetAchievement,
      targetDelta: delta + (incentive ?? 0),
      newTarget: Number(Math.max(0, employee.currentTarget + delta + (incentive ?? 0)).toFixed(2)),
      rows: allRows,
      incentive: incentive ? Number(incentive.toFixed(2)) : undefined
    };
  });

  const highSupplement = evaluations
    .filter((evaluation) => evaluation.branch && metrics.find((metric) => metric.branchId === evaluation.branch.id)?.densityClass === "high" && evaluation.employee.role === "supplement_specialist")
    .sort((a, b) => b.score - a.score);
  const cutoff = Math.ceil(highSupplement.length * 0.4);
  const eligible = new Set(highSupplement.slice(0, cutoff).map((evaluation) => evaluation.employee.id));

  return evaluations.map((evaluation) => {
    if (evaluation.incentive && !eligible.has(evaluation.employee.id)) {
      return {
        ...evaluation,
        score: Number((evaluation.score - evaluation.incentive).toFixed(2)),
        targetDelta: Number((evaluation.targetDelta - evaluation.incentive).toFixed(2)),
        newTarget: Number((evaluation.newTarget - evaluation.incentive).toFixed(2)),
        incentive: 0
      };
    }
    return evaluation;
  });
};

export const importReport = (visits: NormalizedVisit[]) => ({
  newRows: visits.filter((visit) => visit.validVisit).length,
  duplicateRows: visits.filter((visit) => visit.duplicateSameDay).length,
  excludedRows: visits.filter((visit) => visit.excluded).length,
  invalidRows: visits.filter((visit) => visit.invalidReason && !visit.excluded).map((visit) => ({ rowNumber: visit.rowNumber, reason: visit.invalidReason! }))
});
