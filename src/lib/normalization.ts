import { differenceInCalendarDays, parse, parseISO } from "date-fns";
import type { ClientGoal, EvaluationSettings, NormalizedVisit, RawVisit } from "../types";

export const normalizePhone = (value: string | number | undefined): string => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00971")) return digits.slice(2);
  if (digits.startsWith("971")) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `971${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith("5")) return `971${digits}`;
  return digits;
};

export const parseExcelDate = (value: unknown): Date | undefined => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + value);
    return epoch;
  }
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  const iso = parseISO(text);
  if (!Number.isNaN(iso.getTime())) return iso;
  const candidates = ["dd/MM/yyyy", "MM/dd/yyyy", "dd-MM-yyyy", "MM-dd-yyyy", "yyyy/MM/dd"];
  for (const format of candidates) {
    const parsed = parse(text, format, new Date());
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return undefined;
};

export const toIsoDate = (value: unknown): string => {
  const date = parseExcelDate(value);
  if (!date) return "";
  return date.toISOString().slice(0, 10);
};

export const normalizeGoal = (value: unknown): ClientGoal => {
  const text = String(value ?? "").toLowerCase();
  if (/gain|زيادة|زياده/.test(text)) return "gain";
  if (/athletic|sport|رياضي|رياضة|رياضه/.test(text)) return "athletic";
  if (/maintain|تثبيت/.test(text)) return "maintain";
  if (/ideal|مثالي/.test(text)) return "ideal";
  if (/other|اخر|آخر/.test(text)) return "other";
  return "loss";
};

export const calculateBmi = (weight?: number, height?: number): number | undefined => {
  if (!weight || !height) return undefined;
  const meters = height > 3 ? height / 100 : height;
  if (meters <= 0) return undefined;
  return Number((weight / (meters * meters)).toFixed(2));
};

const dateTimeRank = (visit: RawVisit) => `${visit.visitDate}T${visit.visitTime || "00:00"}`;

export const normalizeVisits = (visits: RawVisit[], settings: EvaluationSettings): NormalizedVisit[] => {
  const sorted = [...visits].sort((a, b) => dateTimeRank(a).localeCompare(dateTimeRank(b)));
  const sameDayLatest = new Map<string, RawVisit>();

  for (const visit of sorted) {
    const id = normalizePhone(visit.clientId);
    sameDayLatest.set(`${id}|${visit.visitDate}`, visit);
  }

  const lastValidByClient = new Map<string, string>();
  return sorted.map((visit) => {
    const normalizedClientId = normalizePhone(visit.clientId);
    const excluded = settings.excludedPrefixes.some((prefix) => normalizedClientId.startsWith(prefix));
    const freeMonthClient = visit.freeMonth || settings.freeMonthPrefixes.some((prefix) => normalizedClientId.startsWith(prefix));
    const duplicateSameDay = sameDayLatest.get(`${normalizedClientId}|${visit.visitDate}`) !== visit;
    const visitDate = parseExcelDate(visit.visitDate);
    let invalidReason = "";
    let validVisit = Boolean(normalizedClientId && visitDate && !excluded && !duplicateSameDay);

    if (!normalizedClientId) invalidReason = "رقم العميل أو الهاتف مفقود";
    if (!visitDate) invalidReason = "تاريخ الزيارة غير صالح";
    if (duplicateSameDay) invalidReason = "زيارة مكررة لنفس العميل في نفس اليوم";
    if (excluded) invalidReason = "عميل مستبعد حسب بادئة الرقم";

    const lastValidDate = lastValidByClient.get(normalizedClientId);
    if (validVisit && lastValidDate && differenceInCalendarDays(visitDate!, parseISO(lastValidDate)) < settings.validVisitGapDays) {
      validVisit = false;
      invalidReason = `الفاصل أقل من ${settings.validVisitGapDays} أيام من آخر زيارة صحيحة`;
    }

    if (validVisit) lastValidByClient.set(normalizedClientId, visit.visitDate);

    return {
      ...visit,
      normalizedClientId,
      bmi: calculateBmi(visit.weight, visit.height),
      excluded,
      freeMonthClient,
      validVisit,
      duplicateSameDay,
      invalidReason: invalidReason || undefined
    };
  });
};

export const achievedPoints = (achieved: number, target: number, points: number): number => {
  if (target <= 0) return 0;
  return Number(Math.min(points, (achieved * points) / target).toFixed(2));
};

export const targetBandIndex = (target: number): 0 | 1 | 2 | 3 => {
  if (target <= 0.9) return 0;
  if (target <= 1.5) return 1;
  if (target <= 2.4) return 2;
  return 3;
};
