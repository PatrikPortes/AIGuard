# AI Beta / Loan integration preparation

Candidate branch: `integration/ai-beta-loan-prep`.
Exact frontend base: `d92a15ce861ca05e06ed4562347b0a3f0a1f5c93`, tree
`18dee2373b4e2b20e58942e4c63d6bde955f33a0`; parent
`46f7f84791fe48b537c4ef7591f6460b504fd45f`.
Backend source: preserved, uncommitted `backend/ai-beta` worktree at
`e3eca3a7248955b161672ec2d85091f723ee191b`. The source worktree is not modified.
This candidate copies its existing implementation into an isolated worktree;
it does not merge branches, activate AI or authorize deployment.

## Compatibility matrix

| Requirement | Existing mismatch | Minimal integration / remaining action |
| --- | --- | --- |
| Loan privacy | Observation worker routes using local answer-derived rule weights/signals | Share the legacy worker's text-only provider rule view; verify complete raw HTTP bodies, model, call counts and reserved cost across every answer variant |
| Loan metadata | Observation reconciliation omits topic and local uncertainties; replaces summary | Preserve topic, complete local signals, Loan summary, actions and verification; retain Loan uncertainties |
| Explicit fallback | Beta contract already labels it | Keep `engine=rules-v1`, `ai_status=not_performed`, bounded `ai_fallback_reason` and explicit limitation; never report AI success |
| Frontend AI/fallback rendering | Frontend uses engine/source/uncertainty fields | Keep existing fields, validate the actual backend responses in browsers |
| Unconfigured AI with permitted rules fallback | `public/app.js` ignores `rules_fallback` and disables submission | **OPEN frontend handoff below; frontend files remain unchanged** |
| Security | Existing beta profile provides strict observations and fail-closed budget | Reuse it without relaxing consent, limits, CSRF, parser, queue, guard, schema or retry policy |

## Data boundary

Local `topic=loan` and `loan_context` are validated and retained by the server.
They influence only local warnings and guidance, not messages, model routing,
critic selection, retries, token bounds, reserved cost or provider-bound metadata.
The provider-facing rule view is derived from the original message alone.
Routing still uses the existing length/signal/score conditions; no checks are
removed. The observation profile still runs one pass with no critic.
The model receives only trusted instructions and `untrusted_content`.
If a user themselves writes an answer into the message, that text is necessarily
part of the consented input; the questionnaire fields are never appended to it.

Reconciliation preserves every local signal (with `source=rules`), the Loan
topic, exact server-generated Loan summary, recommendations, verification steps
and Loan-specific uncertainty wording. One generic processing notice changes
from “rules, not AI” to “the rules part uses rules” after an actual successful AI
call; retaining its old wording would misrepresent processing. Rules fallback
retains the original notice unchanged. Model-generated prose is never guidance.

## Precisely scoped frontend handoff (not implemented here)

Only `public/app.js:initialize()` and focused browser coverage need changing:

1. In AI mode derive submission availability from the **existing** public flags:
   `runtime.ai_configured || runtime.rules_fallback === true`.
   Do not reinterpret `ai_configured` or add an API field.
2. Permit submission if that expression is true; otherwise retain disabled state.
3. Keep the existing required consent checkbox available in AI mode whenever
   submission is permitted. The backend still requires `ai_consent=true`, even
   for unavailable-AI fallback; do not auto-consent or weaken that guard.
4. When unconfigured but fallback is permitted, explain that AI is unavailable
   and this attempt uses local rules only. Do not claim an AI call was made.
   Keep the consent wording truthful about any future configured submission.
5. Retain existing engine-based rendering: successful AI shows the AI section;
   ordinary rules do not; AI-mode rules fallback shows its explicit limitation.
6. Add a real-backend browser regression for `ai_configured=false` plus
   `rules_fallback=true`, consent absent/present, successful local submission,
   truthful fallback label and no provider call. Also retain the unavailable
   case with `rules_fallback` absent/false; it must remain disabled.

This is a frontend integration blocker, not permission to change that branch.
The backend must not lie about configuration to work around it.

## Reproducible verification

Use Node 24.21.0 and the existing Playwright/Chromium installation. No dependency
installation is needed. Local provider fixtures use synthetic text and loopback
HTTP; no live external AI is enabled.

```sh
node --test tests/ai-loan-integration.test.js
npm test
npm run check
npm run test:claude
node scripts/security-browser.js
node scripts/loan-browser.js
node scripts/beta-ux-browser.js
node scripts/ai-beta-browser.js
node scripts/ai-p0-browser.js
node scripts/ai-loan-integration-browser.js
node scripts/frontend-browser.js
node scripts/contrast-check.js
node scripts/frontend-budget.js
```

The focused raw-HTTP test compares all serialized bytes and reservation counters
for 13 questionnaire variants, three identical-content corpora, low/high model
uncertainty and an explicit one-retry 503 scenario. Fresh default-limited server
instances retain session/Origin/rate protections in each independent case.
Browser evidence must report the unconfigured fallback blocker, not hide it.
Existing legacy critic/privacy tests remain unchanged.

Live model/schema quality, semantic prompt-injection evaluation, deployed privacy
wording/logging, distributed budgets, production activation policy and staging
remain separate gates. Historical performance failures remain evidence; an
isolated passing test does not close them. Security Gate and Production are
**BLOCKED**. No commit, push, merge or deployment is authorized by this document.
