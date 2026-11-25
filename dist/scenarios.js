const f = (path, content) => ({ path, content });
const FAKE_KEY = "sk-SYNTHETICEXAMPLEDONOTUSE000000";
const goodJsTests = `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { match } from "../src/index.js";\ntest("matches equal amounts", () => { assert.equal(match(100, 100), true); });\ntest("rejects different amounts", () => { assert.equal(match(100, 101), false); });\n`;
const ciJs = `name: ci\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci\n      - run: npm test\n`;
const lock = `{"name":"synthetic","lockfileVersion":3,"packages":{}}`;
const gitignore = `node_modules/\n.env\n`;
export const REPO_SCENARIOS = [
    { id: "invoice-stronger", toolId: "invoice", name: "Invoice match checker (stronger)", fn: "Finance", quality: "stronger", blurb: "Synthetic. A small matching script with a README, tests, CI and a lock file.",
        files: [
            f("README.md", "# Invoice match checker\n\nPurpose: this tool compares invoice totals with purchase orders and lists mismatches.\nOwner: Finance operations (contact: finance-ops, synthetic).\nData: reads two CSV files of invoice and order totals. No personal data.\n"),
            f(".gitignore", gitignore), f("package.json", JSON.stringify({ name: "invoice-match", type: "module", scripts: { test: "node --test" }, dependencies: { papaparse: "5.4.1" } })),
            f("package-lock.json", lock), f("src/index.js", "export function match(a, b) { return a === b; }\n"), f("test/index.test.js", goodJsTests), f(".github/workflows/ci.yml", ciJs),
            f(".github/CODEOWNERS", "* @finance-ops\n"),
        ] },
    { id: "invoice-weaker", toolId: "invoice", name: "Invoice match checker (weaker)", fn: "Finance", quality: "weaker", blurb: "Synthetic. Same idea with no tests or CI, no owner in the README, an unlocked dependency and a key-like string in source.",
        files: [
            f("README.md", "# Invoice match\n\nCompares invoices.\n"),
            f("package.json", JSON.stringify({ name: "invoice-match", type: "module", dependencies: { papaparse: "latest" } })),
            f("src/index.js", "export function match(a, b) { return a == b; }\nconst config = { apiKey: \"" + FAKE_KEY + "\" };\n"),
        ] },
    { id: "onboarding-stronger", toolId: "onboarding", name: "Onboarding checklist builder (stronger)", fn: "HR", quality: "stronger", blurb: "Synthetic. A Python script with pinned requirements, tests and CI.",
        files: [
            f("README.md", "# Onboarding checklist builder\n\nWhat it does: turns a role template into a checklist.\nOwner: People team maintainer (synthetic).\nData: takes a role name only. It handles no personal or confidential data.\n"),
            f(".gitignore", "__pycache__/\n.env\n"), f("requirements.txt", "jinja2==3.1.4\npytest==8.3.2\n"), f("pyproject.toml", "[tool.pytest.ini_options]\ntestpaths = [\"tests\"]\n"),
            f("build.py", "from jinja2 import Template\n\ndef build(role):\n    return Template('Checklist for {{ role }}').render(role=role)\n"),
            f("tests/test_build.py", "from build import build\n\ndef test_build():\n    assert 'Checklist for analyst' == build('analyst')\n"),
            f(".github/workflows/ci.yml", "name: ci\non: [push]\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pip install -r requirements.txt\n      - run: python -m pytest\n"),
        ] },
    { id: "onboarding-weaker", toolId: "onboarding", name: "Onboarding checklist builder (weaker)", fn: "HR", quality: "weaker", blurb: "Synthetic. Unpinned requirements, a committed .env, a shell call and a test file with no assertions.",
        files: [
            f("README.md", "# Onboarding\n\nThis tool builds checklists. Owner: unknown. Data: employee names are read.\n"),
            f("requirements.txt", "jinja2\npytest\n"), f(".env", "SERVICE_TOKEN=\"synthetic-token-value-000000\"\n"),
            f("build.py", "import os, subprocess\n\ndef build(role):\n    os.system('echo ' + role)\n    subprocess.run('ls ' + role, shell=True)\n    return role\n"),
            f("tests/test_build.py", "from build import build\n\ndef test_build():\n    build('analyst')\n"),
        ] },
    { id: "ops-stronger", toolId: "ops", name: "Weekly ops summary (stronger)", fn: "Operations", quality: "stronger", blurb: "Synthetic. Calls a model to draft a summary, discloses it, handles request failures, and has tests, CI and an evaluation fixture.",
        files: [
            f("README.md", "# Weekly ops summary\n\nPurpose: drafts a weekly summary from the ticket export.\nOwner: Operations analyst team (synthetic).\nData: sends ticket titles (no customer names) to a language model, the OpenAI API in this example. A person reads and edits every draft before it is shared.\n"),
            f(".gitignore", gitignore), f("package.json", JSON.stringify({ name: "ops-summary", type: "module", scripts: { test: "node --test" }, dependencies: { openai: "4.52.0" } })), f("package-lock.json", lock),
            f("src/summary.js", "import OpenAI from \"openai\";\nconst client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });\nexport async function draft(titles) {\n  try {\n    const r = await client.chat.completions.create({ model: \"example-model\", messages: [{ role: \"user\", content: titles.join(\"\\n\") }] });\n    return r.choices[0].message.content;\n  } catch (e) { return null; }\n}\n"),
            f("test/summary.test.js", "import test from \"node:test\";\nimport assert from \"node:assert/strict\";\ntest(\"placeholder for a mocked draft\", () => { assert.equal(1, 1); });\n"),
            f("eval/golden-cases.json", "[{\"input\":[\"Printer down\"],\"mustMention\":\"printer\"}]"), f(".github/workflows/ci.yml", ciJs),
        ] },
    { id: "ops-weaker", toolId: "ops", name: "Weekly ops summary (weaker)", fn: "Operations", quality: "weaker", blurb: "Synthetic. A model call with no README disclosure, model output run through eval, no error handling, and a key-like string in source.",
        files: [
            f("README.md", "# Ops summary\n\nMakes the weekly summary.\n"),
            f("package.json", JSON.stringify({ name: "ops-summary", type: "module", dependencies: { openai: "*" } })),
            f("summary.js", "import OpenAI from \"openai\";\nconst client = new OpenAI({ apiKey: \"" + FAKE_KEY + "\" });\nexport async function run(titles) {\n  const r = await client.chat.completions.create({ model: \"example-model\", messages: [{ role: \"user\", content: titles.join(\"\\n\") }] });\n  const out = r.choices[0].message.content;\n  eval(out);\n  const x = await fetch(\"https://example.invalid/post\", { method: \"POST\", body: out });\n  return x;\n}\n"),
        ] },
];
const t = (value, basis) => ({ value, basis });
export const LEDGER_SCENARIOS = [
    { id: "invoice", name: "Invoice match checker", fn: "Finance", period: "month", units: t(120, "measured"), baselineMin: t(12, "measured"), toolMin: t(3, "measured"), reviewMin: t(2, "estimated"), baselineErr: t(0.08, "measured"), toolErr: t(0.03, "estimated"), reworkMin: t(15, "estimated"), buildHours: t(20, "measured"), maintHours: t(1, "estimated"), runCost: t(0, "measured"), rate: t(40, "measured"), periods: 12, kind: "capacity" },
    { id: "onboarding", name: "Onboarding checklist builder", fn: "HR", period: "month", units: t(25, "estimated"), baselineMin: t(45, "estimated"), toolMin: t(10, "estimated"), reviewMin: t(8, "estimated"), baselineErr: t(0.1, "estimated"), toolErr: t(0.04, "estimated"), reworkMin: t(30, "estimated"), buildHours: t(30, "estimated"), maintHours: t(2, "estimated"), runCost: t(0, "measured"), rate: t(30, "estimated"), periods: 12, kind: "capacity" },
    { id: "ops", name: "Weekly ops summary", fn: "Operations", period: "month", units: t(4, "measured"), baselineMin: t(90, "measured"), toolMin: t(15, "measured"), reviewMin: t(25, "measured"), baselineErr: t(0.25, "estimated"), toolErr: t(0.1, "estimated"), reworkMin: t(40, "estimated"), buildHours: t(16, "measured"), maintHours: t(2, "estimated"), runCost: t(15, "measured"), rate: t(35, "measured"), periods: 12, kind: "cash" },
];
