export type BranchDensity = "high" | "low";
export type EmployeeRole = "nutrition_specialist" | "supplement_specialist" | "supplement_consultant";
export type ClientGoal = "loss" | "gain" | "athletic" | "maintain" | "ideal" | "other";
export type DensityFormula = "reviewersAndFreeMonth" | "subscriptionsAndReviewerVisits";
export type EvaluationCase = "nutrition_specialist" | "supplement_consultant_two_employees" | "supplement_consultant_single_employee";

export interface EvaluationCycle {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  workingDays: number;
}

export interface Branch {
  id: string;
  name: string;
  densityOverride?: BranchDensity;
  targetRevenue: number;
}

export interface Employee {
  id: string;
  name: string;
  role: EmployeeRole;
  branchId: string;
  currentTarget: number;
  staffId?: string;
  annualLeaveDays?: number;
  adminScore?: number;
  scientificScore?: number;
}

export interface ColumnMapping {
  clientName?: string;
  clientId?: string;
  visitDate?: string;
  visitTime?: string;
  weight?: string;
  height?: string;
  specialist?: string;
  salesEmployee?: string;
  branch?: string;
  customerGoal?: string;
  visitType?: string;
  freeMonth?: string;
  program?: string;
  products?: string;
  notes?: string;
}

export interface RawVisit {
  sourceFile: string;
  rowNumber: number;
  clientName: string;
  clientId: string;
  visitDate: string;
  visitTime?: string;
  weight?: number;
  height?: number;
  specialist?: string;
  salesEmployee?: string;
  branch?: string;
  customerGoal: ClientGoal;
  visitType?: string;
  freeMonth?: boolean;
  program?: string;
  products?: string;
  notes?: string;
}

export interface NormalizedVisit extends RawVisit {
  normalizedClientId: string;
  bmi?: number;
  excluded: boolean;
  freeMonthClient: boolean;
  validVisit: boolean;
  duplicateSameDay: boolean;
  invalidReason?: string;
}

export interface ClientProfile {
  id: string;
  name: string;
  height?: number;
  goal: ClientGoal;
  visits: NormalizedVisit[];
  validVisits: NormalizedVisit[];
  firstWeight?: number;
  lastWeight?: number;
  minWeight?: number;
  progress: number;
  bmi?: number;
  reviewer: boolean;
  freeMonthClient: boolean;
  freeMonthEligible: boolean;
  idealWeight: boolean;
  maintenance: boolean;
  excluded: boolean;
  manualExcluded?: boolean;
  manualSlimIncluded?: boolean;
}

export interface EvaluationSettings {
  excludedPrefixes: string[];
  freeMonthPrefixes: string[];
  freeMonthRequiredVisits: number;
  validVisitGapDays: number;
  densityThreshold: number;
  densityFormula: DensityFormula;
  idealLossKg: number;
  idealBmiMax: number;
  maintenanceVisits: number;
  maintenanceBmiMax: number;
  maintenanceMode: "last" | "consecutive";
  highWeightCwfBufferPct: number;
  impactfulBrands: string[];
  criteria: EvaluationCriterion[];
  targetAdjustment: TargetAdjustmentTable;
}

export interface EvaluationCriterion {
  id: string;
  label: string;
  target: number;
  points: number;
  appliesTo: EmployeeRole[];
}

export interface TargetAdjustmentRow {
  min: number;
  max?: number;
  values: [number, number, number, number];
}

export interface TargetAdjustmentTable {
  increase: TargetAdjustmentRow[];
  decrease: TargetAdjustmentRow[];
}

export interface BranchMetrics {
  branchId: string;
  branchName: string;
  density: number;
  densityClass: BranchDensity;
  clients: number;
  reviewers: number;
  validVisits: number;
  freeMonthClients: number;
  idealWeight: number;
  maintenance: number;
  totalLossKg: number;
  averageVisits: number;
  targetRevenue: number;
  achievedRevenue: number;
  targetAchievement: number;
}

export interface EmployeeEvaluation {
  employee: Employee;
  branch: Branch;
  path: string;
  score: number;
  achievementPct: number;
  targetDelta: number;
  newTarget: number;
  rows: EvaluationRow[];
  incentive?: number;
}

export interface EvaluationRow {
  label: string;
  achieved: number;
  target: number;
  points: number;
  earned: number;
  source: string;
}

export interface ImportReport {
  newRows: number;
  duplicateRows: number;
  excludedRows: number;
  invalidRows: { rowNumber: number; reason: string }[];
}

export interface CriteriaMetric {
  id: string;
  label: string;
  value: number;
  format?: "number" | "decimal" | "percent" | "kg";
}
