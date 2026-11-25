import { CATEGORIES } from "./gates.js";
import { evaluate, KEYS, LABELS, money, hours, SPREAD } from "./ledger.js";
export function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export const STATUS_LABEL = { pass: "Pass", fail: "Fail", "cannot-tell": "Cannot tell", "n/a": "Not applicable" };
function gateHtml(g) {
    const ev = g.evidence.length ? `<ul class="evidence">${g.evidence.slice(0, 8).map((e) => `<li><code>${esc(e.path)}${e.line ? ":" + e.line : ""}</code>${e.label ? " " + esc(e.label) : ""}</li>`).join("")}${g.evidence.length > 8 ? `<li>and ${g.evidence.length - 8} more</li>` : ""}</ul>` : "";
    return `<details class="gate ${esc(g.status)}"${g.status === "fail" ? " open" : ""}><summary><span class="badge ${esc(g.status)}">${esc(STATUS_LABEL[g.status])}</span><span class="gtitle">${esc(g.title)}</span></summary>
<div class="gbody"><p>${esc(g.summary)}</p>${ev}<p class="why"><strong>Why it matters.</strong> ${esc(g.why)}</p><p class="limit"><strong>What this check cannot tell you.</strong> ${esc(g.limit)}</p></div></details>`;
}
export function renderReport(r, name) {
    if (r.outcome === "nothing-to-check")
        return `<h2>Nothing to review yet</h2><p>${esc(r.outcomeText)}</p>`;
    const banner = `<div class="banner ${r.outcome}" role="status"><strong>${r.outcome === "blocked" ? "Blocked by these gates" : "Not blocked by these gates. Human review still required."}</strong><p>${esc(r.outcomeText)}</p></div>`;
    const stats = `<div class="stats" role="group" aria-label="Gate counts"><div class="stat fail"><span class="num">${r.counts.fail}</span><span>failed</span></div><div class="stat cannot-tell"><span class="num">${r.counts["cannot-tell"]}</span><span>cannot tell</span></div><div class="stat pass"><span class="num">${r.counts.pass}</span><span>passed</span></div><div class="stat na"><span class="num">${r.counts["n/a"]}</span><span>not applicable</span></div></div>`;
    const groups = CATEGORIES.map((c) => {
        const items = r.results.filter((g) => g.category === c);
        return items.length ? `<section class="cat"><h3>${esc(c)}</h3>${items.map(gateHtml).join("")}</section>` : "";
    }).join("");
    return `<h2>Review of ${esc(name)}</h2><p class="caption">${r.filesScanned} files read in this page. Nothing is uploaded. Matched secret values are never displayed or exported.</p>${banner}${stats}${groups}`;
}
function pctBar(lo, hi, v) {
    const a = Math.min(lo, 0), b = Math.max(hi, 0);
    const span = b - a || 1;
    const pos = (x) => Math.max(0, Math.min(100, ((x - a) / span) * 100));
    return `<div class="range" aria-hidden="true"><div class="rzero" style="left:${pos(0).toFixed(1)}%"></div><div class="rbar" style="left:${pos(lo).toFixed(1)}%;width:${Math.max(1, pos(hi) - pos(lo)).toFixed(1)}%"></div><div class="rmid" style="left:${pos(v).toFixed(1)}%"></div></div>`;
}
export function renderOutcome(e, o = evaluate(e)) {
    if (!o.ok)
        return `<h3>Cannot compute yet</h3><ul class="issues">${o.issues.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
    const horizon = e.periods + " " + e.period + (e.periods === 1 ? "" : "s");
    const allEst = o.measuredShare === 0;
    const verdict = allEst
        ? "Every input is estimated, so this page cannot give a measured-only net return. The figures below only show what the estimates imply."
        : o.signStable
            ? (o.low > 0 ? "Positive under the chosen assumptions, including the " + Math.round(SPREAD * 100) + "% variation. This is conditional on those assumptions, not a finding." : "Negative under the chosen assumptions, including the " + Math.round(SPREAD * 100) + "% variation. This is conditional on those assumptions, not a finding.")
            : "The variation range includes zero, so these inputs do not show whether the tool pays back.";
    const be = o.breakEvenPeriods == null ? "Does not break even at these inputs." : o.breakEvenPeriods === 0 ? "No build cost to recover." : "Build cost recovered after about " + (Math.round(o.breakEvenPeriods * 10) / 10) + " " + e.period + "s.";
    const kind = e.kind === "cash" ? "Counted as cash only if actual spend was reduced or avoided and that is documented. Hours that are redeployed stay capacity." : "Counted as capacity: freed time that is not yet cash. Do not add it to cash savings.";
    return `<div class="demo-flag" role="note"><strong>SYNTHETIC DEMO.</strong> These are not actual measurements. The measured and estimated tags are simulated input provenance. Tasks are counted per month and money is in unlabelled cost units, not a currency.</div><h3>${esc(e.name)} over ${esc(horizon)}</h3>
<div class="stats"><div class="stat"><span class="num">${esc(hours(o.netHours))}</span><span>net hours (after build)</span></div><div class="stat"><span class="num">${esc(money(o.netValue))}</span><span>net value, ${e.kind} (cost units)</span></div><div class="stat"><span class="num">${Math.round(o.measuredShare * 100)}%</span><span>of inputs tagged measured</span></div></div>
${pctBar(o.low, o.high, o.netValue)}<p class="caption">Sensitivity range ${esc(money(o.low))} to ${esc(money(o.high))}: each estimated input moved ${Math.round(SPREAD * 100)}% either way, measured inputs held fixed. The 30% is an assumption of this page. It is not a confidence interval or a probability.</p>
<p><strong>${esc(verdict)}</strong> ${esc(be)}</p><p>${esc(kind)}</p>
<p>${Math.round(o.measuredShare * 100)}% of inputs are tagged measured. This counts inputs. It says nothing about how good the records are and is not a validation. ${o.estimatedKeys.length ? "Estimated: " + esc(o.estimatedKeys.join(", ")) + "." : "Every input is tagged measured, which is a claim about your records that this page cannot check."}</p>
<p class="caption">Comparable across functions: ${esc(hours(o.hoursPer100Units))} net hours per 100 tasks per ${esc(e.period)}, before build cost. Value uses each function's own cost per hour, so compare hours first.</p>`;
}
export function ledgerForm(e) {
    const row = (k) => `<div class="irow"><label for="f-${k}">${esc(LABELS[k])}</label><input id="f-${k}" class="input" type="number" min="0" step="any" data-key="${k}" value="${esc(e[k].value)}"><select class="basis" data-basis="${k}" aria-label="${esc(LABELS[k])}: measured or estimated"><option value="measured"${e[k].basis === "measured" ? " selected" : ""}>Measured</option><option value="estimated"${e[k].basis === "estimated" ? " selected" : ""}>Estimated</option></select></div>`;
    return `<p class="caption">Per month, money in unlabelled cost units. Leave nothing blank: a blank cost is not treated as zero. Enter 0 only if you know it is zero.</p>` + KEYS.map(row).join("") +
        `<div class="irow"><label for="f-periods">Horizon (${esc(e.period)}s)</label><input id="f-periods" class="input" type="number" min="1" step="1" data-key="periods" value="${esc(e.periods)}"><span></span></div>` +
        `<div class="irow"><label for="f-kind">Savings are</label><select id="f-kind" class="basis wide" data-kind="1"><option value="capacity"${e.kind === "capacity" ? " selected" : ""}>Capacity (freed time)</option><option value="cash"${e.kind === "cash" ? " selected" : ""}>Cash (verified spend reduced or avoided)</option></select><span></span></div>`;
}
export function renderCompare(rows) {
    const ok = rows.filter((r) => r.outcome.ok);
    const cash = ok.filter((r) => r.entry.kind === "cash").reduce((s, r) => s + r.outcome.netValue, 0);
    const cap = ok.filter((r) => r.entry.kind === "capacity").reduce((s, r) => s + r.outcome.netValue, 0);
    const head = `<tr><th>Tool</th><th>Function</th><th>Net hours per 100 tasks</th><th>Net value, cost units (sensitivity range)</th><th>Counted as</th><th>Inputs tagged measured</th><th>Gate review</th></tr>`;
    const body = rows.map((r) => {
        const o = r.outcome;
        if (!o.ok)
            return `<tr><td>${esc(r.entry.name)}</td><td>${esc(r.entry.fn)}</td><td colspan="5">Cannot compute: ${esc(o.issues[0] ?? "")}</td></tr>`;
        return `<tr><td>${esc(r.entry.name)}</td><td>${esc(r.entry.fn)}</td><td>${esc(hours(o.hoursPer100Units))}</td><td>${esc(money(o.netValue))} <span class="mute">(${esc(money(o.low))} to ${esc(money(o.high))})${o.signStable ? "" : ", range includes zero"}</span></td><td>${esc(r.entry.kind)}</td><td>${Math.round(o.measuredShare * 100)}% (synthetic tags)</td><td>${r.gates.map((g) => esc(g.label + ": " + g.outcome)).join("<br>")}</td></tr>`;
    }).join("");
    return `<div class="tablewrap"><table class="cmp"><thead>${head}</thead><tbody>${body}</tbody></table></div>
<div class="callout"><strong>Totals are kept apart on purpose</strong><p>Cash: ${esc(money(cash))}. Capacity: ${esc(money(cap))}. These are not added together, because freed or redeployed hours stay capacity. They count as cash only when actual spend is reduced or avoided and that is documented. Normalising to hours per 100 tasks is a convention for side-by-side reading, not proof that functions are comparable. All figures here are invented.</p></div>`;
}
