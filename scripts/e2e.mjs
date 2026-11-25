// Optional end-to-end check in headless Chrome (set CHROME=/path/to/chrome if needed). Run: npm run e2e
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = process.env.PORT || "8098"; const DBG = 9334;
const srv = spawn("node", ["scripts/serve.mjs"], { cwd: new URL("..", import.meta.url).pathname, env: { ...process.env, PORT } });
await new Promise((r) => setTimeout(r, 800));
const chrome = spawn(process.env.CHROME || "google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=" + DBG, "--user-data-dir=" + (process.env.TMPDIR || "/tmp") + "/gate-e2e-profile", "--window-size=" + (process.env.W || "390") + "," + (process.env.H || "900"), "about:blank"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));
const tabs = await (await fetch("http://127.0.0.1:" + DBG + "/json")).json();
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = {}; const logs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) pend[d.id](d); if (d.method === "Runtime.exceptionThrown" || (d.method === "Runtime.consoleAPICalled" && d.params.type === "error")) logs.push(JSON.stringify(d.params).slice(0, 300)); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result.result.value; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await send("Runtime.enable"); await send("Page.enable");
await send("Page.navigate", { url: "http://localhost:" + PORT + "/" }); await wait(1500);
const out = {}; const KEY = "sk-SYNTHETICEXAMPLEDONOTUSE000000";
const txt = (sel) => ev(`document.querySelector(${JSON.stringify(sel)}).innerText`);
out.initialBanner = (await txt("#report .banner")).split("\n")[0];
for (const id of ["invoice-stronger", "ops-stronger", "ops-weaker", "onboarding-weaker"]) {
  await ev(`document.querySelector('[data-repo=${id}]').click()`);
  out["repo_" + id] = (await txt("#report .banner")).split("\n")[0] + " | " + (await ev("[...document.querySelectorAll('#report .stat .num')].map(e=>e.textContent).join('/')"));
}
out.secretLeak = (await txt("#report")).includes(KEY) || (await ev("document.querySelector('#report').innerHTML")).includes(KEY);
out.failGatesOpen = await ev("document.querySelectorAll('#report details.gate.fail[open]').length === document.querySelectorAll('#report details.gate.fail').length");
// ledger
const setv = (sel, v) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.value=${JSON.stringify(String(v))};e.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
const setsel = (sel, v) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);
out.ledger0 = (await txt("#loutcome")).split("\n").slice(0, 7).join(" | ");
await setv("#f-units", 0); out.zeroUnits = (await txt("#loutcome")).slice(0, 60);
await setv("#f-units", 120); await setsel("[data-basis=toolMin]", "estimated"); out.rangeAfterEstimate = /Range [\d,-]+ to [\d,-]+/.exec(await txt("#loutcome"))?.[0];
await setsel("[data-basis=toolMin]", "measured");
await ev("document.querySelector('[data-ledger=onboarding]').click()"); out.onboarding = (await txt("#loutcome")).includes("range includes zero");
await setsel("#f-kind", "cash"); out.cmpRows = await ev("document.querySelectorAll('#cmp tbody tr').length"); out.cmpText = (await txt("#cmp .callout")).slice(0, 80);
// folder pick with flat files
const dir = mkdtempSync(join(tmpdir(), "gate-"));
writeFileSync(join(dir, "README.md"), "Purpose: this tool does x.\nOwner: someone\nData: totals.\n"); writeFileSync(join(dir, "app.js"), "const k = '" + KEY + "';\nawait fetch('u');\n"); writeFileSync(join(dir, "package.json"), '{"scripts":{"test":"node --test"}}');
const doc = await send("DOM.getDocument"); const node = await send("DOM.querySelector", { nodeId: doc.result.root.nodeId, selector: "#pick" });
await send("DOM.setFileInputFiles", { nodeId: node.result.nodeId, files: [dir] }); await ev("document.querySelector('#pick').dispatchEvent(new Event('change',{bubbles:true}))"); await wait(1000);
out.dbg = await ev("document.querySelector('#pick').files.length"); out.pickNote = await txt("#pick-note"); out.folderReport = (await txt("#report")).split("\n")[0];
out.folderSecretLeak = (await ev("document.querySelector('#report').innerHTML")).includes(KEY);
out.folderSecretGate = await ev("[...document.querySelectorAll('#report details.gate.fail')].some(d=>/secret/i.test(d.innerText))");
out.downloadButton = await ev("!!document.querySelector('#dl')");
out.overflowX = await ev("document.documentElement.scrollWidth>window.innerWidth");
out.consoleErrors = logs.length;
console.log(JSON.stringify(out, null, 1)); console.log(logs.join("\n"));
if (process.env.SHOT) { await ev("document.querySelector('[data-repo=ops-weaker]').click(); document.querySelector('#review').scrollIntoView()"); await wait(300); const r = await send("Page.captureScreenshot", { format: "png" }); (await import("node:fs")).writeFileSync(process.env.SHOT, Buffer.from(r.result.data, "base64")); }
chrome.kill(); srv.kill(); process.exit(0);
