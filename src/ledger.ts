// Return ledger: arithmetic over inputs, each tagged measured or estimated.
// It cannot make a bad input valid. It shows how much of the answer rests on estimates.

export type Basis = "measured" | "estimated";
export interface Tagged { value: number; basis: Basis }
export type SavingsKind = "cash" | "capacity";

export interface LedgerEntry {
  id: string; name: string; fn: string; period: string;
  units: Tagged;               // tasks per period
  baselineMin: Tagged;         // minutes per task, manual process
  toolMin: Tagged;             // minutes per task, with the tool (hands-on)
  reviewMin: Tagged;           // minutes per task spent checking the tool's output
  baselineErr: Tagged;         // share of tasks needing correction, manual (0 to 1)
  toolErr: Tagged;             // share of tasks needing correction, with tool (0 to 1)
  reworkMin: Tagged;           // minutes to correct one error
  buildHours: Tagged;          // one-off, build and set-up
  maintHours: Tagged;          // hours per period to keep it working
  runCost: Tagged;             // money per period (licences, usage)
  rate: Tagged;                // money per hour, loaded
  periods: number;             // horizon in periods
  kind: SavingsKind;           // are freed hours cash (headcount, spend avoided) or capacity (redeployed time)
}

export interface Outcome {
  ok: boolean; issues: string[];
  netHours: number; netValue: number;
  low: number; high: number;                    // net value range with estimated inputs varied
  signStable: boolean;                          // result keeps its sign when estimated inputs are varied (a sensitivity check, not a confidence level)
  breakEvenPeriods: number | null;
  perPeriodHours: number;
  hoursPer100Units: number;
  measuredShare: number;                        // 0 to 1, share of inputs that are measured
  estimatedKeys: string[];
  cashValue: number; capacityValue: number;
  baselineMinPerPeriod: number; toolMinPerPeriod: number;
}

export const SPREAD = 0.3; // estimated inputs are varied by this share either way

export const KEYS = ["units", "baselineMin", "toolMin", "reviewMin", "baselineErr", "toolErr", "reworkMin", "buildHours", "maintHours", "runCost", "rate"] as const;
export type Key = typeof KEYS[number];
export const LABELS: Record<Key, string> = {
  units: "Tasks per month", baselineMin: "Manual minutes per task", toolMin: "Tool minutes per task (hands-on)", reviewMin: "Review minutes per task",
  baselineErr: "Manual error rate", toolErr: "Tool error rate", reworkMin: "Minutes to fix one error", buildHours: "Build hours (one-off)",
  maintHours: "Maintenance hours per month", runCost: "Run cost per month (cost units)", rate: "Loaded cost per hour (cost units)",
};

type Vals = Record<Key, number>;

function core(v: Vals, periods: number) {
  const baselineMin = v.units * (v.baselineMin + v.baselineErr * v.reworkMin);
  const toolMin = v.units * (v.toolMin + v.reviewMin + v.toolErr * v.reworkMin) + v.maintHours * 60;
  const perPeriodMin = baselineMin - toolMin;
  const netHours = (perPeriodMin * periods) / 60 - v.buildHours;
  const netValue = netHours * v.rate - v.runCost * periods;
  return { baselineMin, toolMin, perPeriodMin, netHours, netValue };
}

export function validate(e: LedgerEntry): string[] {
  const issues: string[] = [];
  for (const k of KEYS) {
    const t = e[k];
    if (!t || typeof t.value !== "number" || !Number.isFinite(t.value)) issues.push(LABELS[k] + " is blank or not a number. Blank is not treated as zero. Enter 0 only if you know it is zero.");
    else if (t.value < 0) issues.push(LABELS[k] + " cannot be negative.");
  }
  if (!Number.isFinite(e.periods) || e.periods <= 0) issues.push("The horizon must be at least one period.");
  for (const k of ["baselineErr", "toolErr"] as const) if (e[k] && Number.isFinite(e[k].value) && e[k].value > 1) issues.push(LABELS[k] + " is a share between 0 and 1.");
  if (e.units && Number.isFinite(e.units.value) && e.units.value === 0) issues.push("Tasks per month is zero, so there is nothing to compare.");
  return issues;
}

export function evaluate(e: LedgerEntry): Outcome {
  const issues = validate(e);
  const empty: Outcome = { ok: false, issues, netHours: 0, netValue: 0, low: 0, high: 0, signStable: false, breakEvenPeriods: null, perPeriodHours: 0, hoursPer100Units: 0, measuredShare: 0, estimatedKeys: [], cashValue: 0, capacityValue: 0, baselineMinPerPeriod: 0, toolMinPerPeriod: 0 };
  if (issues.length) return empty;
  const v = {} as Vals; KEYS.forEach((k) => { v[k] = e[k].value; });
  const est = KEYS.filter((k) => e[k].basis === "estimated");
  const c = core(v, e.periods);
  // Corner enumeration: every estimated input at its low and high end.
  let low = c.netValue, high = c.netValue;
  const n = est.length;
  for (let mask = 0; mask < (1 << n); mask++) {
    const w: Vals = { ...v };
    est.forEach((k, i) => { w[k] = v[k] * ((mask >> i) & 1 ? 1 + SPREAD : 1 - SPREAD); });
    if (w.baselineErr > 1) w.baselineErr = 1; if (w.toolErr > 1) w.toolErr = 1;
    const r = core(w, e.periods).netValue;
    if (r < low) low = r; if (r > high) high = r;
  }
  const perPeriodValue = (c.perPeriodMin / 60) * v.rate - v.runCost;
  const buildCost = v.buildHours * v.rate;
  const breakEven = perPeriodValue > 0 ? buildCost / perPeriodValue : (buildCost === 0 && perPeriodValue >= 0 ? 0 : null);
  const measuredShare = (KEYS.length - est.length) / KEYS.length;
  const value = c.netValue;
  return {
    ok: true, issues: [], netHours: c.netHours, netValue: value, low, high, signStable: low > 0 || high < 0,
    breakEvenPeriods: breakEven, perPeriodHours: c.perPeriodMin / 60, hoursPer100Units: (c.perPeriodMin / 60) / (v.units / 100),
    measuredShare, estimatedKeys: est.map((k) => LABELS[k]),
    cashValue: e.kind === "cash" ? value : 0, capacityValue: e.kind === "capacity" ? value : 0,
    baselineMinPerPeriod: c.baselineMin, toolMinPerPeriod: c.toolMin,
  };
}

export function money(n: number): string {
  const s = Math.abs(Math.round(n)).toLocaleString("en-US");
  return (n < 0 ? "-" : "") + s;
}
export function hours(n: number): string { return (Math.round(n * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 }); }
