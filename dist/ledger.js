// Return ledger: arithmetic over inputs, each tagged measured or estimated.
// It cannot make a bad input valid. It shows how much of the answer rests on estimates.
export const SPREAD = 0.3; // estimated inputs are varied by this share either way
export const KEYS = ["units", "baselineMin", "toolMin", "reviewMin", "baselineErr", "toolErr", "reworkMin", "buildHours", "maintHours", "runCost", "rate"];
export const LABELS = {
    units: "Tasks per month", baselineMin: "Manual minutes per task", toolMin: "Tool minutes per task (hands-on)", reviewMin: "Review minutes per task",
    baselineErr: "Manual error rate", toolErr: "Tool error rate", reworkMin: "Minutes to fix one error", buildHours: "Build hours (one-off)",
    maintHours: "Maintenance hours per month", runCost: "Run cost per month (cost units)", rate: "Loaded cost per hour (cost units)",
};
function core(v, periods) {
    const baselineMin = v.units * (v.baselineMin + v.baselineErr * v.reworkMin);
    const toolMin = v.units * (v.toolMin + v.reviewMin + v.toolErr * v.reworkMin) + v.maintHours * 60;
    const perPeriodMin = baselineMin - toolMin;
    const netHours = (perPeriodMin * periods) / 60 - v.buildHours;
    const netValue = netHours * v.rate - v.runCost * periods;
    return { baselineMin, toolMin, perPeriodMin, netHours, netValue };
}
export function validate(e) {
    const issues = [];
    for (const k of KEYS) {
        const t = e[k];
        if (!t || typeof t.value !== "number" || !Number.isFinite(t.value))
            issues.push(LABELS[k] + " is blank or not a number. Blank is not treated as zero. Enter 0 only if you know it is zero.");
        else if (t.value < 0)
            issues.push(LABELS[k] + " cannot be negative.");
    }
    if (!Number.isFinite(e.periods) || e.periods <= 0)
        issues.push("The horizon must be at least one period.");
    for (const k of ["baselineErr", "toolErr"])
        if (e[k] && Number.isFinite(e[k].value) && e[k].value > 1)
            issues.push(LABELS[k] + " is a share between 0 and 1.");
    if (e.units && Number.isFinite(e.units.value) && e.units.value === 0)
        issues.push("Tasks per month is zero, so there is nothing to compare.");
    return issues;
}
export function evaluate(e) {
    const issues = validate(e);
    const empty = { ok: false, issues, netHours: 0, netValue: 0, low: 0, high: 0, signStable: false, breakEvenPeriods: null, perPeriodHours: 0, hoursPer100Units: 0, measuredShare: 0, estimatedKeys: [], cashValue: 0, capacityValue: 0, baselineMinPerPeriod: 0, toolMinPerPeriod: 0 };
    if (issues.length)
        return empty;
    const v = {};
    KEYS.forEach((k) => { v[k] = e[k].value; });
    const est = KEYS.filter((k) => e[k].basis === "estimated");
    const c = core(v, e.periods);
    // Corner enumeration: every estimated input at its low and high end.
    let low = c.netValue, high = c.netValue;
    const n = est.length;
    for (let mask = 0; mask < (1 << n); mask++) {
        const w = { ...v };
        est.forEach((k, i) => { w[k] = v[k] * ((mask >> i) & 1 ? 1 + SPREAD : 1 - SPREAD); });
        if (w.baselineErr > 1)
            w.baselineErr = 1;
        if (w.toolErr > 1)
            w.toolErr = 1;
        const r = core(w, e.periods).netValue;
        if (r < low)
            low = r;
        if (r > high)
            high = r;
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
export function money(n) {
    const s = Math.abs(Math.round(n)).toLocaleString("en-US");
    return (n < 0 ? "-" : "") + s;
}
export function hours(n) { return (Math.round(n * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 }); }
