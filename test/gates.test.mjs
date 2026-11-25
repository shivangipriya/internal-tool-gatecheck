import test from "node:test";
import assert from "node:assert/strict";
import { analyzeRepo, reportToJson, CATEGORIES } from "../dist/gates.js";
import { REPO_SCENARIOS } from "../dist/scenarios.js";

const get = (r, id) => r.results.find((g) => g.id === id);
const f = (path, content = "x") => ({ path, content });
const KEY = "sk-SYNTHETICEXAMPLEDONOTUSE000000";

// Expected outcomes, written from the intent of each sample before reading results.
const EXPECT = {
  "invoice-stronger": { outcome: "human-review", fails: [] },
  "onboarding-stronger": { outcome: "human-review", fails: [] },
  "ops-stronger": { outcome: "human-review", fails: [] },
  "invoice-weaker": { outcome: "blocked", fails: ["readme-content", "gitignore", "tests-exist", "test-command", "ci-exists", "lockfile", "wildcards", "secrets"] },
  "onboarding-weaker": { outcome: "blocked", fails: ["readme-content", "gitignore", "assertions", "ci-exists", "lockfile", "env-file", "risky-calls"] },
  "ops-weaker": { outcome: "blocked", fails: ["readme-content", "gitignore", "tests-exist", "test-command", "ci-exists", "lockfile", "wildcards", "secrets", "risky-calls", "net-errors", "llm-disclosed", "llm-output"] },
};
for (const s of REPO_SCENARIOS) {
  test("sample " + s.id + " gives the expected outcome and failing gates", () => {
    const r = analyzeRepo(s.files);
    assert.equal(r.outcome, EXPECT[s.id].outcome);
    assert.deepEqual(r.results.filter((g) => g.status === "fail").map((g) => g.id).sort(), [...EXPECT[s.id].fails].sort());
  });
}
test("every sample is labelled synthetic", () => { for (const s of REPO_SCENARIOS) assert.match(s.blurb, /^Synthetic/); });
test("no files means nothing checked, not a pass", () => {
  const r = analyzeRepo([]); assert.equal(r.outcome, "nothing-to-check"); assert.equal(r.results.length, 0);
});
test("branch protection is cannot-tell for every sample, including the strongest", () => {
  for (const s of REPO_SCENARIOS) assert.equal(get(analyzeRepo(s.files), "branch-protection").status, "cannot-tell");
});
test("no outcome text ever says approved, ready, safe or secure", () => {
  for (const s of REPO_SCENARIOS) assert.ok(!/\b(approved|ready|safe|secure|compliant)\b/i.test(analyzeRepo(s.files).outcomeText));
  assert.ok(!/\b(approved|safe|secure)\b/i.test(analyzeRepo([f("README.md", "owner purpose data")]).outcomeText));
});
test("network error handling can fail or cannot-tell, never pass", () => {
  const withTry = analyzeRepo([f("a.js", "try { await fetch('u') } catch (e) {}")]);
  assert.equal(get(withTry, "net-errors").status, "cannot-tell");
  const bare = analyzeRepo([f("a.js", "await fetch('u')")]);
  assert.equal(get(bare, "net-errors").status, "fail");
  assert.equal(get(analyzeRepo([f("a.js", "1+1")]), "net-errors").status, "n/a");
});
test("a stated owner of 'unknown' does not satisfy the owner check", () => {
  const r = analyzeRepo([f("README.md", "Purpose: this tool does x.\nOwner: unknown\nData: none.")]);
  assert.match(get(r, "readme-content").summary, /who owns it/);
  const ok = analyzeRepo([f("README.md", "Purpose: this tool does x.\nOwner: finance ops\nData: totals.")]);
  assert.equal(get(ok, "readme-content").status, "pass");
});
test("secret patterns: AWS id, private key block, sk- key, assigned literal", () => {
  const files = [f("a.js", "const a = 'AKIAABCDEFGHIJKLMNOP';"), f("b.txt", "-----BEGIN RSA PRIVATE KEY-----"), f("c.js", "k='" + KEY + "'"), f("d.py", "password = 'hunter2hunter2hunter2'")];
  const r = analyzeRepo(files); const g = get(r, "secrets");
  assert.equal(g.status, "fail"); assert.equal(g.evidence.length, 4);
  assert.deepEqual(g.evidence.map((e) => e.line), [1, 1, 1, 1]);
});
test("secret values never appear in the report object or the JSON export", () => {
  const r = analyzeRepo([f("c.js", "k='" + KEY + "'"), f(".env", "TOKEN=\"abcdefghijklmnop\"")]);
  const all = JSON.stringify(r) + reportToJson(r);
  assert.ok(!all.includes(KEY)); assert.ok(!all.includes("abcdefghijklmnop"));
});
test("env files: .env flagged, .env.example not", () => {
  assert.equal(get(analyzeRepo([f(".env", "A=1")]), "env-file").status, "fail");
  assert.equal(get(analyzeRepo([f(".env.example", "A=")]), "env-file").status, "pass");
});
test("env use without .gitignore entry fails, and is n/a without env use", () => {
  assert.equal(get(analyzeRepo([f("a.js", "process.env.X"), f(".gitignore", "node_modules/")]), "env-ignore").status, "fail");
  assert.equal(get(analyzeRepo([f("a.js", "process.env.X"), f(".gitignore", ".env\n")]), "env-ignore").status, "pass");
  assert.equal(get(analyzeRepo([f("a.js", "1")]), "env-ignore").status, "n/a");
});
test("lock files: npm needs lock, requirements need ==, no manifest is n/a", () => {
  const dep = JSON.stringify({ dependencies: { a: "1.0.0" } });
  assert.equal(get(analyzeRepo([f("package.json", dep)]), "lockfile").status, "fail");
  assert.equal(get(analyzeRepo([f("package.json", dep), f("package-lock.json", "{}")]), "lockfile").status, "pass");
  assert.equal(get(analyzeRepo([f("requirements.txt", "a==1\nb>=2")]), "lockfile").status, "fail");
  assert.equal(get(analyzeRepo([f("requirements.txt", "# c\na==1\nb==2")]), "lockfile").status, "pass");
  assert.equal(get(analyzeRepo([f("README.md", "x")]), "lockfile").status, "n/a");
});
test("test files without assertions fail; test command default stub fails", () => {
  assert.equal(get(analyzeRepo([f("test/a.test.js", "console.log(1)")]), "assertions").status, "fail");
  assert.equal(get(analyzeRepo([f("test/a.test.js", "assert.equal(1,1)")]), "assertions").status, "pass");
  const stub = JSON.stringify({ scripts: { test: "echo \"Error: no test specified\" && exit 1" } });
  assert.equal(get(analyzeRepo([f("package.json", stub)]), "test-command").status, "fail");
});
test("test command is cannot-tell without any manifest", () => { assert.equal(get(analyzeRepo([f("a.js", "1")]), "test-command").status, "cannot-tell"); });
test("CI file without a test command fails", () => {
  assert.equal(get(analyzeRepo([f(".github/workflows/a.yml", "run: echo hi")]), "ci-tests").status, "fail");
  assert.equal(get(analyzeRepo([f(".github/workflows/a.yml", "run: npm test")]), "ci-tests").status, "pass");
});
test("LLM gates: n/a without LLM use; model output with eval fails", () => {
  assert.equal(get(analyzeRepo([f("a.js", "1")]), "llm-disclosed").status, "n/a");
  const r = analyzeRepo([f("a.js", "client.chat.completions.create({}); eval(out)")]);
  assert.equal(get(r, "llm-output").status, "fail"); assert.equal(get(r, "llm-disclosed").status, "fail");
  assert.equal(get(r, "llm-eval").status, "cannot-tell");
});
test("paths are normalised and a broken package.json does not throw", () => {
  const r = analyzeRepo([f(".\\README.md", "owner purpose data"), f("package.json", "{not json")]);
  assert.equal(get(r, "readme").status, "pass"); assert.ok(r.results.length > 5);
});
test("counts always sum to the number of gates and every gate has a category, why and limit", () => {
  for (const s of REPO_SCENARIOS) {
    const r = analyzeRepo(s.files);
    assert.equal(Object.values(r.counts).reduce((a, b) => a + b, 0), r.results.length);
    for (const g of r.results) { assert.ok(CATEGORIES.includes(g.category)); assert.ok(g.why.length > 10 && g.limit.length > 10); }
  }
});
test("evidence never carries file contents", () => {
  const r = analyzeRepo([f("a.js", "eval(secretlooking)")]);
  for (const g of r.results) for (const e of g.evidence) assert.deepEqual(Object.keys(e).filter((k) => !["path", "line", "label"].includes(k)), []);
});
test("fuzz: 400 random repos never throw and stay consistent", () => {
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const names = ["README.md", "package.json", "a.js", "test/a.test.js", ".env", ".gitignore", "requirements.txt", ".github/workflows/ci.yml", "x/y/z.py", "pyproject.toml"];
  const bits = ["eval(x)", "fetch('u')", "try{}catch(e){}", "assert(1)", "{\"dependencies\":{\"a\":\"*\"}}", "owner data purpose", "AKIAABCDEFGHIJKLMNOP", "", "openai", "\u0000", "process.env.A"];
  for (let i = 0; i < 400; i++) {
    const files = []; const n = Math.floor(rnd() * 8);
    for (let j = 0; j < n; j++) files.push(f(names[Math.floor(rnd() * names.length)], bits[Math.floor(rnd() * bits.length)] + bits[Math.floor(rnd() * bits.length)]));
    const r = analyzeRepo(files);
    assert.equal(Object.values(r.counts).reduce((a, b) => a + b, 0), r.results.length);
    if (n > 0) assert.ok(["blocked", "human-review"].includes(r.outcome));
    assert.ok(!/NaN|undefined/.test(JSON.stringify(r)));
  }
});
