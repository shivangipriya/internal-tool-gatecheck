# Internal tool gate check and return ledger

A small prototype for one question: when an internal tool is built with AI, how do you know it is dependable, and what did it return?

It has two parts. Everything runs in the browser. Nothing is uploaded. All bundled examples are synthetic.

## 1. Gate check

Runs about 19 checks over a tool's files (README purpose and owner, test files, CI file, lock file, ignore rules, env files by name, secret-like patterns, risky calls, error handling on external calls, and LLM-specific checks such as disclosure and evaluation). Each check returns pass, fail, cannot tell, or not applicable. Checks that look for a problem (secrets, risky calls, env files) pass only when no listed pattern matched in the scanned files. Checks that look for something present (test files, CI file, lock file, README sections) pass only when a matching file or text was found. Neither kind says anything about quality, coverage or correctness. Each check shows its own rule and what it cannot tell.

What it does not do:
- It does not say a tool is approved. The best outcome is "not blocked by these gates, human review still required".
- A test file, a CI file or a try/catch is not evidence of quality or coverage. The checks only see that they exist.
- Branch protection and required review live in repository settings, so that check always says cannot tell.
- Secret patterns are a short list. A pass does not mean the code is free of secrets. Matches are reported as file, line and label only. The value is never shown or exported.

## 2. Return ledger

Takes eleven monthly inputs, each tagged measured or estimated (tasks per month, manual and tool minutes, review minutes, error rates, rework minutes, build hours, upkeep hours, run cost, loaded cost per hour). It also takes a horizon in months and whether savings are cash or capacity; those two are not tagged.

It reports net hours, net value, break-even, and net hours per 100 tasks (to compare functions). It also shows the share of inputs tagged measured. That share counts inputs. It is not a quality score or a validation, and there is no letter grade.

Estimated inputs are moved 30 percent either way to show how much the answer depends on them. This is a sensitivity assumption of the page, not a confidence interval. The page only says a result is positive or negative "under the chosen assumptions". If every input is estimated, it says it cannot give a measured-only net return. A blank input is rejected, never treated as zero. Tasks are counted per month and money is in unlabelled cost units, not a currency. Freed time (capacity) and cash are kept apart and never added.

A persistent "SYNTHETIC DEMO" notice sits in the ledger result. The example numbers and the measured/estimated tags are invented to exercise the logic. They are not results from any real tool.

## Run

    npm ci
    npm test        # type check, build, unit tests
    npm start       # builds and serves locally (set PORT to change the port)
    npm run e2e     # optional, needs Chrome

Strict TypeScript compiled with tsc. No runtime dependencies.

## Limits

See TESTING.md. This is a prototype with synthetic examples. It has not been validated against real repositories, and the ledger's 30 percent variation is a stated assumption, not a measured one.

MIT licence.
