import React from "react";
import ReactDOM from "react-dom/client";
import { ArrowDownUp, Download, FileSpreadsheet, Filter, LayoutDashboard, Search, Settings, Shield, UploadCloud, Users } from "lucide-react";
import { saveAs } from "file-saver";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import "./styles.css";
import { defaultSettings } from "./lib/settings";
import { guessMapping, parseFile, rowsToVisits } from "./lib/importer";
import { importReport, buildClientProfiles, computeBranchMetrics, evaluateEmployees, averageLossPercent, computeCriteriaMetrics, cwf } from "./lib/evaluation";
import { normalizeVisits } from "./lib/normalization";
import { buildWeightAttributions, type WeightAttribution } from "./lib/leaveAttribution";
import { buildDecisionAuditRows, buildScoreAuditRows, criterionExplanations, type AuditRow, type DecisionAuditRow } from "./lib/rulesEngine";
import { storageMode } from "./lib/storage";
import { caseCriteria, caseTitles, scoreCase, type ManualInputs } from "./lib/caseEvaluation";
import type { Branch, ColumnMapping, Employee, EvaluationCase, NormalizedVisit, RawVisit } from "./types";

const tabs = [
  { id: "dashboard", label: "لوحة الفرع", icon: LayoutDashboard },
  { id: "import", label: "الاستيراد", icon: UploadCloud },
  { id: "branches", label: "نتيجة الفرع", icon: FileSpreadsheet },
  { id: "employees", label: "نتيجة الموظف", icon: Users },
  { id: "clients", label: "العملاء", icon: Search },
  { id: "exceptions", label: "الاستثناءات المقترحة", icon: Shield },
  { id: "criteria-guide", label: "شرح المعايير", icon: FileSpreadsheet },
  { id: "settings", label: "الإعدادات", icon: Settings }
] as const;

type TabId = (typeof tabs)[number]["id"];

type ClientFilter = "all" | "free_month" | "maintenance" | "ideal" | "reviewer" | "excluded" | "one_visit" | "high_weight" | "slim_weight";
type ExceptionCandidate = { profile: ReturnType<typeof buildClientProfiles>[number]; reason: string; impact: string; priority: number };
type NewSubscriptionCandidate = { profile: ReturnType<typeof buildClientProfiles>[number]; eligible: boolean; lastVisitBeforePeriod?: string; reason: string };

const clientFilterLabels: Record<ClientFilter, string> = {
  all: "كل العملاء",
  free_month: "الشهر المجاني",
  maintenance: "تثبيت الوزن",
  ideal: "الوزن المثالي",
  reviewer: "مراجعون",
  excluded: "مستبعدون",
  one_visit: "زيارة واحدة",
  high_weight: "أوزان مرتفعة",
  slim_weight: "أوزان رشيقة"
};

const defaultCycle = { id: "current-single-branch-cycle", name: "الدورة الحالية" };

const calculatePeriodDays = (startsAt: string, endsAt: string) => {
  if (!startsAt || !endsAt) return 122;
  const start = new Date(`${startsAt}T00:00:00`).getTime();
  const end = new Date(`${endsAt}T00:00:00`).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.floor((end - start) / 86400000) + 1 : 122;
};

const getNewSubscriptionCandidates = (profiles: ReturnType<typeof buildClientProfiles>, allVisits: NormalizedVisit[], startsAt: string, endsAt: string): NewSubscriptionCandidate[] => {
  if (!startsAt || !endsAt) return [];
  const cutoff = new Date(`${startsAt}T00:00:00`);
  cutoff.setDate(cutoff.getDate() - 45);
  return profiles.filter((profile) => !profile.excluded && !profile.freeMonthClient && profile.validVisits.length > 0).map((profile) => {
    const firstPeriodVisit = profile.validVisits[0]?.visitDate;
    const priorDates = allVisits.filter((visit) => visit.normalizedClientId === profile.id && visit.visitDate < startsAt).map((visit) => visit.visitDate).sort();
    const lastVisitBeforePeriod = priorDates.at(-1);
    const eligible = Boolean(firstPeriodVisit && (!lastVisitBeforePeriod || new Date(`${lastVisitBeforePeriod}T00:00:00`) < cutoff));
    return {
      profile,
      eligible,
      lastVisitBeforePeriod,
      reason: eligible ? "لا توجد زيارة خلال الـ45 يومًا السابقة لبداية الفترة." : `آخر زيارة قبل الفترة: ${lastVisitBeforePeriod ?? "غير معروف"}، لذلك يحتاج مراجعة.`
    };
  }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.profile.name.localeCompare(b.profile.name, "ar"));
};

const getPeriodProfiles = (visits: NormalizedVisit[], settings: typeof defaultSettings, startsAt: string, endsAt: string) =>
  buildClientProfiles(visits.filter((visit) => (!startsAt || visit.visitDate >= startsAt) && (!endsAt || visit.visitDate <= endsAt)), settings);

