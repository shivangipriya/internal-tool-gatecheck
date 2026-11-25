// Control-gate checks over a snapshot of a small internal tool's files.
// These are checkable proxies. A pass means a script found the thing it looks for, not that the tool is reliable or secure.

export type Status = "pass" | "fail" | "cannot-tell" | "n/a";
export type Category = "Documentation and ownership" | "Testing" | "Review and CI" | "Dependencies" | "Security" | "LLM-specific";

export interface RepoFile { path: string; content: string }
export interface Finding { path: string; line?: number; label?: string }
export interface GateResult {
  id: string; category: Category; title: string; why: string; status: Status;
  summary: string; evidence: Finding[]; limit: string;
}
export interface GateReport {
  results: GateResult[];
  counts: Record<Status, number>;
  outcome: "blocked" | "human-review" | "nothing-to-check";
  outcomeText: string;
  filesScanned: number;
}

export const CATEGORIES: Category[] = ["Documentation and ownership", "Testing", "Review and CI", "Dependencies", "Security", "LLM-specific"];

const norm = (p: string) => p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
const base = (p: string) => p.split("/").pop() ?? p;
const lc = (s: string) => s.toLowerCase();

export const SECRET_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "AWS access key id", re: /AKIA[0-9A-Z]{16}/ },
  { label: "private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "provider-style API key (sk-...)", re: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { label: "assigned secret literal", re: /\b(api[_-]?key|secret|token|passwd|password)\b\s*[:=]\s*["'][^"'\s]{12,}["']/i },
];

