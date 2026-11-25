import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, validate, KEYS } from "../dist/ledger.js";
import { LEDGER_SCENARIOS } from "../dist/scenarios.js";

const T = (value, basis = "measured") => ({ value, basis });
const base = (over = {}) => ({ id: "x", name: "X", fn: "F", period: "month", units: T(100), baselineMin: T(10), toolMin: T(2), reviewMin: T(1), baselineErr: T(0.1), toolErr: T(0.05), reworkMin: T(10), buildHours: T(10), maintHours: T(1), runCost: T(0), rate: T(60), periods: 12, kind: "capacity", ...over });
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, a + " vs " + b);

test("hand-worked example: 128 net hours and 7,680 net value over 12 months", () => {
  // manual: 100 * (10 + 0.1*10) = 1100 min. tool: 100 * (2 + 1 + 0.05*10) + 60 = 410 min. saving 690 min = 11.5 h a month.
  const o = evaluate(base());
  close(o.perPeriodHours, 11.5); close(o.netHours, 11.5 * 12 - 10); close(o.netValue, 128 * 60);
  close(o.baselineMinPerPeriod, 1100); close(o.toolMinPerPeriod, 410);
});
test("break-even: build cost 600 over 690 a month is about 0.87 months", () => { close(evaluate(base()).breakEvenPeriods, 600 / 690); });
test("all-measured entry has no range and a measured share of 1", () => {
  const o = evaluate(base()); close(o.low, o.netValue); close(o.high, o.netValue); assert.equal(o.measuredShare, 1); assert.equal(o.estimatedKeys.length, 0);
});
test("estimated inputs widen the range around the central value", () => {
  const o = evaluate(base({ reviewMin: T(1, "estimated"), toolErr: T(0.05, "estimated"), reworkMin: T(10, "estimated") }));
  assert.ok(o.low < o.netValue && o.netValue < o.high); assert.equal(o.estimatedKeys.length, 3);
});
test("a tool that is slower than the manual process shows a loss and never breaks even", () => {
  const o = evaluate(base({ toolMin: T(30) })); assert.ok(o.netValue < 0); assert.equal(o.breakEvenPeriods, null); assert.equal(o.signStable, true);
});
test("range crossing zero is not called certain", () => {
  const o = evaluate(base({ baselineMin: T(2.2, "estimated"), toolMin: T(2, "estimated"), buildHours: T(10, "estimated") }));
  assert.equal(o.signStable, o.low > 0 || o.high < 0);
});
test("more review time always lowers the net value (monotonic)", () => {
  let prev = Infinity; for (const r of [0, 1, 2, 4, 8]) { const v = evaluate(base({ reviewMin: T(r) })).netValue; assert.ok(v < prev); prev = v; }
});
test("net hours per 100 tasks is unchanged when volume scales and there is no upkeep", () => {
  const a = evaluate(base({ maintHours: T(0) })), b = evaluate(base({ maintHours: T(0), units: T(300) })); close(a.hoursPer100Units, b.hoursPer100Units);
});
test("run cost and rate change value but not hours", () => {
  const a = evaluate(base()), b = evaluate(base({ runCost: T(100), rate: T(120) })); close(a.netHours, b.netHours); assert.notEqual(a.netValue, b.netValue);
});
test("cash and capacity are kept in separate fields", () => {
  const c = evaluate(base({ kind: "cash" })), k = evaluate(base({ kind: "capacity" }));
  assert.equal(c.capacityValue, 0); assert.ok(c.cashValue > 0); assert.equal(k.cashValue, 0); assert.ok(k.capacityValue > 0);
});
test("bad inputs are reported, never computed: missing, negative, NaN, share above 1, zero volume, zero horizon", () => {
  assert.ok(validate(base({ units: T(NaN) })).length);
  assert.ok(validate(base({ buildHours: T(-1) })).length);
  assert.ok(validate(base({ toolErr: T(1.5) })).length);
  assert.ok(validate(base({ units: T(0) })).some((i) => /zero/.test(i)));
  assert.ok(validate(base({ periods: 0 })).length);
  for (const bad of [base({ units: T(NaN) }), base({ units: T(0) }), base({ periods: NaN })]) { const o = evaluate(bad); assert.equal(o.ok, false); assert.equal(o.netValue, 0); }
  const missing = base(); delete missing.rate; assert.ok(validate(missing).length);
});
test("synthetic ledger scenarios compute, and the honest ones stay uncertain", () => {
  for (const e of LEDGER_SCENARIOS) { const o = evaluate(e); assert.equal(o.ok, true); assert.ok(Number.isFinite(o.netValue)); }
  const onboarding = evaluate(LEDGER_SCENARIOS.find((e) => e.id === "onboarding")); assert.equal(onboarding.measuredShare < 0.2, true); assert.equal(onboarding.signStable, false);
  const ops = evaluate(LEDGER_SCENARIOS.find((e) => e.id === "ops")); assert.equal(ops.signStable, false);
});
test("fuzz: 1000 random valid entries give finite results with low <= value <= high", () => {
  let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 1000; i++) {
    const e = base({ periods: 1 + Math.floor(rnd() * 24) });
    for (const k of KEYS) { const share = k === "baselineErr" || k === "toolErr"; e[k] = T(share ? rnd() : rnd() * 100 + (k === "units" ? 1 : 0), rnd() < 0.5 ? "measured" : "estimated"); }
    const o = evaluate(e);
    assert.ok(o.ok); for (const v of [o.netValue, o.low, o.high, o.netHours, o.hoursPer100Units]) assert.ok(Number.isFinite(v));
    assert.ok(o.low <= o.netValue + 1e-6 && o.netValue <= o.high + 1e-6);
  }
});
test("blank (NaN) cost inputs are rejected, never treated as zero", () => {
  for (const k of ["runCost", "maintHours", "buildHours", "rate"]) { const o = evaluate(base({ [k]: T(NaN) })); assert.equal(o.ok, false); assert.match(o.issues[0], /not treated as zero/); }
});
