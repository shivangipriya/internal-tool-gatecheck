import { analyzeRepo, reportToJson } from "./gates.js";
import type { GateReport, RepoFile } from "./gates.js";
import { evaluate } from "./ledger.js";
import type { LedgerEntry, Key } from "./ledger.js";
import { KEYS } from "./ledger.js";
import { REPO_SCENARIOS, LEDGER_SCENARIOS } from "./scenarios.js";
import { renderReport, renderOutcome, ledgerForm, renderCompare, esc } from "./view.js";
import type { CompareRow } from "./view.js";

const copy = <T,>(o: T): T => JSON.parse(JSON.stringify(o)) as T;
const $ = <T extends Element = HTMLElement>(sel: string): T => { const el = document.querySelector<T>(sel); if (!el) throw new Error("Missing element: " + sel); return el; };

let report: GateReport = analyzeRepo(REPO_SCENARIOS[1].files);
let reportName = REPO_SCENARIOS[1].name;
let reportNote = "";
const ledger: LedgerEntry[] = copy(LEDGER_SCENARIOS);
let selected = ledger[0].id;
const entry = (): LedgerEntry => ledger.find((e) => e.id === selected) ?? ledger[0];

const SKIP_DIRS = /(^|\/)(node_modules|\.git|dist|build|\.venv|venv|__pycache__)\//;
const TEXT_EXT = /\.(js|mjs|cjs|ts|tsx|jsx|py|rb|go|java|sh|ps1|php|json|md|txt|toml|yaml|yml|cfg|ini|lock|env|gitignore)$|(^|\/)(\.env[^/]*|\.gitignore|Makefile|CODEOWNERS|README[^/]*|LICENSE[^/]*|requirements[^/]*\.txt)$/i;
export const MAX_FILES = 400, MAX_BYTES = 200_000;

function build(): void {
  $("#app").innerHTML = `
<nav class="top" aria-label="Sections"><a class="brand" href="#top">Gate check and return ledger</a><span class="links"><a href="#review">Review a tool</a><a href="#ledger">Return ledger</a><a href="#compare">Compare</a><a href="#limits">Limits</a></span></nav>
<header class="hero" id="top"><p class="eyebrow">Prototype for one question: when an internal tool is built with AI, how do you know it is dependable and what did it return?</p>
<h1>Check the controls. Count the return. Show which numbers are measured.</h1>
<p class="lede">Part one runs control-gate checks over a small internal tool's files and says plainly what each check can and cannot tell you. Part two is a return ledger that counts build, review, rework and upkeep, and marks every input as measured or estimated. Everything runs in your browser. All examples are synthetic.</p>
<div class="row-actions"><a class="btn primary" href="#review">Review a sample tool</a><a class="btn secondary" href="#ledger">Open the ledger</a></div>
<ul class="chips"><li>Strict TypeScript</li><li>Runs in your browser</li><li>Synthetic data only</li><li>Not a security assurance</li></ul></header>
<section class="block" id="review"><h2>Review a tool</h2><p class="sub">Pick a synthetic tool, or choose a folder from your own computer. Files are read here and never uploaded.</p>
<div class="cards">${REPO_SCENARIOS.map((s) => `<button type="button" class="card" data-repo="${esc(s.id)}"><span class="tag ${s.quality}">${s.quality}</span><strong>${esc(s.fn)}: ${esc(s.name.replace(/ \((stronger|weaker)\)/, ""))}</strong><span>${esc(s.blurb)}</span></button>`).join("")}</div>
<div class="callout"><strong>Your own folder</strong><p>Choose a project folder. Dependency and build folders are skipped, files over 200 KB are skipped, and nothing leaves this page. If a secret pattern matches, only the file and line are shown, never the value.</p>
<label class="btn secondary filebtn">Choose a folder<input id="pick" type="file" webkitdirectory multiple hidden></label> <span id="pick-note" role="status"></span></div>
<div id="report" aria-live="polite"></div>
<div class="row-actions"><button type="button" class="btn secondary" id="dl">Download report as JSON</button><span class="caption">The file holds gate results and file paths only. No file contents.</span></div></section>
<section class="block" id="ledger"><h2>Return ledger</h2><p class="sub">Enter what you know. Tag each input as measured (from records) or estimated (a judgement). Estimated inputs are varied by 30% either way to show how much the answer depends on them.</p>
<div class="cards small">${LEDGER_SCENARIOS.map((s) => `<button type="button" class="card" data-ledger="${esc(s.id)}"><strong>${esc(s.fn)}: ${esc(s.name)}</strong><span>Synthetic numbers</span></button>`).join("")}</div>
<div class="workbench"><div class="group"><h3>Inputs</h3><div id="lform"></div></div><div class="group output" id="loutcome" aria-live="polite"></div></div></section>
<section class="block" id="compare"><h2>Compare tools</h2><p class="sub">Net hours per 100 tasks lets different functions sit side by side. The measured share counts inputs tagged measured; it is not a quality score. Gate results come from the stronger and weaker sample of each tool.</p><div id="cmp"></div></section>
<section class="block" id="limits"><h2>What this does and does not show</h2>
<div class="criteria">
<article class="crit"><h3>Gate checks are proxies</h3><p>A script can see that a test file, a CI file or a lock file exists. It cannot see whether the tests are good, whether CI is required before a change ships, or whether the code is secure. That is why some gates can only ever say "cannot tell", and why no result here is labelled approved.</p></article>
<article class="crit"><h3>The ledger is arithmetic</h3><p>It counts build, review, rework and upkeep against the manual process, and shows a range. It cannot make a guessed number valid. The measured share counts inputs tagged as measured, which is a claim about your records that this page cannot verify. The 30% variation is a sensitivity assumption, not a confidence interval.</p></article>
<article class="crit"><h3>Nothing here is real return</h3><p>Every tool, file and number is invented. No real internal tool was reviewed and no real saving was measured. The outputs show how the instrument behaves, not what AI-built tools return.</p></article>
<article class="crit"><h3>Open questions the page exposes</h3><p>Whether the gates predict real failures, whether net hours per 100 tasks is a fair way to compare functions, and what Finance accepts as cash rather than capacity are questions to test with real tools and real records. They are not answered here.</p></article></div>
<h3>How the instrument could be tested next</h3><ol class="list"><li>Agree the gate list with a reviewer before using it, and write down what each gate is meant to catch.</li><li>Run it on a set of real internal tools and compare gate results with the problems found later in review.</li><li>Replace estimated ledger inputs with time logs and error counts for the same tasks, with and without the tool.</li><li>Check with Finance which savings they would count as cash.</li></ol><p class="caption">This is a plan. No results from it exist.</p></section>
<footer class="foot"><p>Internal tool gate check and return ledger. MIT licence. Prototype with synthetic examples. Checks are proxies, not a security or quality assurance.</p></footer>`;
}