export const RISKY_CALLS: Array<{ label: string; re: RegExp }> = [
  { label: "eval()", re: /\beval\s*\(/ },
  { label: "new Function()", re: /\bnew\s+Function\s*\(/ },
  { label: "os.system()", re: /\bos\.system\s*\(/ },
  { label: "subprocess with shell=True", re: /shell\s*=\s*True/ },
  { label: "child_process exec()", re: /\bchild_process\b[\s\S]{0,80}\bexec\s*\(|\bexecSync\s*\(/ },
  { label: "innerHTML assignment", re: /\.innerHTML\s*=/ },
  { label: "pickle.loads()", re: /\bpickle\.loads?\s*\(/ },
];

const LLM_RE = /\b(openai|anthropic|chat\.completions|messages\.create|generatecontent|langchain|llama_index|ollama)\b/i;
const NET_RE = /\bfetch\s*\(|\brequests\.(get|post|put|delete)\s*\(|\baxios\b|\burllib\.request\b|\bhttpx\./;
const HANDLE_RE = /\btry\s*[{:]|\bcatch\s*[({]|\.catch\s*\(|\bexcept\b|timeout|AbortController/;
const TEST_PATH_RE = /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[a-z]+$|(^|\/)test_[^/]+\.py$|_test\.py$/i;
const CODE_RE = /\.(js|mjs|cjs|ts|tsx|jsx|py|rb|go|java|sh|ps1|php)$/i;

function lineOf(content: string, index: number): number { return content.slice(0, index).split("\n").length; }

function scan(files: RepoFile[], pats: Array<{ label: string; re: RegExp }>, only?: (f: RepoFile) => boolean): Finding[] {
  const out: Finding[] = [];
  for (const f of files) {
    if (only && !only(f)) continue;
    for (const p of pats) {
      const m = p.re.exec(f.content);
      if (m) out.push({ path: f.path, line: lineOf(f.content, m.index), label: p.label });
    }
  }
  return out;
}

function make(id: string, category: Category, title: string, why: string, limit: string, status: Status, summary: string, evidence: Finding[] = []): GateResult {
  return { id, category, title, why, limit, status, summary, evidence };
}

export function analyzeRepo(input: RepoFile[]): GateReport {
  const files = input.map((f) => ({ path: norm(f.path), content: f.content }));
  const has = (re: RegExp) => files.filter((f) => re.test(f.path));
  const byBase = (name: string) => files.filter((f) => lc(base(f.path)) === name);
  const results: GateResult[] = [];
  const code = files.filter((f) => CODE_RE.test(f.path) && !TEST_PATH_RE.test(f.path));
  const testFiles = files.filter((f) => TEST_PATH_RE.test(f.path) && CODE_RE.test(f.path));
  const readme = files.find((f) => /^readme(\.[a-z]+)?$/i.test(base(f.path)) && f.path.split("/").length <= 2);
  const pkg = files.find((f) => base(f.path) === "package.json" && f.path.split("/").length <= 2);
  let pkgJson: Record<string, unknown> | null = null;
  if (pkg) { try { pkgJson = JSON.parse(pkg.content) as Record<string, unknown>; } catch { pkgJson = null; } }
  const reqs = files.find((f) => /^requirements(-[a-z]+)?\.txt$/i.test(base(f.path)));
  const pyproject = files.find((f) => base(f.path) === "pyproject.toml");

  if (files.length === 0) {
    return { results: [], counts: { pass: 0, fail: 0, "cannot-tell": 0, "n/a": 0 }, outcome: "nothing-to-check", outcomeText: "No readable files were given, so nothing was checked.", filesScanned: 0 };
  }

  // Documentation and ownership
  results.push(readme
    ? make("readme", "Documentation and ownership", "A README exists", "Someone else has to be able to find out what the tool is for.", "Existence only. It does not say the README is accurate.", "pass", "README found.", [{ path: readme.path }])
    : make("readme", "Documentation and ownership", "A README exists", "Someone else has to be able to find out what the tool is for.", "Existence only. It does not say the README is accurate.", "fail", "No README at the top level."));
  {
    const t = readme ? lc(readme.content) : "";
    const marks: Array<[string, RegExp]> = [["what it does", /\b(purpose|what it does|this tool|overview)\b/], ["who owns it", /\b(owner|maintainer|contact|owned by)\b(?!\s*[:=-]?\s*(unknown|none|tbd|n\/a|nobody))/], ["what data it handles", /\b(data|inputs?|files? it reads|personal|confidential)\b/]];
    const missing = marks.filter(([, re]) => !re.test(t)).map(([n]) => n);
    results.push(!readme
      ? make("readme-content", "Documentation and ownership", "README names purpose, owner and data handled", "A tool with no named owner has nobody to fix it and nobody to ask about its data.", "Keyword check only. A README can use these words and still be wrong or vague.", "fail", "No README to check.")
      : missing.length === 0
        ? make("readme-content", "Documentation and ownership", "README names purpose, owner and data handled", "A tool with no named owner has nobody to fix it and nobody to ask about its data.", "Keyword check only. A README can use these words and still be wrong or vague.", "pass", "All three topics are mentioned. Whether they are true is for a person to check.", [{ path: readme.path }])
        : make("readme-content", "Documentation and ownership", "README names purpose, owner and data handled", "A tool with no named owner has nobody to fix it and nobody to ask about its data.", "Keyword check only. A README can use these words and still be wrong or vague.", "fail", "Not mentioned: " + missing.join(", ") + ".", [{ path: readme.path }]));
  }
  const gi = byBase(".gitignore");
  results.push(gi.length
    ? make("gitignore", "Documentation and ownership", "Ignore rules exist", "Without ignore rules, local files such as env files and dependencies are easy to commit by accident.", "Existence only. It does not check what the rules cover.", "pass", ".gitignore found.", [{ path: gi[0].path }])
    : make("gitignore", "Documentation and ownership", "Ignore rules exist", "Without ignore rules, local files such as env files and dependencies are easy to commit by accident.", "Existence only. It does not check what the rules cover.", "fail", "No .gitignore."));

  // Testing
  results.push(testFiles.length
    ? make("tests-exist", "Testing", "Test files exist", "A change to the tool needs something that can fail.", "Presence only. It says nothing about coverage or whether the tests test the right thing.", "pass", testFiles.length + " test file" + (testFiles.length === 1 ? "" : "s") + " found.", testFiles.slice(0, 5).map((f) => ({ path: f.path })))
    : make("tests-exist", "Testing", "Test files exist", "A change to the tool needs something that can fail.", "Presence only. It says nothing about coverage or whether the tests test the right thing.", "fail", "No test files found."));
  {
    let declared: string | null = null;
    if (pkgJson && typeof pkgJson.scripts === "object" && pkgJson.scripts !== null) {
      const t = (pkgJson.scripts as Record<string, unknown>).test;
      if (typeof t === "string" && !/no test specified/i.test(t)) declared = "package.json scripts.test";
    }
    if (!declared && pyproject && /pytest|\[tool\.pytest/i.test(pyproject.content)) declared = "pyproject.toml";
    if (!declared && files.some((f) => /^(makefile)$/i.test(base(f.path)) && /^test\s*:/m.test(f.content))) declared = "Makefile test target";
    const noManifest = !pkg && !pyproject && !files.some((f) => /^makefile$/i.test(base(f.path)));
    const T = "Declared test command";
    const W = "Someone new should be able to run the tests without asking.";
    const L = "It does not run the command.";
    results.push(declared
      ? make("test-command", "Testing", T, W, L, "pass", "Found in " + declared + ".")
      : noManifest
        ? make("test-command", "Testing", T, W, L, "cannot-tell", "No manifest (package.json, pyproject.toml or Makefile) to look in.")
        : make("test-command", "Testing", T, W, L, "fail", "A manifest exists but declares no test command."));
  }
  {
    const T = "Assertion-like words found in test files"; const W = "A test file with no assertions passes whatever the tool does."; const L = "Counts assert-like words. It cannot tell whether an assertion is meaningful.";
    if (!testFiles.length) results.push(make("assertions", "Testing", T, W, L, "n/a", "No test files."));
    else {
      const bad = testFiles.filter((f) => !/\b(assert|expect|should|self\.assert|assertEqual|toBe|toEqual)\b/.test(f.content));
      results.push(bad.length ? make("assertions", "Testing", T, W, L, "fail", bad.length + " test file" + (bad.length === 1 ? "" : "s") + " with no assertion-like call.", bad.map((f) => ({ path: f.path }))) : make("assertions", "Testing", T, W, L, "pass", "Every test file contains assertion-like calls."));
    }
  }

  // Review and CI
  const ci = files.filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(f.path) || /^\.gitlab-ci\.ya?ml$/i.test(f.path) || /^azure-pipelines\.ya?ml$/i.test(f.path) || /^\.circleci\/config\.ya?ml$/i.test(f.path));
  results.push(ci.length
    ? make("ci-exists", "Review and CI", "A CI configuration exists", "Checks that only run on one person's laptop are skipped when that person is busy.", "Existence only. It does not know whether CI actually runs or is required.", "pass", "CI configuration found.", ci.map((f) => ({ path: f.path })))
    : make("ci-exists", "Review and CI", "A CI configuration exists", "Checks that only run on one person's laptop are skipped when that person is busy.", "Existence only. It does not know whether CI actually runs or is required.", "fail", "No CI configuration found."));
  {
    const T = "CI file contains a test command"; const W = "A CI file that never runs the tests gives false comfort."; const L = "Looks for a test command in the CI file. It cannot see whether CI passes or blocks a merge.";
    if (!ci.length) results.push(make("ci-tests", "Review and CI", T, W, L, "n/a", "No CI file."));
    else {
      const runs = ci.filter((f) => /\b(npm (run )?test|pnpm test|yarn test|pytest|python -m (pytest|unittest)|go test|make test|node --test)\b/.test(f.content));
      results.push(runs.length ? make("ci-tests", "Review and CI", T, W, L, "pass", "A test command appears in CI.", runs.map((f) => ({ path: f.path }))) : make("ci-tests", "Review and CI", T, W, L, "fail", "CI file found but no test command in it.", ci.map((f) => ({ path: f.path }))));
    }
  }
  results.push(make("branch-protection", "Review and CI", "Changes are reviewed before they ship", "Review is the main control that lets a non-engineer's change meet an engineered standard.", "Branch protection and required reviewers live in the hosting settings, not in the files. This gate can never be passed from a file snapshot.", "cannot-tell", "Cannot be seen from files. A person must check the repository settings.",
    has(/(^|\/)(CODEOWNERS|pull_request_template\.md)$/i).map((f) => ({ path: f.path, label: "related file present" }))));

  // Dependencies
  {
    const T = "Lock file or exact pins found"; const W = "Unlocked dependencies can change underneath the tool between one run and the next."; const L = "Looks for a lock file or exact pins. It does not check the dependencies for known vulnerabilities.";
    const deps = pkgJson && ((typeof pkgJson.dependencies === "object" && pkgJson.dependencies !== null && Object.keys(pkgJson.dependencies as object).length > 0) || (typeof pkgJson.devDependencies === "object" && pkgJson.devDependencies !== null && Object.keys(pkgJson.devDependencies as object).length > 0));
    if (deps) {
      const lock = files.some((f) => /^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(base(f.path)));
      results.push(lock ? make("lockfile", "Dependencies", T, W, L, "pass", "Lock file found for package.json.") : make("lockfile", "Dependencies", T, W, L, "fail", "package.json lists dependencies but there is no lock file.", pkg ? [{ path: pkg.path }] : []));
    } else if (reqs) {
      const lines = reqs.content.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !l.startsWith("-"));
      const loose = lines.filter((l) => !/==/.test(l));
      results.push(loose.length ? make("lockfile", "Dependencies", T, W, L, "fail", loose.length + " of " + lines.length + " requirement line" + (lines.length === 1 ? "" : "s") + " not pinned with ==.", [{ path: reqs.path }]) : make("lockfile", "Dependencies", T, W, L, "pass", "All requirement lines are pinned with ==."));
    } else if (pyproject) {
      const lock = files.some((f) => /^(poetry\.lock|uv\.lock|pdm\.lock)$/.test(base(f.path)));
      results.push(lock ? make("lockfile", "Dependencies", T, W, L, "pass", "Lock file found for pyproject.toml.") : make("lockfile", "Dependencies", T, W, L, "cannot-tell", "pyproject.toml found with no lock file. Whether it has dependencies is not parsed here."));
    } else results.push(make("lockfile", "Dependencies", T, W, L, "n/a", "No dependency manifest found."));
  }
  {
    const T = "No wildcard dependency versions"; const W = "A version of * or latest installs whatever is newest on the day."; const L = "Checks package.json version strings only.";
    if (!pkgJson) results.push(make("wildcards", "Dependencies", T, W, L, "n/a", "No readable package.json."));
    else {
      const all: Record<string, unknown> = { ...(pkgJson.dependencies as object | undefined), ...(pkgJson.devDependencies as object | undefined) };
      const bad = Object.entries(all).filter(([, v]) => typeof v === "string" && /^(\*|latest|x|)$/.test(v.trim()));
      results.push(bad.length ? make("wildcards", "Dependencies", T, W, L, "fail", bad.length + " dependenc" + (bad.length === 1 ? "y uses" : "ies use") + " * or latest: " + bad.map(([k]) => k).join(", ") + ".", pkg ? [{ path: pkg.path }] : []) : make("wildcards", "Dependencies", T, W, L, "pass", "No * or latest versions."));
    }
  }

  // Security
  {
    const found = scan(files, SECRET_PATTERNS, (f) => !/\.(lock|svg)$/i.test(f.path) && !/package-lock\.json$/.test(f.path));
    const T = "No match for the listed secret patterns"; const W = "Keys committed to a repository are exposed to everyone who can read it, and stay in its history.";
    const L = "Matches a short list of patterns. It will miss other secrets and git history. A pass does not mean the code is free of secrets. Matched text is never shown or stored here.";
    results.push(found.length ? make("secrets", "Security", T, W, L, "fail", found.length + " match" + (found.length === 1 ? "" : "es") + " for secret patterns. The values are not shown. Treat any real key found as exposed and rotate it.", found) : make("secrets", "Security", T, W, L, "pass", "No match for the listed patterns in " + files.length + " files."));
  }
  {
    const envFiles = files.filter((f) => /^\.env(\.[a-z0-9_-]+)?$/i.test(base(f.path)) && !/\.(example|sample|template)$/i.test(base(f.path)));
    const T = "No environment file found in scanned files"; const W = "Environment files usually hold credentials."; const L = "Judges by file name. It does not read the values.";
    results.push(envFiles.length ? make("env-file", "Security", T, W, L, "fail", "Environment file committed. Its contents are not shown.", envFiles.map((f) => ({ path: f.path }))) : make("env-file", "Security", T, W, L, "pass", "No .env file among the scanned files."));
  }
  {
    const usesEnv = code.some((f) => /process\.env|os\.environ|getenv\(/.test(f.content));
    const T = "Ignore rules cover environment files"; const W = "A tool that reads settings from the environment will have a local env file sooner or later."; const L = "Looks for .env in .gitignore.";
    if (!usesEnv) results.push(make("env-ignore", "Security", T, W, L, "n/a", "Code does not read environment variables."));
    else results.push(gi.length && /(^|\n)\s*\.env/.test(gi[0].content) ? make("env-ignore", "Security", T, W, L, "pass", ".gitignore lists .env.", [{ path: gi[0].path }]) : make("env-ignore", "Security", T, W, L, "fail", "Code reads environment variables but .gitignore does not list .env."));
  }
  {
    const found = scan(code, RISKY_CALLS);
    const T = "No match for the listed risky patterns"; const W = "These calls turn text into code or commands, which is how injected input becomes an action."; const L = "Pattern search. Many safe uses exist and many unsafe patterns are not on the list. A fail means a person should look, not that the code is broken.";
    results.push(found.length ? make("risky-calls", "Security", T, W, L, "fail", found.length + " place" + (found.length === 1 ? "" : "s") + " to review.", found) : make("risky-calls", "Security", T, W, L, "pass", "None of the listed patterns found in the scanned files."));
  }
  {
    const T = "External calls have error handling"; const W = "A tool that calls out and never handles failure produces silent wrong answers or crashes."; const L = "Detects try/catch, .catch, except or timeout in the same file. Presence does not mean the handling is correct, so this gate can only pass as cannot-tell.";
    const net = code.filter((f) => NET_RE.test(f.content));
    if (!net.length) results.push(make("net-errors", "Security", T, W, L, "n/a", "No network calls found."));
    else {
      const bare = net.filter((f) => !HANDLE_RE.test(f.content));
      results.push(bare.length ? make("net-errors", "Security", T, W, L, "fail", bare.length + " file" + (bare.length === 1 ? "" : "s") + " make network calls with no error handling or timeout.", bare.map((f) => ({ path: f.path }))) : make("net-errors", "Security", T, W, L, "cannot-tell", "Error handling is present. Whether it is correct needs a person.", net.map((f) => ({ path: f.path }))));
    }
  }

  // LLM-specific
  const llmFiles = code.filter((f) => LLM_RE.test(f.content));
  {
    const T = "README mentions LLM use"; const W = "People relying on the tool should know that part of it is a model, what is sent to it and which model."; const L = "Keyword check in the README.";
    if (!llmFiles.length) results.push(make("llm-disclosed", "LLM-specific", T, W, L, "n/a", "No LLM library or API call detected."));
    else {
      const t = readme ? lc(readme.content) : "";
      results.push(/\b(llm|model|prompt|openai|anthropic|gpt|claude)\b/.test(t) && /\b(sent|send|data|leaves|third.party)\b/.test(t)
        ? make("llm-disclosed", "LLM-specific", T, W, L, "pass", "README mentions the model and what is sent. Accuracy is for a person to check.", llmFiles.map((f) => ({ path: f.path })))
        : make("llm-disclosed", "LLM-specific", T, W, L, "fail", "An LLM is used but the README does not say which model or what data is sent.", llmFiles.map((f) => ({ path: f.path }))));
    }
  }
  {
    const T = "No match for the listed model-output execution patterns"; const W = "Running text from a model as code or commands lets a bad prompt or bad answer act on the system."; const L = "Only matches eval/exec-style patterns in the same file as a model call. Other unsafe uses of model output are not detected, and a clean result is not evidence that output is handled safely.";
    if (!llmFiles.length) results.push(make("llm-output", "LLM-specific", T, W, L, "n/a", "No LLM use detected."));
    else {
      const bad = scan(llmFiles, RISKY_CALLS.filter((r) => /eval|Function|system|shell|exec/.test(r.label)));
      results.push(bad.length ? make("llm-output", "LLM-specific", T, W, L, "fail", "A file that calls a model also uses a code-execution call.", bad) : make("llm-output", "LLM-specific", T, W, L, "pass", "No listed code-execution pattern in the scanned files that call a model."));
    }
  }
  results.push(make("llm-eval", "LLM-specific", "Evaluation-like file found (quality not judged)", "A model-backed tool needs a way to notice when answers get worse.", "Quality of model output cannot be checked from files. A script can only see that an evaluation file exists, not that it is good.", llmFiles.length ? "cannot-tell" : "n/a",
    llmFiles.length ? (has(/eval|golden|fixtures?/i).length ? "Evaluation-like files exist. Whether they measure the right thing needs a person." : "No evaluation-like files found. A person must decide how quality is judged.") : "No LLM use detected."));

  const counts: Record<Status, number> = { pass: 0, fail: 0, "cannot-tell": 0, "n/a": 0 };
  results.forEach((r) => { counts[r.status] += 1; });
  const outcome: GateReport["outcome"] = counts.fail > 0 ? "blocked" : "human-review";
  const outcomeText = counts.fail > 0
    ? counts.fail + " gate" + (counts.fail === 1 ? "" : "s") + " failed. Fix or explain them before this tool is relied on."
    : "No gate failed. That is not approval: " + counts["cannot-tell"] + " gate" + (counts["cannot-tell"] === 1 ? "" : "s") + " cannot be checked from files and a person still has to review the tool.";
  return { results, counts, outcome, outcomeText, filesScanned: files.length };
}

// A shareable summary that contains no file contents and no matched text.
export function reportToJson(r: GateReport): string {
  return JSON.stringify({
    outcome: r.outcome, outcomeText: r.outcomeText, filesScanned: r.filesScanned, counts: r.counts,
    gates: r.results.map((g) => ({ id: g.id, category: g.category, status: g.status, summary: g.summary, evidence: g.evidence.map((e) => ({ path: e.path, line: e.line ?? null, label: e.label ?? null })) })),
    note: "Checkable proxies only. Not a security assurance. No file contents or matched values are included.",
  }, null, 2);
}
