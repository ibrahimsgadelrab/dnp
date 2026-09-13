import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { ColumnMapping, RawVisit } from "../types";
import { normalizeGoal, toIsoDate } from "./normalization";

const aliases: Record<keyof ColumnMapping, string[]> = {
  clientName: ["client name", "customer name", "name", "اسم العميل", "العميل"],
  clientId: ["client id", "phone", "mobile", "رقم العميل", "رقم الهاتف", "الهاتف", "id"],
  visitDate: ["visit date", "date", "تاريخ الزيارة", "التاريخ"],
  visitTime: ["visit time", "time", "وقت الزيارة", "الوقت"],
  weight: ["weight", "وزن", "الوزن"],
  height: ["height", "طول", "الطول"],
  specialist: ["specialist", "nutritionist", "الأخصائي", "الاخصائي"],
  salesEmployee: ["sales employee", "sales", "موظف المبيعات"],
  branch: ["branch", "الفرع"],
  customerGoal: ["customer goal", "goal", "هدف العميل", "الهدف"],
  visitType: ["visit type", "نوع الزيارة"],
  freeMonth: ["free month", "الشهر المجاني"],
  program: ["program", "البرنامج"],
  products: ["products", "product", "المنتجات"],
  notes: ["notes", "ملاحظات", "الملاحظات"]
};

export const guessMapping = (headers: string[]): ColumnMapping => {
  const normalized = headers.map((header) => ({ header, key: header.trim().toLowerCase() }));
  return Object.entries(aliases).reduce((mapping, [field, list]) => {
    const match = normalized.find(({ key }) => list.some((alias) => key.includes(alias)));
    if (match) mapping[field as keyof ColumnMapping] = match.header;
    return mapping;
  }, {} as ColumnMapping);
};

export const parseFile = async (file: File): Promise<{ rows: Record<string, unknown>[]; headers: string[] }> => {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv") {
    const text = await file.text();
    const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
    const headers = parsed.meta.fields ?? Object.keys(parsed.data[0] ?? {});
    return { rows: parsed.data, headers };
  }
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
  return { rows, headers: Object.keys(rows[0] ?? {}) };
};

export const rowsToVisits = (rows: Record<string, unknown>[], mapping: ColumnMapping, sourceFile: string): RawVisit[] => {
  const pick = (row: Record<string, unknown>, key?: string) => (key ? row[key] : undefined);
  return rows.map((row, index) => ({
    sourceFile,
    rowNumber: index + 2,
    clientName: String(pick(row, mapping.clientName) ?? "").trim(),
    clientId: String(pick(row, mapping.clientId) ?? "").trim(),
    visitDate: toIsoDate(pick(row, mapping.visitDate)),
    visitTime: String(pick(row, mapping.visitTime) ?? "").trim(),
    weight: Number(pick(row, mapping.weight)) || undefined,
    height: Number(pick(row, mapping.height)) || undefined,
    specialist: String(pick(row, mapping.specialist) ?? "").trim(),
    salesEmployee: String(pick(row, mapping.salesEmployee) ?? "").trim(),
    branch: String(pick(row, mapping.branch) ?? "").trim(),
    customerGoal: normalizeGoal(pick(row, mapping.customerGoal)),
    visitType: String(pick(row, mapping.visitType) ?? "").trim(),
    freeMonth: /yes|true|نعم|مجاني/i.test(String(pick(row, mapping.freeMonth) ?? "")),
    program: String(pick(row, mapping.program) ?? "").trim(),
    products: String(pick(row, mapping.products) ?? "").trim(),
    notes: String(pick(row, mapping.notes) ?? "").trim()
  }));
};