const App = () => {
  const [activeTab, setActiveTab] = React.useState<TabId>("dashboard");
  const [settings, setSettings] = React.useState(defaultSettings);
  const [evaluationCase, setEvaluationCase] = React.useState<EvaluationCase | null>(null);
  const [rawVisits, setRawVisits] = React.useState<RawVisit[]>([]);
  const [pendingRows, setPendingRows] = React.useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [mapping, setMapping] = React.useState<ColumnMapping>({});
  const [pendingFileName, setPendingFileName] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [clientFilter, setClientFilter] = React.useState<ClientFilter>("all");
  const [manualExceptions, setManualExceptions] = React.useState<string[]>([]);
  const [slimWeightIds, setSlimWeightIds] = React.useState<string[]>([]);
  const [evaluationStart, setEvaluationStart] = React.useState("");
  const [evaluationEnd, setEvaluationEnd] = React.useState("");
  const [newSubscriptionIds, setNewSubscriptionIds] = React.useState<string[]>([]);
  const [manualInputs, setManualInputs] = React.useState<ManualInputs>({});
  const [selectedEmployeeName, setSelectedEmployeeName] = React.useState("");

  const normalized = React.useMemo(() => normalizeVisits(rawVisits, settings), [rawVisits, settings]);
  const weightAttributions = React.useMemo(() => buildWeightAttributions(normalized).filter((row) => (!evaluationStart || row.visitDate >= evaluationStart) && (!evaluationEnd || row.visitDate <= evaluationEnd)), [normalized, evaluationStart, evaluationEnd]);
  const periodDays = React.useMemo(() => calculatePeriodDays(evaluationStart, evaluationEnd), [evaluationStart, evaluationEnd]);
  const periodNormalized = React.useMemo(() => normalized.filter((visit) => (!evaluationStart || visit.visitDate >= evaluationStart) && (!evaluationEnd || visit.visitDate <= evaluationEnd)), [normalized, evaluationStart, evaluationEnd]);
  const profiles = React.useMemo(() => buildClientProfiles(periodNormalized, settings), [periodNormalized, settings]);
  const employeeOptions = React.useMemo(() => uniqueSpecialists(periodNormalized), [periodNormalized]);
  const effectiveEmployeeName = employeeOptions.includes(selectedEmployeeName) ? selectedEmployeeName : employeeOptions[0] || "";
  const scopedProfiles = React.useMemo(() => scopeProfilesForEmployee(profiles, effectiveEmployeeName, weightAttributions), [profiles, effectiveEmployeeName, weightAttributions]);
  const newSubscriptionCandidates = React.useMemo(() => getNewSubscriptionCandidates(profiles, normalized, evaluationStart, evaluationEnd), [profiles, normalized, evaluationStart, evaluationEnd]);
  const selectedNewSubscriptionIds = React.useMemo(() => newSubscriptionIds.filter((id) => {
    if (!effectiveEmployeeName) return true;
    const profile = profiles.find((item) => item.id === id);
    return sameSpecialist(profile?.validVisits[0]?.specialist, effectiveEmployeeName);
  }), [newSubscriptionIds, profiles, effectiveEmployeeName]);
  const newSubscriptions = selectedNewSubscriptionIds.length;
  const evaluationProfiles = React.useMemo(() => scopedProfiles.map((profile) => ({ ...profile, manualExcluded: manualExceptions.includes(profile.id), manualSlimIncluded: slimWeightIds.includes(profile.id) })), [scopedProfiles, manualExceptions, slimWeightIds]);
  const workingCycle = React.useMemo(() => ({ ...defaultCycle, startsAt: evaluationStart, endsAt: evaluationEnd, workingDays: periodDays }), [evaluationStart, evaluationEnd, periodDays]);
  const activeBranch = React.useMemo(() => buildSingleBranch(rawVisits, evaluationCase), [rawVisits, evaluationCase]);
  const activeEmployee = React.useMemo(() => buildSingleEmployee(rawVisits, activeBranch, evaluationCase, effectiveEmployeeName), [rawVisits, activeBranch, evaluationCase, effectiveEmployeeName]);
  const activeBranches = React.useMemo(() => (activeBranch ? [activeBranch] : []), [activeBranch]);
  const activeEmployees = React.useMemo(() => (activeEmployee ? [activeEmployee] : []), [activeEmployee]);
  const branchMetrics = React.useMemo(() => computeBranchMetrics(activeBranches, evaluationProfiles, periodNormalized, workingCycle, settings), [activeBranches, evaluationProfiles, periodNormalized, workingCycle, settings]);
  const employeeEvaluations = React.useMemo(() => evaluateEmployees(activeEmployees, activeBranches, branchMetrics, evaluationProfiles, settings), [activeEmployees, activeBranches, branchMetrics, evaluationProfiles, settings]);
  const criteriaMetrics = React.useMemo(() => computeCriteriaMetrics(evaluationProfiles, settings, periodDays, newSubscriptions, { attributionRows: weightAttributions, employeeName: effectiveEmployeeName }), [evaluationProfiles, settings, periodDays, newSubscriptions, weightAttributions, effectiveEmployeeName]);
  const scoreResult = React.useMemo(() => scoreCase(evaluationCase, criteriaMetrics, manualInputs), [evaluationCase, criteriaMetrics, manualInputs]);
  const eligibleNewSubscriptionIds = React.useMemo(() => newSubscriptionCandidates.filter((candidate) => candidate.eligible).map((candidate) => candidate.profile.id), [newSubscriptionCandidates]);
  const scoreAuditRows = React.useMemo(
    () => buildScoreAuditRows(evaluationCase, scoreResult.rows, criteriaMetrics, evaluationProfiles, weightAttributions, effectiveEmployeeName, manualInputs),
    [evaluationCase, scoreResult.rows, criteriaMetrics, evaluationProfiles, weightAttributions, effectiveEmployeeName, manualInputs]
  );
  const decisionAuditRows = React.useMemo(
    () => buildDecisionAuditRows(profiles, manualExceptions, slimWeightIds, selectedNewSubscriptionIds, eligibleNewSubscriptionIds),
    [profiles, manualExceptions, slimWeightIds, selectedNewSubscriptionIds, eligibleNewSubscriptionIds]
  );
  const report = React.useMemo(() => importReport(periodNormalized), [periodNormalized]);
  const exceptionBaseCount = scopedProfiles.filter((profile) => !profile.excluded && !profile.freeMonthClient && profile.validVisits.length >= 2).length;
  const exceptionPolicy = getExceptionPolicy(exceptionBaseCount);
  const exceptionCandidates = React.useMemo(() => getExceptionCandidates(scopedProfiles).slice(0, exceptionPolicy.suggestedLimit), [scopedProfiles, exceptionPolicy.suggestedLimit]);
  const slimCandidates = React.useMemo(() => getSlimCandidates(scopedProfiles, settings), [scopedProfiles, settings]);
  const exceptionReviewProps = { profiles: scopedProfiles, candidates: exceptionCandidates, policy: exceptionPolicy, selectedIds: manualExceptions, onChange: setManualExceptions, slimCandidates, slimIds: slimWeightIds, onSlimChange: setSlimWeightIds, evaluationCase, manualInputs, settings, workingDays: periodDays, newSubscriptions, attributionRows: weightAttributions, employeeName: effectiveEmployeeName, newSubscriptionCandidates, newSubscriptionIds, onNewSubscriptionChange: setNewSubscriptionIds };
  const filteredProfiles = evaluationProfiles.filter((profile) => [profile.name, profile.id].join(" ").toLowerCase().includes(query.toLowerCase()) && matchesClientFilter(profile, clientFilter, settings));
  const updateEvaluationPeriod = (start: string, end: string) => {
    setEvaluationStart(start);
    setEvaluationEnd(end);
    const candidates = getNewSubscriptionCandidates(getPeriodProfiles(normalized, settings, start, end), normalized, start, end);
    setNewSubscriptionIds(candidates.filter((candidate) => candidate.eligible).map((candidate) => candidate.profile.id));
  };

  const selectCase = (nextCase: EvaluationCase | null) => {
    if (nextCase === evaluationCase) return;
    setEvaluationCase(nextCase);
    setManualInputs({});
    setRawVisits([]);
    setManualExceptions([]);
    setSlimWeightIds([]);
    setEvaluationStart("");
    setEvaluationEnd("");
    setNewSubscriptionIds([]);
    setSelectedEmployeeName("");
    setPendingRows([]);
    setHeaders([]);
    setPendingFileName("");
  };

  const importFiles = async (files: FileList | null) => {
    if (!evaluationCase) {
      setActiveTab("import");
      return;
    }
    const file = files?.[0];
    if (!file) return;
    const parsed = await parseFile(file);
    setPendingFileName(file.name);
    setPendingRows(parsed.rows);
    setHeaders(parsed.headers);
    setMapping(guessMapping(parsed.headers));
    setActiveTab("import");
  };

  const confirmImport = () => {
    const visits = rowsToVisits(pendingRows, mapping, pendingFileName);
    setRawVisits(visits);
    const dates = visits.map((visit) => visit.visitDate).filter(Boolean).sort();
    const detectedStart = dates[0] ?? "";
    const detectedEnd = dates.at(-1) ?? "";
    setEvaluationStart(detectedStart);
    setEvaluationEnd(detectedEnd);
    const importedNormalized = normalizeVisits(visits, settings);
    setSelectedEmployeeName(uniqueSpecialists(importedNormalized)[0] ?? "");
    const candidates = getNewSubscriptionCandidates(getPeriodProfiles(importedNormalized, settings, detectedStart, detectedEnd), importedNormalized, detectedStart, detectedEnd);
    setNewSubscriptionIds(candidates.filter((candidate) => candidate.eligible).map((candidate) => candidate.profile.id));
    setPendingRows([]);
    setHeaders([]);
    setPendingFileName("");
  };

  const exportExcel = () => {
    const visitRows = periodNormalized.map(({ clientName, normalizedClientId, visitDate, branch, specialist, weight, height, bmi, validVisit, invalidReason }) => ({
      "اسم العميل": clientName,
      "رقم العميل / الهاتف": normalizedClientId,
      "تاريخ الزيارة": visitDate,
      "الفرع": branch,
      "الأخصائي": specialist,
      "الوزن": weight,
      "الطول": height,
      "BMI": bmi,
      "زيارة صحيحة": validVisit ? "نعم" : "لا",
      "سبب الاستبعاد": invalidReason ?? ""
    }));
    const scoreRows = scoreResult.rows.map((row) => ({
      "المعيار": row.label,
      "المصدر": row.source === "device" ? "جهاز الفحص" : row.source === "penalty" ? "جزاء يدوي" : "إدخال يدوي",
      "المحقق": row.missing ? "مطلوب" : row.achieved,
      "المستهدف": row.target,
      "الدرجة": row.points,
      "المكتسب": row.missing ? "" : row.earned
    }));
    const auditRows = scoreAuditRows.map((row) => ({
      "المعيار": row.criterion,
      "المعادلة": row.formula,
      "العملاء الداخلين": row.included,
      "العملاء المستبعدين": row.excluded,
      "المحقق": row.achieved,
      "المستهدف": row.target,
      "الأثر على الدرجة": row.impact
    }));
    const clientRows = evaluationProfiles.map((profile) => ({
      "اسم العميل": profile.name,
      "الهوية": profile.id,
      "الهدف": goalLabel(profile.goal),
      "الحالة": clientStatus(profile, settings),
      "عدد الزيارات الصحيحة": profile.validVisits.length,
      "أول وزن": profile.firstWeight ?? "",
      "آخر وزن": profile.lastWeight ?? "",
      "أقل وزن": profile.minWeight ?? "",
      "BMI": profile.bmi ?? "",
      "التقدم": profile.progress,
      "استثناء يدوي": profile.manualExcluded ? "نعم" : "لا",
      "وزن رشيق مضاف": profile.manualSlimIncluded ? "نعم" : "لا"
    }));
    const attributionRows = weightAttributions.map((row) => ({
      "العميل": row.clientName,
      "الهوية": row.clientId,
      "تاريخ الوزن": row.visitDate,
      "موظف الزيارة": row.visitSpecialist ?? "",
      "صاحب الوزن/النزول": row.weightSpecialist ?? "",
      "الوزن السابق": row.previousWeight ?? "",
      "الوزن الحالي": row.currentWeight ?? "",
      "التغير": row.changeKg ?? "",
      "الحالة": attributionStatusLabels[row.status],
      "السبب": row.reason
    }));
    const decisionRows = decisionAuditRows.map((row) => ({
      "النوع": row.type,
      "العميل": row.client,
      "الهوية": row.id,
      "القرار": row.decision,
      "السبب": row.reason,
      "الأثر": row.impact
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
      "نوع التقييم": evaluationCase ? caseTitles[evaluationCase] : "",
      "الموظف محل التقييم": effectiveEmployeeName,
      "من": evaluationStart,
      "إلى": evaluationEnd,
      "أيام التقييم": periodDays,
      "النتيجة": scoreResult.total,
      "بنود تحتاج إدخال": scoreResult.missingCount
    }]), "Summary");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(scoreRows), "Score");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(auditRows), "Criteria Audit");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(decisionRows), "Decision Audit");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(clientRows), "Clients");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(visitRows), "Visits");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(attributionRows), "Leave Attribution");
    const output = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    saveAs(new Blob([output]), "dr-nutrition-evaluation-audit-export.xlsx");
  };

  const exportClients = (profilesToExport: ReturnType<typeof buildClientProfiles>, filter: ClientFilter) => {
    const rows = profilesToExport.map((profile) => ({
      "اسم العميل": profile.name,
      "الهوية": profile.id,
      "الهدف": goalLabel(profile.goal),
      "الحالة": clientStatus(profile, settings),
      "عدد الزيارات الصحيحة": profile.validVisits.length,
      "أول وزن": profile.firstWeight ?? "",
      "آخر وزن": profile.lastWeight ?? "",
      "أقل وزن": profile.minWeight ?? "",
      "BMI": profile.bmi ?? "",
      "التقدم": profile.progress,
      "شهر مجاني": profile.freeMonthClient ? "نعم" : "لا",
      "مؤهل للشهر المجاني": profile.freeMonthEligible ? "نعم" : "لا",
      "وزن مثالي": profile.idealWeight ? "نعم" : "لا",
      "تثبيت وزن": profile.maintenance ? "نعم" : "لا",
      "مراجع": profile.reviewer ? "نعم" : "لا",
      "الفرع": profile.visits.at(-1)?.branch ?? "",
      "الأخصائي": profile.visits.at(-1)?.specialist ?? ""
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Clients");
    const output = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    saveAs(new Blob([output]), `clients-${filter}.xlsx`);
  };

  const exportPdf = async () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const selectedExceptions = evaluationProfiles.filter((profile) => manualExceptions.includes(profile.id));
    const selectedSlim = evaluationProfiles.filter((profile) => slimWeightIds.includes(profile.id));
    const selectedNew = profiles.filter((profile) => selectedNewSubscriptionIds.includes(profile.id));
    const handoffRows = weightAttributions.filter((row) => row.status === "handoff" || row.status === "manual_review").slice(0, 80);
    const report = document.createElement("div");
    report.className = "pdf-report";
    report.innerHTML = `
      <style>
        .pdf-report { direction: rtl; width: 860px; padding: 24px; font-family: Tahoma, Arial, sans-serif; color: #171717; background: white; }
        .pdf-report h1 { margin: 0 0 6px; font-size: 24px; color: #5d2d6b; }
        .pdf-report h2 { margin: 22px 0 10px; font-size: 16px; color: #171717; border-bottom: 1px solid #e7dfea; padding-bottom: 7px; }
        .pdf-report p { margin: 3px 0; color: #555; font-size: 12px; }
        .pdf-report .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 14px; }
        .pdf-report .box { border: 1px solid #e7dfea; border-radius: 8px; padding: 9px; background: #fbf9fc; }
        .pdf-report .box strong { display: block; color: #5d2d6b; font-size: 15px; margin-top: 4px; }
        .pdf-report table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
        .pdf-report th, .pdf-report td { border: 1px solid #edf1ee; padding: 7px; text-align: right; vertical-align: top; }
        .pdf-report th { background: #f3eaf5; color: #542762; }
        .pdf-report .ok { color: #16723c; font-weight: 700; }
        .pdf-report .warn { color: #a26a00; font-weight: 700; }
      </style>
      <h1>تقرير تقييم Dr Nutrition</h1>
      <p>نوع التقييم: ${escapeHtml(evaluationCase ? caseTitles[evaluationCase] : "غير محدد")}</p>
      <p>الموظف محل التقييم: ${escapeHtml(effectiveEmployeeName || "غير محدد")}</p>
      <p>الفترة: ${escapeHtml(evaluationStart || "-")} إلى ${escapeHtml(evaluationEnd || "-")} | عدد أيام التقييم: ${periodDays}</p>
      <p>تاريخ التصدير: ${new Date().toISOString().slice(0, 10)}</p>
      <div class="grid">
        <div class="box">النتيجة النهائية<strong>${scoreResult.total}</strong></div>
        <div class="box">بنود تحتاج إدخال<strong>${scoreResult.missingCount}</strong></div>
        <div class="box">العملاء المحسوبون<strong>${evaluationProfiles.filter((p) => !p.excluded && !p.freeMonthClient && !p.manualExcluded).length}</strong></div>
        <div class="box">الاشتراكات الجديدة<strong>${newSubscriptions}</strong></div>
      </div>
      <h2>نتيجة المعايير</h2>
      ${reportTable(["المعيار", "المصدر", "المحقق", "المستهدف", "الدرجة", "المكتسب"], scoreResult.rows.map((row) => [
        row.label,
        row.source === "device" ? "جهاز الفحص" : row.source === "penalty" ? "جزاء يدوي" : "إدخال يدوي",
        row.missing ? "مطلوب" : String(row.achieved),
        String(row.target),
        String(row.points),
        row.missing ? "-" : String(row.earned)
      ]))}
      <h2>المؤشرات المحسوبة من الملف</h2>
      ${reportTable(["المؤشر", "القيمة"], criteriaMetrics.map((metric) => [metric.label, formatMetric(metric.value, metric.format)]))}
      <h2>تدقيق المعايير</h2>
      ${reportTable(["المعيار", "المعادلة", "المحقق", "الأثر"], scoreAuditRows.map((row) => [row.criterion, row.formula, row.achieved, row.impact]))}
      <h2>الاستثناءات والاختيارات</h2>
      ${reportTable(["النوع", "العدد", "العملاء"], [
        ["استثناءات معتمدة", String(selectedExceptions.length), selectedExceptions.map((profile) => `${profile.name} (${profile.id})`).join("، ") || "-"],
        ["أوزان رشيقة مضافة", String(selectedSlim.length), selectedSlim.map((profile) => `${profile.name} (${profile.id})`).join("، ") || "-"],
        ["اشتراكات جديدة", String(selectedNew.length), selectedNew.map((profile) => `${profile.name} (${profile.id})`).join("، ") || "-"]
      ])}
      <h2>سجل القرارات اليدوية</h2>
      ${reportTable(["النوع", "العميل", "القرار", "السبب", "الأثر"], decisionAuditRows.map((row) => [row.type, `${row.client} (${row.id})`, row.decision, row.reason, row.impact]))}
      <h2>سياسة الإجازة وإسناد الوزن</h2>
      <p>الزيارة تُحسب لموظف الزيارة الحالية، ونزول الوزن يُحسب لموظف الزيارة السابقة. عند عدم وجود موظف سابق يُسند الوزن للموظف الحالي، والحالات غير الواضحة تظهر كمراجعة يدوية.</p>
      ${reportTable(["العميل", "تاريخ الوزن", "موظف الزيارة", "صاحب الوزن", "التغير", "الحالة"], handoffRows.map((row) => [
        `${row.clientName} (${row.clientId})`,
        row.visitDate,
        row.visitSpecialist ?? "غير معروف",
        row.weightSpecialist ?? "مطلوب تحديد",
        row.changeKg === undefined ? "-" : `${row.changeKg} كجم`,
        attributionStatusLabels[row.status]
      ]))}
    `;
    report.style.position = "fixed";
    report.style.left = "-10000px";
    report.style.top = "0";
    document.body.appendChild(report);
    const canvas = await html2canvas(report, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      windowWidth: 900
    });
    report.remove();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 8;
    const contentWidth = pageWidth - margin * 2;
    const contentHeight = pageHeight - margin * 2;
    const pageCanvas = document.createElement("canvas");
    const pageContext = pageCanvas.getContext("2d")!;
    const sourcePageHeight = Math.floor((canvas.width * contentHeight) / contentWidth);
    pageCanvas.width = canvas.width;
    pageCanvas.height = sourcePageHeight;
    let sourceY = 0;
    let pageIndex = 0;
    while (sourceY < canvas.height) {
      pageContext.clearRect(0, 0, pageCanvas.width, pageCanvas.height);
      pageContext.fillStyle = "#ffffff";
      pageContext.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      pageContext.drawImage(canvas, 0, sourceY, canvas.width, sourcePageHeight, 0, 0, canvas.width, sourcePageHeight);
      if (pageIndex > 0) doc.addPage();
      doc.addImage(pageCanvas.toDataURL("image/png"), "PNG", margin, margin, contentWidth, contentHeight);
      sourceY += sourcePageHeight;
      pageIndex += 1;
    }
    doc.save("dr-nutrition-evaluation-report.pdf");
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">DN</span>
          <div>
            <strong>Dr Nutrition</strong>
            <small>منصة تقييم الأخصائيين</small>
          </div>
        </div>
        <nav>
          {tabs.map(({ id, label, icon: Icon }) => (
            <button className={activeTab === id ? "active" : ""} key={id} onClick={() => setActiveTab(id)}>
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="auth-card">
          <Shield size={18} />
          <span>Admin / Supervisor</span>
          <small>{storageMode}</small>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <h1>{tabs.find((tab) => tab.id === activeTab)?.label}</h1>
            <p>{evaluationCase ? caseTitles[evaluationCase] : "اختر نظام الحساب أولًا"} | ملف واحد لفرع واحد</p>
          </div>
          <div className="actions">
            <button onClick={exportExcel}><Download size={17} /> Excel</button>
            <button onClick={exportPdf}><Download size={17} /> PDF</button>
          </div>
        </header>
        <GlobalControls
          evaluationCase={evaluationCase}
          onCaseChange={selectCase}
          startsAt={evaluationStart}
          endsAt={evaluationEnd}
          days={periodDays}
          onPeriodChange={updateEvaluationPeriod}
          employeeName={effectiveEmployeeName}
          employeeOptions={employeeOptions}
          onEmployeeChange={setSelectedEmployeeName}
        />

        {activeTab === "dashboard" && (
          <section className="stack">
            <WorkflowPanel evaluationCase={evaluationCase} hasFile={rawVisits.length > 0} hasPeriod={Boolean(evaluationStart && evaluationEnd)} employeeName={effectiveEmployeeName} decisionsCount={decisionAuditRows.length} />
            <div className="kpis">
              <Kpi label="الفرع" value={rawVisits.length ? 1 : 0} detail={activeBranch ? activeBranch.name : "لم يتم استيراد ملف بعد"} />
              <Kpi label="العملاء" value={evaluationProfiles.filter((p) => !p.excluded && !p.freeMonthClient && !p.manualExcluded).length} detail={`${evaluationProfiles.filter((p) => p.reviewer && !p.manualExcluded).length} مراجع`} />
              <Kpi label="الشهر المجاني" value={evaluationProfiles.filter((p) => p.freeMonthClient).length} detail={`${evaluationProfiles.filter((p) => p.freeMonthEligible && !p.manualExcluded).length} مؤهل`} />
              <Kpi label="إجمالي النزول" value={`${branchMetrics.reduce((s, b) => s + b.totalLossKg, 0).toFixed(1)} كجم`} detail={`متوسط النسبة ${averageLossPercent(profiles)}%`} />
            </div>
            <CriteriaTable metrics={criteriaMetrics} />
            <ManualInputsPanel evaluationCase={evaluationCase} values={manualInputs} onChange={setManualInputs} />
            <ScoreTable rows={scoreResult.rows} total={scoreResult.total} missingCount={scoreResult.missingCount} />
            <Alerts metrics={branchMetrics} evaluations={employeeEvaluations} />
            <BranchTable metrics={branchMetrics} />
          </section>
        )}

        {activeTab === "import" && (
          <section className="stack">
            <label className="dropzone">
              <UploadCloud size={30} />
              <strong>اختر ملف Excel/CSV واحد للفرع</strong>
              <span>{evaluationCase ? "سيتم تطبيق نظام الحساب المختار فقط" : "اختر نوع الأخصائي أو الاستشاري أولًا قبل الرفع"}</span>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => importFiles(event.target.files)} disabled={!evaluationCase} />
            </label>
            {headers.length > 0 && (
              <div className="panel">
                <div className="panel-title">
                  <h2>ربط الأعمدة قبل التأكيد</h2>
                  <button onClick={confirmImport}>تأكيد الاستيراد</button>
                </div>
                <div className="mapping-grid">
                  {Object.keys(mappingFields).map((field) => (
                    <label key={field}>
                      <span>{mappingFields[field as keyof ColumnMapping]}</span>
                      <select value={mapping[field as keyof ColumnMapping] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))}>
                        <option value="">غير مربوط</option>
                        {headers.map((header) => <option key={header} value={header}>{header}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
                <Preview rows={pendingRows} />
              </div>
            )}
            <ImportSummary report={report} visits={normalized} />
          </section>
        )}

        {activeTab === "branches" && <section className="stack"><CriteriaTable metrics={criteriaMetrics} /><BranchTable metrics={branchMetrics} detailed /></section>}
        {activeTab === "employees" && <section className="stack"><ManualInputsPanel evaluationCase={evaluationCase} values={manualInputs} onChange={setManualInputs} /><ScoreTable rows={scoreResult.rows} total={scoreResult.total} missingCount={scoreResult.missingCount} /><AuditTable rows={scoreAuditRows} /></section>}
        {activeTab === "clients" && (
          <section className="stack">
            <ClientExplorer profiles={filteredProfiles} allProfiles={evaluationProfiles} query={query} setQuery={setQuery} filter={clientFilter} setFilter={setClientFilter} settings={settings} onExport={exportClients} />
          </section>
        )}
        {activeTab === "exceptions" && <section className="stack"><ExceptionReview {...exceptionReviewProps} /><div className="panel"><h2>طريقة الاستخدام</h2><p>اختار الحالات التي لديها سبب معتمد أو إثبات، وسيمنعك النظام من تجاوز النسبة المسموحة. البيانات الأصلية لا تُحذف.</p></div></section>}
        {activeTab === "criteria-guide" && <CriteriaGuide activeCase={evaluationCase} attributionRows={weightAttributions} />}
        {activeTab === "settings" && <SettingsPanel settings={settings} setSettings={setSettings} />}
      </main>
    </div>
  );
};

const buildSingleBranch = (visits: RawVisit[], evaluationCase: EvaluationCase | null): Branch | null => {
  if (!evaluationCase) return null;
  const branchName = visits.find((visit) => visit.branch)?.branch || "الفرع المستورد";
  return {
    id: "single-branch",
    name: branchName,
    densityOverride: evaluationCase === "nutrition_specialist" ? "high" : "low",
    targetRevenue: 0
  };
};

const sameSpecialist = (left?: string, right?: string) => Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase());

const uniqueSpecialists = (visits: Pick<RawVisit, "specialist">[]) =>
  [...new Set(visits.map((visit) => visit.specialist?.trim()).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b, "ar"));

const scopeProfilesForEmployee = (profiles: ReturnType<typeof buildClientProfiles>, employeeName: string, attributionRows: WeightAttribution[]) => {
  if (!employeeName) return profiles;
  const weightClientIds = new Set(attributionRows.filter((row) => sameSpecialist(row.weightSpecialist, employeeName) && row.status !== "manual_review").map((row) => row.clientId));
  return profiles
    .filter((profile) => profile.validVisits.some((visit) => sameSpecialist(visit.specialist, employeeName)) || weightClientIds.has(profile.id))
    .map((profile) => {
      const validVisits = profile.validVisits.filter((visit) => sameSpecialist(visit.specialist, employeeName));
      return {
        ...profile,
        validVisits,
        reviewer: validVisits.length >= 2
      };
    });
};

const buildSingleEmployee = (visits: RawVisit[], branch: Branch | null, evaluationCase: EvaluationCase | null, selectedName: string): Employee | null => {
  if (!branch || !evaluationCase) return null;
  const specialistName = selectedName || visits.find((visit) => visit.specialist)?.specialist;
  return {
    id: "single-employee",
    name: specialistName || caseTitles[evaluationCase],
    role: evaluationCase === "nutrition_specialist" ? "nutrition_specialist" : "supplement_consultant",
    branchId: branch.id,
    currentTarget: 1,
    adminScore: 0,
    scientificScore: 0
  };
};

const GlobalControls = ({
  evaluationCase,
  onCaseChange,
  startsAt,
  endsAt,
  days,
  onPeriodChange,
  employeeName,
  employeeOptions,
  onEmployeeChange
}: {
  evaluationCase: EvaluationCase | null;
  onCaseChange: (value: EvaluationCase) => void;
  startsAt: string;
  endsAt: string;
  days: number;
  onPeriodChange: (start: string, end: string) => void;
  employeeName: string;
  employeeOptions: string[];
  onEmployeeChange: (value: string) => void;
}) => (
  <div className="panel global-controls">
    <div className="control-field control-case">
      <span>نوع التقييم</span>
      <select value={evaluationCase ?? ""} onChange={(event) => event.target.value && onCaseChange(event.target.value as EvaluationCase)}>
        <option value="">اختر نظام الحساب</option>
        {(Object.keys(caseTitles) as EvaluationCase[]).map((caseId) => <option key={caseId} value={caseId}>{caseTitles[caseId]}</option>)}
      </select>
    </div>
    <div className="control-field control-start">
      <span>من</span>
      <input type="date" value={startsAt} onChange={(event) => onPeriodChange(event.target.value, endsAt)} />
    </div>
    <div className="control-field control-end">
      <span>إلى</span>
      <input type="date" value={endsAt} onChange={(event) => onPeriodChange(startsAt, event.target.value)} />
    </div>
    <div className="control-field control-employee">
      <span>الموظف محل التقييم</span>
      <select value={employeeName} disabled={!employeeOptions.length} onChange={(event) => onEmployeeChange(event.target.value)}>
        {!employeeOptions.length && <option value="">يظهر بعد الاستيراد</option>}
        {employeeOptions.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
    </div>
    <div className="days-indicator">
      <strong>{days}</strong>
      <span>يوم تقييم</span>
    </div>
  </div>
);

const WorkflowPanel = ({ evaluationCase, hasFile, hasPeriod, employeeName, decisionsCount }: { evaluationCase: EvaluationCase | null; hasFile: boolean; hasPeriod: boolean; employeeName: string; decisionsCount: number }) => {
  const steps = [
    { label: "اختر النوع", done: Boolean(evaluationCase) },
    { label: "ارفع الملف", done: hasFile },
    { label: "اختر الفترة", done: hasPeriod },
    { label: "اختر الموظف", done: Boolean(employeeName) },
    { label: "راجع الاستثناءات", done: decisionsCount > 0 },
    { label: "اعتمد التقرير", done: false }
  ];
  return (
    <div className="panel workflow-panel">
      <h2>خطوات اعتماد التقييم</h2>
      <div className="workflow-steps">
        {steps.map((step, index) => <span className={step.done ? "done" : ""} key={step.label}>{index + 1}. {step.label}</span>)}
      </div>
    </div>
  );
};

const CaseSelector = ({ value, onChange }: { value: EvaluationCase | null; onChange: (value: EvaluationCase) => void }) => (
  <div className="panel">
    <h2>حدد نظام الحساب قبل الاستيراد</h2>
    <div className="case-grid">
      {(Object.keys(caseTitles) as EvaluationCase[]).map((caseId) => (
        <button className={value === caseId ? "selected" : ""} key={caseId} onClick={() => onChange(caseId)}>
          {caseTitles[caseId]}
        </button>
      ))}
    </div>
  </div>
);

const mappingFields: Record<keyof ColumnMapping, string> = {
  clientName: "اسم العميل",
  clientId: "رقم العميل / الهاتف",
  visitDate: "تاريخ الزيارة",
  visitTime: "وقت الزيارة",
  weight: "الوزن",
  height: "الطول",
  specialist: "الأخصائي",
  salesEmployee: "موظف المبيعات",
  branch: "الفرع",
  customerGoal: "هدف العميل",
  visitType: "نوع الزيارة",
  freeMonth: "الشهر المجاني",
  program: "البرنامج",
  products: "المنتجات",
  notes: "الملاحظات"
};

const Kpi = ({ label, value, detail }: { label: string; value: React.ReactNode; detail: string }) => (
  <div className="kpi">
    <span>{label}</span>
    <strong>{value}</strong>
    <small>{detail}</small>
  </div>
);

const EvaluationPeriodPanel = ({ startsAt, endsAt, days, candidates, selectedIds, onPeriodChange, onSelectionChange }: {
  startsAt: string;
  endsAt: string;
  days: number;
  candidates: NewSubscriptionCandidate[];
  selectedIds: string[];
  onPeriodChange: (start: string, end: string) => void;
  onSelectionChange: React.Dispatch<React.SetStateAction<string[]>>;
}) => (
  <div className="panel period-panel">
    <div className="panel-title"><div><h2>فترة التقييم</h2><p>يتم الحساب على الزيارات الواقعة داخل هذه الفترة فقط.</p></div><strong className="pill">{days} يوم تقييم</strong></div>
    <div className="period-grid">
      <label><span>من</span><input type="date" value={startsAt} onChange={(event) => onPeriodChange(event.target.value, endsAt)} /></label>
      <label><span>إلى</span><input type="date" value={endsAt} onChange={(event) => onPeriodChange(startsAt, event.target.value)} /></label>
    </div>
    <div className="period-note">يُرشح العميل كاشتراك جديد إذا كانت أول زيارة صحيحة له داخل الفترة، ولم توجد له أي زيارة خلال الـ45 يومًا السابقة لبداية الفترة. أزل التحديد إذا كان العميل منقولًا من فرع آخر أو لا تريد احتسابه كاشتراك جديد.</div>
    <div className="exception-section-title"><h3>مراجعة الاشتراكات الجديدة</h3><span className="pill">المختار {selectedIds.length}</span></div>
    {!candidates.length ? <div className="empty-state"><p>حدد فترة صحيحة بعد استيراد الملف لعرض العملاء المرشحين.</p></div> : <div className="exception-list new-subscription-list">
      {candidates.map(({ profile, eligible, reason }) => {
        const checked = selectedIds.includes(profile.id);
        return <label className={`exception-item${checked ? " selected" : ""}${!eligible ? " disabled" : ""}`} key={`new-${profile.id}`}>
          <input type="checkbox" checked={checked} disabled={!eligible} onChange={() => onSelectionChange((current) => checked ? current.filter((id) => id !== profile.id) : [...current, profile.id])} />
          <span className="exception-main"><strong>{profile.name}</strong><small>{profile.id} · {reason}</small><small className="exception-impact">{eligible ? "مرشح تلقائيًا كاشتراك جديد" : "غير مؤهل تلقائيًا بسبب زيارة خلال الـ45 يومًا السابقة"}</small></span>
        </label>;
      })}
    </div>}
  </div>
);

const formatMetric = (value: number, format?: "number" | "decimal" | "percent" | "kg") => {
  if (format === "kg") return `${value.toLocaleString("en-US")} كجم`;
  if (format === "percent") return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  if (format === "decimal") return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const reportTable = (headers: string[], rows: string[][]) => {
  if (!rows.length) return `<p class="warn">لا توجد بيانات لعرضها.</p>`;
  return `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
};

const CriteriaTable = ({ metrics }: { metrics: ReturnType<typeof computeCriteriaMetrics> }) => (
  <div className="panel">
    <h2>معايير التقييم من ملف الفرع</h2>
    <div className="criteria-grid">
      {metrics.map((metric) => (
        <div className="metric-card" key={metric.id}>
          <span>{metric.label}</span>
          <strong>{formatMetric(metric.value, metric.format)}</strong>
        </div>
      ))}
    </div>
  </div>
);

const ManualInputsPanel = ({
  evaluationCase,
  values,
  onChange
}: {
  evaluationCase: EvaluationCase | null;
  values: ManualInputs;
  onChange: React.Dispatch<React.SetStateAction<ManualInputs>>;
}) => {
  const fields = evaluationCase ? caseCriteria[evaluationCase].filter((criterion) => criterion.source !== "device") : [];
  if (!evaluationCase) {
    return (
      <div className="panel empty-state">
        <h2>البيانات المطلوبة منك</h2>
        <p>اختار نوع الموظف الأول عشان النظام يحدد الأسئلة المطلوبة.</p>
      </div>
    );
  }
  return (
    <div className="panel">
      <h2>البيانات التي لا تظهر في شيت جهاز الفحص</h2>
      <div className="manual-grid">
        {fields.map((field) => (
          <label key={field.id}>
            <span>{field.label}</span>
            <input
              type="number"
              step="0.01"
              placeholder={field.source === "penalty" ? "اكتب العدد، واتركها فارغة إذا لا يوجد" : "مطلوب إدخال"}
              value={values[field.id] ?? ""}
              onChange={(event) =>
                onChange((current) => {
                  const next = { ...current };
                  if (event.target.value === "") {
                    delete next[field.id];
                  } else {
                    next[field.id] = Number(event.target.value);
                  }
                  return next;
                })
              }
            />
          </label>
        ))}
      </div>
    </div>
  );
};

const ScoreTable = ({ rows, total, missingCount }: { rows: ReturnType<typeof scoreCase>["rows"]; total: number; missingCount: number }) => (
  <div className="panel">
    <div className="panel-title">
      <div>
        <h2>نتيجة تقييم الموظف</h2>
        <p>كل بند محسوب من مصدره: شيت الجهاز أو إدخال يدوي مطلوب.</p>
      </div>
      <strong className="pill">الإجمالي {total}</strong>
    </div>
    {missingCount > 0 && <div className="notice">باقي {missingCount} بند يحتاج إدخال قبل اعتماد النتيجة النهائية.</div>}
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>المعيار</th><th>المصدر</th><th>المحقق</th><th>المستهدف</th><th>الدرجة</th><th>المكتسب</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row.missing ? "missing-row" : ""}>
              <td>{row.label}</td>
              <td>{row.source === "device" ? "من جهاز الفحص" : row.source === "penalty" ? "إدخال جزاءات" : "إدخال يدوي"}</td>
              <td>{row.missing ? "مطلوب" : row.achieved}</td>
              <td>{row.target}</td>
              <td>{row.points}</td>
              <td>{row.missing ? "-" : row.earned}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const AuditTable = ({ rows }: { rows: AuditRow[] }) => (
  <div className="panel">
    <div className="panel-title">
      <div>
        <h2>تدقيق النتيجة</h2>
        <p>سبب كل معيار، العملاء الداخلون والمستبعدون، والأثر على الدرجة.</p>
      </div>
    </div>
    <div className="table-wrap audit-table-wrap">
      <table>
        <thead><tr><th>المعيار</th><th>المعادلة</th><th>الداخل</th><th>المستبعد</th><th>الأثر</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.criterion}><td>{row.criterion}</td><td>{row.formula}</td><td>{row.included}</td><td>{row.excluded}</td><td>{row.impact}</td></tr>)}</tbody>
      </table>
    </div>
  </div>
);

const Alerts = ({ metrics, evaluations }: { metrics: ReturnType<typeof computeBranchMetrics>; evaluations: ReturnType<typeof evaluateEmployees> }) => {
  const alerts = [
    ...metrics.filter((metric) => metric.averageVisits < 2).map((metric) => `متوسط الزيارات منخفض في ${metric.branchName}`),
    ...metrics.filter((metric) => metric.clients < 3).map((metric) => `عدد العملاء يحتاج متابعة في ${metric.branchName}`),
    ...evaluations.filter((evaluation) => evaluation.score < 60).map((evaluation) => `${evaluation.employee.name} دون الحد الأدنى في المسار`)
  ];
  return (
    <div className="panel">
      <h2>تنبيهات ذكية</h2>
      <div className="alert-list">
        {(alerts.length ? alerts : ["لا توجد تنبيهات حرجة في البيانات الحالية"]).map((alert) => <span key={alert}>{alert}</span>)}
      </div>
    </div>
  );
};

const BranchTable = ({ metrics, detailed = false }: { metrics: ReturnType<typeof computeBranchMetrics>; detailed?: boolean }) => (
  <div className="panel">
    <h2>{detailed ? "لوحة الفروع" : "ترتيب الفروع"}</h2>
    <div className="table-wrap">
      <table>
        <thead><tr><th>الفرع</th><th>الكثافة</th><th>التصنيف</th><th>العملاء</th><th>المراجعين</th><th>الشهر المجاني</th><th>النزول</th><th>تحقيق المستهدف</th></tr></thead>
        <tbody>
          {metrics.map((metric) => (
            <tr key={metric.branchId}>
              <td>{metric.branchName}</td><td>{metric.density}</td><td>{metric.densityClass === "high" ? "مرتفعة" : "منخفضة"}</td><td>{metric.clients}</td><td>{metric.reviewers}</td><td>{metric.freeMonthClients}</td><td>{metric.totalLossKg} كجم</td><td>{metric.targetAchievement}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const EmployeeTable = ({ evaluations }: { evaluations: ReturnType<typeof evaluateEmployees> }) => (
  <div className="panel">
    <h2>ترتيب الموظفين</h2>
    <div className="cards-grid">
      {evaluations.map((evaluation) => (
        <article className="employee-card" key={evaluation.employee.id}>
          <small>{evaluation.path}</small>
          <h3>{evaluation.employee.name}</h3>
          <div className="score">{evaluation.score}</div>
          <p>التارجت: {evaluation.employee.currentTarget} &gt; {evaluation.newTarget}</p>
        </article>
      ))}
    </div>
  </div>
);

const EmployeeDetails = ({ evaluations }: { evaluations: ReturnType<typeof evaluateEmployees> }) => (
  <section className="stack">
    {evaluations.map((evaluation) => (
      <div className="panel" key={evaluation.employee.id}>
        <div className="panel-title">
          <div><h2>{evaluation.employee.name}</h2><p>{evaluation.path} | {evaluation.branch.name}</p></div>
          <strong className="pill">النتيجة {evaluation.score}</strong>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>البند</th><th>المحقق</th><th>المستهدف</th><th>الدرجة</th><th>المكتسب</th><th>المصدر</th></tr></thead>
            <tbody>{evaluation.rows.map((row) => <tr key={row.label}><td>{row.label}</td><td>{row.achieved}</td><td>{row.target}</td><td>{row.points}</td><td>{row.earned}</td><td>{row.source}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    ))}
  </section>
);

const clientStatus = (profile: ReturnType<typeof buildClientProfiles>[number], settings: typeof defaultSettings) => {
  if (profile.excluded) return "مستبعد";
  if (profile.manualExcluded) return "استثناء معتمد";
  if (profile.freeMonthClient) return "شهر مجاني";
  if (profile.idealWeight) return "وزن مثالي";
  if (profile.maintenance) return "تثبيت وزن";
  if (profile.reviewer) return "مراجع";
  return "زيارة واحدة";
};

const matchesClientFilter = (profile: ReturnType<typeof buildClientProfiles>[number], filter: ClientFilter, settings: typeof defaultSettings) => {
  if (filter === "all") return true;
  if (filter === "free_month") return profile.freeMonthClient;
  if (filter === "maintenance") return profile.maintenance;
  if (filter === "ideal") return profile.idealWeight;
  if (filter === "reviewer") return profile.reviewer;
  if (filter === "excluded") return profile.excluded;
  if (filter === "one_visit") return profile.validVisits.length < 2;
  const high = Boolean(profile.firstWeight && profile.height && profile.firstWeight > (cwf(profile.height, settings.highWeightCwfBufferPct) ?? Number.POSITIVE_INFINITY));
  return filter === "high_weight" ? high : !high;
};

const ClientExplorer = ({
  profiles,
  allProfiles,
  query,
  setQuery,
  filter,
  setFilter,
  settings,
  onExport
}: {
  profiles: ReturnType<typeof buildClientProfiles>;
  allProfiles: ReturnType<typeof buildClientProfiles>;
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  filter: ClientFilter;
  setFilter: React.Dispatch<React.SetStateAction<ClientFilter>>;
  settings: typeof defaultSettings;
  onExport: (profiles: ReturnType<typeof buildClientProfiles>, filter: ClientFilter) => void;
}) => (
  <>
    <div className="panel client-toolbar">
      <div className="searchbar"><Filter size={18} /><input placeholder="بحث بالاسم أو الهاتف" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <div className="filter-row">
        {(Object.keys(clientFilterLabels) as ClientFilter[]).map((key) => (
          <button key={key} className={filter === key ? "selected" : ""} onClick={() => setFilter(key)}>{clientFilterLabels[key]} <span>{allProfiles.filter((profile) => matchesClientFilter(profile, key, settings)).length}</span></button>
        ))}
      </div>
      <div className="panel-title export-row">
        <div><h2>العملاء والزيارات</h2><p>عرض {profiles.length} من إجمالي {allProfiles.length} عميل</p></div>
        <button onClick={() => onExport(profiles, filter)}><Download size={17} /> تصدير المعروض</button>
      </div>
    </div>
    <ClientTable profiles={profiles} settings={settings} />
  </>
);

type ClientSortKey = "name" | "id" | "status" | "goal" | "visits" | "firstWeight" | "lastWeight" | "minWeight" | "bmi" | "progress" | "freeMonth" | "ideal" | "maintenance";

const goalLabels = {
  ar: { loss: "نزول وزن", gain: "زيادة وزن", athletic: "رياضي", maintain: "تثبيت", ideal: "مثالي", other: "أخرى" },
  en: { loss: "Weight loss", gain: "Weight gain", athletic: "Athletic", maintain: "Maintenance", ideal: "Ideal", other: "Other" }
} as const;

const goalLabel = (goal: string) => {
  const language = document.documentElement.lang.toLowerCase().startsWith("en") ? "en" : "ar";
  return goalLabels[language][goal as keyof typeof goalLabels.ar] ?? goal;
};

const getExceptionPolicy = (clientCount: number) => {
  const percentage = clientCount < 75 ? 3 : clientCount <= 100 ? 5 : clientCount <= 150 ? 8 : clientCount <= 200 ? 10 : 12;
  const allowedCount = Math.floor((clientCount * percentage) / 100);
  return { percentage, allowedCount, suggestedLimit: allowedCount * 2, boundaryNote: clientCount === 75 ? "تم تطبيق 3% بشكل تحفظي لأن المانيوال لا يحدد حالة 75 عميلًا صراحة." : "" };
};

const getExceptionCandidates = (profiles: ReturnType<typeof buildClientProfiles>): ExceptionCandidate[] => profiles
  .filter((profile) => !profile.excluded && !profile.freeMonthClient && profile.validVisits.length >= 2)
  .map((profile) => {
    if (profile.goal === "athletic") return { profile, reason: "هدف العميل رياضي، وهو من أمثلة الاستثناءات المذكورة في المانيوال.", impact: "لا يناسب مؤشرات نزول الوزن التقليدية.", priority: 100 };
    if (profile.goal === "maintain" || profile.maintenance) return { profile, reason: "العميل من عملاء تثبيت الوزن، وهو من أمثلة الاستثناءات.", impact: "قد يقلل متوسط النزول رغم تحقيق هدف التثبيت.", priority: 90 };
    if (profile.goal === "gain") return { profile, reason: "هدف العميل زيادة وزن، ويحتاج مراجعة واعتماد منفصل عن مؤشرات النزول.", impact: "قد يظهر كنزول سلبي عند تقييم مؤشرات النزول.", priority: 80 };
    if (profile.goal === "loss" && profile.progress <= 0) return { profile, reason: "نزول سلبي أو لا يوجد نزول مسجل رغم وجود زيارتين صحيحتين.", impact: `أثر سلبي مباشر: ${profile.progress.toFixed(2)} كجم. يحتاج إثبات سبب الاستثناء.`, priority: 70 };
    return null;
  })
  .filter((candidate): candidate is ExceptionCandidate => Boolean(candidate))
  .sort((a, b) => b.priority - a.priority || a.profile.progress - b.profile.progress);

const getSlimCandidates = (profiles: ReturnType<typeof buildClientProfiles>, settings: typeof defaultSettings) => profiles.filter((profile) => {
  const high = Boolean(profile.firstWeight && profile.height && profile.firstWeight > (cwf(profile.height, settings.highWeightCwfBufferPct) ?? Number.POSITIVE_INFINITY));
  return !profile.excluded && !profile.freeMonthClient && profile.validVisits.length >= 2 && !high;
});

const ExceptionReview = ({ profiles, candidates, policy, selectedIds, onChange, slimCandidates, slimIds, onSlimChange, evaluationCase, manualInputs, settings, workingDays, newSubscriptions, attributionRows, employeeName, newSubscriptionCandidates, newSubscriptionIds, onNewSubscriptionChange }: {
  profiles: ReturnType<typeof buildClientProfiles>;
  candidates: ExceptionCandidate[];
  policy: ReturnType<typeof getExceptionPolicy>;
  selectedIds: string[];
  onChange: React.Dispatch<React.SetStateAction<string[]>>;
  slimCandidates: ReturnType<typeof getSlimCandidates>;
  slimIds: string[];
  onSlimChange: React.Dispatch<React.SetStateAction<string[]>>;
  evaluationCase: EvaluationCase | null;
  manualInputs: ManualInputs;
  settings: typeof defaultSettings;
  workingDays: number;
  newSubscriptions: number;
  attributionRows: WeightAttribution[];
  employeeName: string;
  newSubscriptionCandidates: NewSubscriptionCandidate[];
  newSubscriptionIds: string[];
  onNewSubscriptionChange: React.Dispatch<React.SetStateAction<string[]>>;
}) => {
  if (!profiles.length) return null;
  const toggle = (id: string) => {
    onChange((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= policy.allowedCount) return current;
      return [...current, id];
    });
    onSlimChange((current) => current.filter((item) => item !== id));
  };
  const toggleSlim = (id: string) => {
    onSlimChange((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    onChange((current) => current.filter((item) => item !== id));
  };
  const baselineScore = scoreCase(evaluationCase, computeCriteriaMetrics(profiles, settings, workingDays, newSubscriptions, { attributionRows, employeeName }), manualInputs).total;
  const previewProfiles = profiles.map((profile) => ({ ...profile, manualExcluded: selectedIds.includes(profile.id), manualSlimIncluded: slimIds.includes(profile.id) }));
  const previewScore = scoreCase(evaluationCase, computeCriteriaMetrics(previewProfiles, settings, workingDays, newSubscriptions, { attributionRows, employeeName }), manualInputs).total;
  const scoreDelta = Number((previewScore - baselineScore).toFixed(2));
  return (
    <div className="panel exception-panel">
      <div className="panel-title">
        <div><h2>مراجعة الاستثناءات المقترحة</h2><p>لا يتم حذف أي عميل تلقائيًا. اختر فقط الحالات التي لديك اعتماد أو إثبات لها. الفارق محسوب من البنود المتاحة حاليًا.</p></div>
        <div className="exception-score"><span>الأساسي {baselineScore}</span><strong className={scoreDelta > 0 ? "score-up" : scoreDelta < 0 ? "score-down" : "score-neutral"}>بعد الاختيار {previewScore} ({scoreDelta > 0 ? "+" : ""}{scoreDelta})</strong></div>
      </div>
      <div className="exception-summary"><span>العدد الأساسي: {profiles.filter((p) => !p.excluded && !p.freeMonthClient && p.validVisits.length >= 2).length}</span><span>النسبة المسموحة: {policy.percentage}%</span><span>اقتراحات للمراجعة: حتى {policy.suggestedLimit}</span></div>
      <div className="exception-section-title"><h3>مراجعة الاشتراكات الجديدة</h3><span className="pill">المختار {newSubscriptionIds.length}</span></div>
      {!newSubscriptionCandidates.length ? <div className="empty-state"><p>حدد فترة صحيحة بعد استيراد الملف لعرض العملاء المرشحين.</p></div> : (
        <div className="exception-list new-subscription-list">
          {newSubscriptionCandidates.map(({ profile, eligible, reason }) => {
            const checked = newSubscriptionIds.includes(profile.id);
            return <label className={`exception-item${checked ? " selected" : ""}${!eligible ? " disabled" : ""}`} key={`new-${profile.id}`}>
              <input type="checkbox" checked={checked} disabled={!eligible} onChange={() => onNewSubscriptionChange((current) => checked ? current.filter((id) => id !== profile.id) : [...current, profile.id])} />
              <span className="exception-main"><strong>{profile.name}</strong><small>{profile.id} · {reason}</small><small className="exception-impact">{eligible ? "محسوب كاشتراك جديد ما لم تلغِ التحديد." : "غير مؤهل تلقائيًا بسبب زيارة خلال الـ45 يومًا السابقة."}</small></span>
            </label>;
          })}
        </div>
      )}
      {policy.boundaryNote && <div className="notice">{policy.boundaryNote}</div>}
      <div className="exception-section-title"><h3>استثناءات العملاء</h3><span className="pill">المختار {selectedIds.length} / {policy.allowedCount}</span></div>
      {policy.allowedCount === 0 ? <div className="empty-state"><p>العدد الحالي لا يسمح باستثناء عميل كامل حسب النسبة المحسوبة دون تجاوز الحد.</p></div> : candidates.length === 0 ? <div className="empty-state"><p>لا توجد حالات مرشحة واضحة وفق البيانات الحالية.</p></div> : (
        <div className="exception-list">
          {candidates.map(({ profile, reason, impact }) => {
            const checked = selectedIds.includes(profile.id);
            return <label className={`exception-item${checked ? " selected" : ""}`} key={profile.id}>
              <input type="checkbox" checked={checked} disabled={!checked && selectedIds.length >= policy.allowedCount} onChange={() => toggle(profile.id)} />
              <span className="exception-main"><strong>{profile.name}</strong><small>{profile.id} · {reason}</small><small className="exception-impact">{impact}</small></span>
            </label>;
          })}
        </div>
      )}
      <div className="exception-section-title"><h3>إضافة عملاء الأوزان الرشيقة للنزول الأسبوعي</h3><span className="pill">المضاف {slimIds.length}</span></div>
      <p className="section-note">اختياري حسب المانيوال. هؤلاء لا يُستثنون من التقييم، بل يتم إدخالهم فقط في متوسط النزول الأسبوعي.</p>
      <div className="exception-list slim-list">
        {slimCandidates.length === 0 ? <div className="empty-state"><p>لا توجد بيانات كافية لعملاء أوزان رشيقة.</p></div> : slimCandidates.map((profile) => {
          const checked = slimIds.includes(profile.id);
          return <label className={`exception-item${checked ? " selected" : ""}`} key={`slim-${profile.id}`}>
            <input type="checkbox" checked={checked} onChange={() => toggleSlim(profile.id)} />
            <span className="exception-main"><strong>{profile.name}</strong><small>{profile.id} · أول وزن {profile.firstWeight ?? "-"} · متوسط الزيارات {profile.validVisits.length}</small><small className="exception-impact">التأثير الحالي على التقييم يظهر بالأعلى</small></span>
          </label>;
        })}
      </div>
    </div>
  );
};

const ClientTable = ({ profiles, settings }: { profiles: ReturnType<typeof buildClientProfiles>; settings: typeof defaultSettings }) => {
  const [sort, setSort] = React.useState<{ key: ClientSortKey; direction: "asc" | "desc" }>({ key: "name", direction: "asc" });
  const sortValue = (profile: ReturnType<typeof buildClientProfiles>[number], key: ClientSortKey): string | number => {
    const values: Record<ClientSortKey, string | number> = {
      name: profile.name,
      id: profile.id,
      status: clientStatus(profile, settings),
      goal: goalLabel(profile.goal),
      visits: profile.validVisits.length,
      firstWeight: profile.firstWeight ?? -Infinity,
      lastWeight: profile.lastWeight ?? -Infinity,
      minWeight: profile.minWeight ?? -Infinity,
      bmi: profile.bmi ?? -Infinity,
      progress: profile.progress,
      freeMonth: profile.freeMonthClient ? 1 : 0,
      ideal: profile.idealWeight ? 1 : 0,
      maintenance: profile.maintenance ? 1 : 0
    };
    return values[key];
  };
  const sortedProfiles = React.useMemo(() => [...profiles].sort((a, b) => {
    const left = sortValue(a, sort.key);
    const right = sortValue(b, sort.key);
    const comparison = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), "ar");
    return sort.direction === "asc" ? comparison : -comparison;
  }), [profiles, sort, settings]);
  const changeSort = (key: ClientSortKey) => setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  const SortHeader = ({ label, sortKey }: { label: string; sortKey: ClientSortKey }) => (
    <th><button className="sort-button" onClick={() => changeSort(sortKey)}>{label}<ArrowDownUp size={14} /></button></th>
  );

  return (
    <div className="panel">
      <div className="table-wrap client-table-wrap">
        <table className="clients-table">
          <thead><tr>
            <SortHeader label="العميل" sortKey="name" />
            <SortHeader label="الهوية" sortKey="id" />
            <SortHeader label="الحالة" sortKey="status" />
            <SortHeader label="الهدف" sortKey="goal" />
            <SortHeader label="الزيارات" sortKey="visits" />
            <SortHeader label="أول وزن" sortKey="firstWeight" />
            <SortHeader label="آخر وزن" sortKey="lastWeight" />
            <SortHeader label="أقل وزن" sortKey="minWeight" />
            <SortHeader label="BMI" sortKey="bmi" />
            <SortHeader label="التقدم" sortKey="progress" />
            <SortHeader label="شهر مجاني" sortKey="freeMonth" />
            <SortHeader label="مثالي" sortKey="ideal" />
            <SortHeader label="تثبيت" sortKey="maintenance" />
          </tr></thead>
          <tbody>{sortedProfiles.map((profile) => <tr key={profile.id}>
            <td>{profile.name}</td><td>{profile.id}</td><td>{clientStatus(profile, settings)}</td>
            <td>{profile.goal === "gain" ? <span className="positive-badge">{goalLabel(profile.goal)}</span> : goalLabel(profile.goal)}</td>
            <td>{profile.validVisits.length}</td><td>{profile.firstWeight ?? "-"}</td><td>{profile.lastWeight ?? "-"}</td><td>{profile.minWeight ?? "-"}</td><td>{profile.bmi ?? "-"}</td><td>{profile.progress}</td>
            <td>{profile.freeMonthClient ? <span className="positive-badge">نعم</span> : "لا"}</td><td>{profile.idealWeight ? <span className="positive-badge">نعم</span> : "لا"}</td><td>{profile.maintenance ? <span className="positive-badge">نعم</span> : "لا"}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
  );
};

const attributionStatusLabels: Record<WeightAttribution["status"], string> = {
  first_visit: "أول زيارة",
  continuation: "متابعة نفس الموظف",
  handoff: "تسليم بين موظفين",
  manual_review: "مراجعة يدوية"
};

const LeaveAttributionPanel = ({ rows }: { rows: WeightAttribution[] }) => {
  const manualRows = rows.filter((row) => row.status === "manual_review");
  return (
    <div className="panel leave-policy-panel">
      <div className="panel-title"><div><h2>إسناد الوزن أثناء الإجازات</h2><p>الزيارة لمن نفذها، والوزن/النزول لموظف الزيارة السابقة. أول وزن يُسند للموظف الحالي.</p></div><strong className="pill">مراجعة يدوية {manualRows.length}</strong></div>
      {!rows.length ? <div className="empty-state"><p>تظهر حركة إسناد الأوزان بعد استيراد ملف يحتوي على تاريخ الزيارة والوزن والأخصائي.</p></div> : (
        <div className="table-wrap leave-attribution-wrap">
          <table>
            <thead><tr><th>العميل</th><th>تاريخ الوزن</th><th>موظف الزيارة</th><th>صاحب الوزن/النزول</th><th>التغير</th><th>الحالة</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={`${row.clientId}-${row.visitDate}-${row.visitSpecialist ?? "unknown"}`} className={row.status === "manual_review" ? "missing-row" : ""}>
              <td>{row.clientName}<br /><small>{row.clientId}</small></td><td>{row.visitDate}</td><td>{row.visitSpecialist ?? "غير معروف"}</td><td>{row.weightSpecialist ?? "مطلوب تحديد"}</td><td>{row.changeKg === undefined ? "-" : `${row.changeKg} كجم`}</td><td>{attributionStatusLabels[row.status]}<br /><small>{row.reason}</small></td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const CriteriaGuide = ({ activeCase, attributionRows }: { activeCase: EvaluationCase | null; attributionRows: WeightAttribution[] }) => {
  const [guideCase, setGuideCase] = React.useState<EvaluationCase>(activeCase ?? "nutrition_specialist");
  const criteria = caseCriteria[guideCase];
  return (
    <section className="stack">
      <div className="panel">
        <h2>شرح طريقة حساب المعايير</h2>
        <p>هذا التاب يوضح مصدر كل بند وطريقة احتسابه كما يطبقها النظام، حتى تراجعه مع المانيوال.</p>
        <div className="case-grid guide-case-grid">
          {(Object.keys(caseTitles) as EvaluationCase[]).map((caseId) => <button className={guideCase === caseId ? "selected" : ""} key={caseId} onClick={() => setGuideCase(caseId)}>{caseTitles[caseId]}</button>)}
        </div>
      </div>
      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead><tr><th>المعيار</th><th>المصدر</th><th>المستهدف</th><th>الدرجة</th><th>طريقة الحساب</th></tr></thead>
            <tbody>{criteria.map((criterion) => <tr key={criterion.id}><td>{criterion.label}</td><td>{criterion.source === "device" ? "شيت جهاز الفحص" : criterion.source === "penalty" ? "جزاء يدوي" : "إدخال يدوي"}</td><td>{criterion.target}</td><td>{criterion.points}</td><td>{criterionExplanations[criterion.id] ?? "يُحسب حسب القيمة المدخلة والهدف المحدد لهذا المسار."}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <LeaveAttributionPanel rows={attributionRows} />
    </section>
  );
};

const Preview = ({ rows }: { rows: Record<string, unknown>[] }) => (
  <div className="table-wrap compact">
    <table>
      <thead><tr>{Object.keys(rows[0] ?? {}).slice(0, 8).map((key) => <th key={key}>{key}</th>)}</tr></thead>
      <tbody>{rows.slice(0, 10).map((row, index) => <tr key={index}>{Object.keys(rows[0] ?? {}).slice(0, 8).map((key) => <td key={key}>{String(row[key] ?? "")}</td>)}</tr>)}</tbody>
    </table>
  </div>
);

const ImportSummary = ({ report, visits }: { report: ReturnType<typeof importReport>; visits: NormalizedVisit[] }) => (
  <div className="kpis">
    <Kpi label="سجلات صحيحة" value={report.newRows} detail="دخلت في الحسابات" />
    <Kpi label="مكررة" value={report.duplicateRows} detail="احتفظنا بآخر قياس يومي" />
    <Kpi label="مستبعدة" value={report.excludedRows} detail="حسب بادئة 2222" />
    <Kpi label="أخطاء صفوف" value={report.invalidRows.length} detail={`${visits.length} إجمالي الزيارات الخام`} />
  </div>
);

const SettingsPanel = ({ settings, setSettings }: { settings: typeof defaultSettings; setSettings: React.Dispatch<React.SetStateAction<typeof defaultSettings>> }) => (
  <section className="stack">
    <div className="panel settings-grid">
      <label><span>فاصل الزيارة الصحيحة بالأيام</span><input type="number" value={settings.validVisitGapDays} onChange={(e) => setSettings((s) => ({ ...s, validVisitGapDays: Number(e.target.value) }))} /></label>
      <label><span>حد الكثافة</span><input type="number" value={settings.densityThreshold} onChange={(e) => setSettings((s) => ({ ...s, densityThreshold: Number(e.target.value) }))} /></label>
      <label><span>حد نزول الوزن المثالي</span><input type="number" step="0.1" value={settings.idealLossKg} onChange={(e) => setSettings((s) => ({ ...s, idealLossKg: Number(e.target.value) }))} /></label>
      <label><span>BMI الوزن المثالي</span><input type="number" step="0.1" value={settings.idealBmiMax} onChange={(e) => setSettings((s) => ({ ...s, idealBmiMax: Number(e.target.value) }))} /></label>
      <label><span>زيارات تثبيت الوزن</span><input type="number" value={settings.maintenanceVisits} onChange={(e) => setSettings((s) => ({ ...s, maintenanceVisits: Number(e.target.value) }))} /></label>
      <label><span>زيارات الشهر المجاني المطلوبة</span><input type="number" value={settings.freeMonthRequiredVisits} onChange={(e) => setSettings((s) => ({ ...s, freeMonthRequiredVisits: Number(e.target.value) }))} /></label>
      <label className="wide"><span>تعريف الكثافة</span><select value={settings.densityFormula} onChange={(e) => setSettings((s) => ({ ...s, densityFormula: e.target.value as typeof settings.densityFormula }))}><option value="reviewersAndFreeMonth">المراجعين + الشهر المجاني + المراجعين الجدد x3</option><option value="subscriptionsAndReviewerVisits">الاشتراكات الجديدة x3 + زيارات المراجعين</option></select></label>
    </div>
    <div className="panel"><h2>Snapshot إعدادات الدورة</h2><pre>{JSON.stringify(settings, null, 2)}</pre></div>
  </section>
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
