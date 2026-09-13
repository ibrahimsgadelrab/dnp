import type { NormalizedVisit } from "../types";

export type WeightAttributionStatus = "first_visit" | "continuation" | "handoff" | "manual_review";

export type WeightAttribution = {
  clientId: string;
  clientName: string;
  visitDate: string;
  visitSpecialist?: string;
  weightSpecialist?: string;
  previousWeight?: number;
  currentWeight?: number;
  previousVisitDate?: string;
  daysSincePrevious?: number;
  changeKg?: number;
  status: WeightAttributionStatus;
  reason: string;
};

const specialistName = (value?: string) => value?.trim() || undefined;

export const buildWeightAttributions = (visits: NormalizedVisit[]): WeightAttribution[] => {
  const grouped = new Map<string, NormalizedVisit[]>();
  visits.filter((visit) => visit.validVisit && typeof visit.weight === "number").forEach((visit) => {
    const current = grouped.get(visit.normalizedClientId) ?? [];
    current.push(visit);
    grouped.set(visit.normalizedClientId, current);
  });

  return [...grouped.values()].flatMap((clientVisits) => {
    const ordered = [...clientVisits].sort((a, b) => `${a.visitDate}T${a.visitTime ?? ""}`.localeCompare(`${b.visitDate}T${b.visitTime ?? ""}`));
    return ordered.map((visit, index) => {
      const previous = ordered[index - 1];
      const currentSpecialist = specialistName(visit.specialist);
      const previousSpecialist = specialistName(previous?.specialist);
      const weightSpecialist = previous ? previousSpecialist : currentSpecialist;
      let status: WeightAttributionStatus;
      let reason: string;

      if (!currentSpecialist && previous) {
        status = "manual_review";
        reason = "اسم منفذ الزيارة الحالية غير موجود، لذلك يلزم تحديد المسؤول يدويًا.";
      } else if (!weightSpecialist) {
        status = "manual_review";
        reason = "لا يوجد اسم موظف كافٍ لإسناد الوزن.";
      } else if (!previous) {
        status = "first_visit";
        reason = "لا توجد زيارة سابقة، لذلك أُسند الوزن للموظف الحالي.";
      } else if (previousSpecialist !== currentSpecialist) {
        status = "handoff";
        reason = "الوزن أُسند لموظف الزيارة السابقة، والزيارة الحالية لموظف آخر.";
      } else {
        status = "continuation";
        reason = "الوزن أُسند لموظف الزيارة السابقة ضمن متابعة نفس المسار.";
      }

      return {
        clientId: visit.normalizedClientId,
        clientName: visit.clientName,
        visitDate: visit.visitDate,
        visitSpecialist: currentSpecialist,
        weightSpecialist,
        previousWeight: previous?.weight,
        currentWeight: visit.weight,
        previousVisitDate: previous?.visitDate,
        daysSincePrevious: previous?.visitDate ? Math.max(1, Math.round((new Date(`${visit.visitDate}T00:00:00`).getTime() - new Date(`${previous.visitDate}T00:00:00`).getTime()) / 86400000)) : undefined,
        changeKg: previous?.weight !== undefined && visit.weight !== undefined ? Number((previous.weight - visit.weight).toFixed(2)) : undefined,
        status,
        reason
      };
    });
  }).sort((a, b) => a.visitDate.localeCompare(b.visitDate));
};