function paintReport(): void { $("#report").innerHTML = renderReport(report, reportName) + (reportNote ? `<p class="caption">${esc(reportNote)}</p>` : ""); }
function paintLedger(): void {
  const e = entry();
  const form = $("#lform");
  const active = document.activeElement instanceof HTMLElement ? document.activeElement.id : "";
  if (!form.dataset.for || form.dataset.for !== e.id) { form.innerHTML = ledgerForm(e); form.dataset.for = e.id; }
  $("#loutcome").innerHTML = renderOutcome(e);
  document.querySelectorAll<HTMLElement>("[data-ledger]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ledger === e.id)));
  if (active) document.getElementById(active)?.focus();
}
function paintCompare(): void {
  const rows: CompareRow[] = ledger.map((e) => ({
    entry: e, outcome: evaluate(e),
    gates: REPO_SCENARIOS.filter((s) => s.toolId === e.id).map((s) => { const r = analyzeRepo(s.files); return { label: s.quality, outcome: r.outcome === "blocked" ? r.counts.fail + " failed" : "no fails, human review needed" }; }),
  }));
  $("#cmp").innerHTML = renderCompare(rows);
}

async function readFolder(list: FileList): Promise<void> {
  const files: RepoFile[] = []; let skipped = 0;
  const arr = Array.from(list);
  for (const f of arr) {
    const rel = (f.webkitRelativePath || f.name).split("/").slice(1).join("/") || f.name;
    if (SKIP_DIRS.test(rel + "/") || SKIP_DIRS.test("/" + rel) || !TEXT_EXT.test(rel) || f.size > MAX_BYTES || files.length >= MAX_FILES) { skipped += 1; continue; }
    const text = await f.text();
    if (text.includes("\u0000")) { skipped += 1; continue; }
    files.push({ path: rel, content: text });
  }
  report = analyzeRepo(files);
  reportName = "your folder";
  reportNote = skipped ? skipped + " file" + (skipped === 1 ? "" : "s") + " skipped (dependency folders, binaries, large files or unrecognised types)." : "";
  $("#pick-note").textContent = files.length + " files read.";
  paintReport();
}

function onClick(e: Event): void {
  const t = e.target; if (!(t instanceof Element)) return;
  const b = t.closest("button"); if (!b) return;
  if (b.dataset.repo) {
    const s = REPO_SCENARIOS.find((x) => x.id === b.dataset.repo); if (!s) return;
    report = analyzeRepo(s.files); reportName = s.name; reportNote = ""; paintReport(); return;
  }
  if (b.dataset.ledger) { selected = b.dataset.ledger; $("#lform").dataset.for = ""; paintLedger(); return; }
  if (b.id === "dl") {
    const blob = new Blob([reportToJson(report)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "gate-report.json"; a.click(); URL.revokeObjectURL(a.href);
  }
}

function onInput(e: Event): void {
  const el = e.target;
  if (el instanceof HTMLInputElement && el.dataset.key) {
    const k = el.dataset.key; const v = el.value === "" ? NaN : Number(el.value); const en = entry();
    if (k === "periods") en.periods = v; else if ((KEYS as readonly string[]).includes(k)) en[k as Key].value = v;
    $("#loutcome").innerHTML = renderOutcome(en); paintCompare();
  } else if (el instanceof HTMLSelectElement) {
    const en = entry();
    if (el.dataset.basis) en[el.dataset.basis as Key].basis = el.value === "measured" ? "measured" : "estimated";
    else if (el.dataset.kind) en.kind = el.value === "cash" ? "cash" : "capacity";
    $("#loutcome").innerHTML = renderOutcome(en); paintCompare();
  } else if (el instanceof HTMLInputElement && el.id === "pick" && el.files && e.type === "change") void readFolder(el.files);
}

build(); paintReport(); paintLedger(); paintCompare();
document.addEventListener("click", onClick);
document.addEventListener("input", onInput);
document.addEventListener("change", onInput);
