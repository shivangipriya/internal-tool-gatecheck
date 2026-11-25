# Testing

`npm test` runs the type check, the TypeScript build and the Node test suite (51 tests at the time of writing; the command prints the current count): gate logic per synthetic sample, outcome wording (never "approved"), secret values absent from the report and the JSON export, ledger arithmetic, variation range and sign-stability logic, blank costs rejected, the synthetic-demo notice, no letter grade, input validation (NaN, negatives, zero tasks, share above 1), and HTML escaping in the views.

`npm run e2e` drives the page in headless Chrome: loads samples, checks the report and outcome text, edits the ledger, switches measured/estimated, checks the compare table, loads a folder through the picker, confirms the synthetic key string never reaches the page, no horizontal overflow at 390 px, and no console errors.

Not tested: real repositories at scale, other browsers, screen readers, accuracy of the checks against real defects. Test counts show the code behaves as written. They do not show the checks are right.
