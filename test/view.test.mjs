import test from "node:test";
import assert from "node:assert/strict";
import { analyzeRepo, reportToJson } from "../dist/gates.js";
import { evaluate } from "../dist/ledger.js";
import { REPO_SCENARIOS, LEDGER_SCENARIOS } from "../dist/scenarios.js";
import { esc, renderReport, renderOutcome, ledgerForm, renderCompare } from "../dist/view.js";

const KEY = "sk-SYNTHETICEXAMPLEDONOTUSE000000";
test("esc escapes html", () => { assert.equal(esc('<b>"x" & \'y\'</b>'), "&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;"); });
test("file names and tool names cannot inject markup", () => {
  const r = analyzeRepo([{ path: "<img src=x onerror=alert(1)>.js", content: "eval(1)" }]);
  const h = renderReport(r, "<script>1</script>");
  assert.ok(!/<img|<script/i.test(h));
});
test("report html never contains a matched secret value", () => {
  for (const s of REPO_SCENARIOS) assert.ok(!renderReport(analyzeRepo(s.files), s.name).includes(KEY));
  const j = reportToJson(analyzeRepo(REPO_SCENARIOS.find((s) => s.id === "ops-weaker").files)); assert.ok(!j.includes(KEY));
  assert.ok(JSON.parse(j).gates.length > 10);
});
test("blocked and human-review banners use different wording, neither says approved", () => {
  const b = renderReport(analyzeRepo(REPO_SCENARIOS.find((s) => s.id === "invoice-weaker").files), "x");
  const g = renderReport(analyzeRepo(REPO_SCENARIOS.find((s) => s.id === "invoice-stronger").files), "x");
  assert.match(b, /Blocked by these gates/); assert.match(g, /Human review still required/); assert.ok(!/approved/i.test(b + g));
});
test("empty report renders the nothing-to-review state", () => { assert.match(renderReport(analyzeRepo([]), "x"), /Nothing to review yet/); });
test("outcome renders for every scenario without NaN or undefined", () => {
  for (const e of LEDGER_SCENARIOS) { const h = renderOutcome(e); assert.ok(!/NaN|undefined|Infinity/.test(h)); assert.match(h, /SYNTHETIC DEMO/); assert.ok(!/evidence grade|certain/i.test(h)); }
});
test("outcome says the range includes zero when it does", () => {
  const e = LEDGER_SCENARIOS.find((x) => x.id === "onboarding"); assert.match(renderOutcome(e), /range includes zero/);
});
test("invalid ledger input shows the issues instead of numbers", () => {
  const e = structuredClone(LEDGER_SCENARIOS[0]); e.units.value = 0; const h = renderOutcome(e); assert.match(h, /Cannot compute/); assert.ok(!/net hours/.test(h));
});
test("ledger form has a measured/estimated control for each of the 11 inputs", () => {
  const h = ledgerForm(LEDGER_SCENARIOS[0]); assert.equal((h.match(/data-basis=/g) || []).length, 11);
});
test("compare keeps cash and capacity totals apart and lists gate results", () => {
  const rows = LEDGER_SCENARIOS.map((e) => ({ entry: e, outcome: evaluate(e), gates: [{ label: "weaker", outcome: "3 failed" }] }));
  const h = renderCompare(rows); assert.match(h, /Cash: /); assert.match(h, /Capacity: /); assert.match(h, /not added together/); assert.match(h, /weaker: 3 failed/);
});
test("range bar positions stay within 0 to 100 percent", () => {
  for (const e of LEDGER_SCENARIOS) for (const m of renderOutcome(e).matchAll(/left:([\d.]+)%/g)) assert.ok(Number(m[1]) >= 0 && Number(m[1]) <= 100);
});

test("an all-estimated entry says no measured-only return can be given", () => {
  const e = structuredClone(LEDGER_SCENARIOS[0]); for (const k of Object.keys(e)) if (e[k] && e[k].basis) e[k].basis = "estimated";
  assert.match(renderOutcome(e), /cannot give a measured-only net return/);
});
