# AI backend — private beta candidate

Base: `e3eca3a7248955b161672ec2d85091f723ee191b`, tree
`10854b5a06436b03dec1a1a4833d137233f18c44`.
Implementation branch: `backend/ai-beta`. No deployment is included.
Security Gate and production remain **BLOCKED**. This is a candidate for review,
not production approval or an independent model-level security evaluation.

## Architecture and activation

The existing `POST /api/analyze` path remains: HTTP/parser/origin/session/rate/body
checks → privately prepared, validated input → deterministic rules → bounded
queue → server-only provider → strict observation validation → server-owned
reconciliation → the existing structured result. The CR03 preparation is reused;
the rules engine and all security limits are unchanged.

Default `AI_MODE=rules` sends nothing externally and creates no AI budget store.
The new profile requires both `AI_MODE=ai` and `AI_BETA_ENABLED=true` plus valid
provider/budget configuration. Without the beta flag, the existing legacy AI
contract and error behavior are retained for compatibility. The beta flag
selects the strict observations contract and rules fallback; it does not by itself
enable AI. An invalid configuration authorizes no provider request.

The existing production guard still rejects AI mode, credentials and nonzero AI
budgets with `NODE_ENV=production`. It has deliberately **not** been relaxed.
Private-beta deployment/startup approval requires a separate security decision;
do not bypass the guard by disguising a production service as development.

`OpenAICompatibleProvider.complete({messages, schema, model, maxOutputTokens,
signal})` is the provider interface. It uses server-side Chat Completions with
`response_format.json_schema.strict=true`, `store=false`, streaming disabled,
redirects rejected, fatal UTF-8 decoding and a 65,536-byte response ceiling.
No tools, web fetches, images, PDFs or agent framework are involved.
The existing worker, queue and atomic SQLite budget reservation are reused.

### Model and environment configuration

The beta default is the pinned `gpt-4.1-mini-2025-04-14` model, appropriate for
small text classification requests with Structured Outputs. Both this snapshot
and `gpt-4.1-mini` appear in OpenAI's current official SDK model registry:
<https://github.com/openai/openai-python/blob/main/src/openai/types/shared/chat_model.py>.
The model documentation is <https://platform.openai.com/docs/models/gpt-4.1-mini>.
The documentation site was unavailable in this workspace; the official SDK
registry was retrieved. API availability, latency and classification quality have
not been live-verified. Use a model supporting strict JSON Structured Outputs and
`max_completion_tokens`; a model-name change is configuration, not business logic.

| Setting | Beta behavior |
| --- | --- |
| `AI_MODE` | `rules` by default; `ai` explicitly enables the existing AI path |
| `AI_BETA_ENABLED` | Exactly `true` selects this observation/fallback profile; default false |
| `GUARD_LLM_API_KEY` | Server-only secret; first preference if supplied |
| `OPENAI_API_KEY` | Standard server-only secret alias, used when the above is absent |
| `AI_ENDPOINT` | Default `https://api.openai.com/v1/chat/completions`; admin-only HTTPS URL, no credentials/query/fragment or redirects |
| `AI_MODEL_SIMPLE` | Default beta snapshot above; optional model override |
| `AI_MODEL_COMPLEX` | Defaults to the same model; optional routing override |
| `AI_INPUT_USD_PER_MILLION` | **Required** positive upper-bound input price for both configured models |
| `AI_OUTPUT_USD_PER_MILLION` | **Required** positive upper-bound output price for both models |
| `AI_DAILY_REQUEST_LIMIT` | Default 0; explicit attempt cap required to send any request |
| `AI_DAILY_BUDGET_MICRO_USD` | Default 0; explicit daily reservation cap required |
| `AI_TOTAL_BUDGET_MICRO_USD` | Default 0; explicit lifetime reservation cap required |
| `AI_BUDGET_DB` | Persistent single-host ledger, default `data/ai-budget.sqlite`; file mode 0600, newly created parent 0700 |
| `AI_DEPLOYMENT_MODE` | Only `single-host` supported; distributed budgets are not implemented |
| `AI_TIMEOUT_MS` | Default 10,000; 1,000–20,000; includes queue wait and retries, below default HTTP deadline |
| `AI_WORKER_CONCURRENCY` | Default 1; allowed 1–2 |
| `AI_QUEUE_CAPACITY` | Default 8 pending jobs; allowed 0–20 |
| `AI_MAX_INPUT_TOKENS` | Conservative upper bound, default 24,000; allowed 8,192–64,000 |
| `AI_MAX_OUTPUT_TOKENS` | Default 800; allowed 256–4,096 |
| `AI_MAX_RETRIES` | Default 0; at most one explicit retry for provider HTTP 429/503 |
| `AI_CRITIC_ENABLED` | Must be false/unset in beta; this profile uses one analysis pass |
| `AI_ALLOW_LOCAL` | Default false; explicit loopback-only HTTP exception for test/self-hosted adapters |

Never put a real secret in a command, this document, Git, browser configuration
or test fixture. Prices must be checked against current provider billing, including
the more expensive routed model. Reservation caps bound configured estimated
spend; they are not a billing invoice or protection against an underpriced admin
configuration. Set a separate provider-side project spending cap as well.
Keep the budget file durable; deleting/replacing it resets recorded reservations.

## Observation contract: `observations-v1`

```json
{
  "schema_version": "observations-v1",
  "observations": [
    {"kind": "payment_request", "evidence": "Pošli ihned peníze"}
  ],
  "uncertainty": "medium",
  "insufficient_information": false
}
```

All four top-level fields are required. No unknown fields are allowed at any
object level. Up to eight observations; every observation has exactly `kind` and
`evidence`. Evidence must be nonblank, at most 240 UTF-16 code units and a literal
substring of the original input. Categories cannot repeat. Uncertainty is exactly
`low`, `medium` or `high`; insufficient information is a boolean, not a string.

Allowed categories: `payment_request`, `credential_request`, `install_software`,
`remote_access`, `link_following`, `contact_switch`, `urgency`, `secrecy`,
`claimed_authority`, `unrealistic_return`, `advance_fee`, `emotional_pressure`.

The model cannot provide a score, verdict, summary, UI text, sources, contacts,
verification claims or instructions. Evidence is checked privately and discarded
from the public result. All visible AI signal titles/explanations and all actions
come from the fixed server catalogue or existing rules templates.
Literal evidence establishes text provenance; it cannot prove the model's
interpretation is correct. Semantic false positives/negatives remain possible.

## Trust, reconciliation and result compatibility

The trusted system instructions and a single user JSON object containing only
`untrusted_content` are separate messages. Instructions, HTML, contacts and
claims inside that content are data. No session ID, client IP, bot token, internal
analysis ID, rule metadata or Loan Checker answer fields are sent to the provider.
No model text becomes HTML, a trusted contact or a browser navigation target.
The provider is not allowed to select its endpoint or run tools from input.

All deterministic signals are preserved. Contextual signals use fixed category
IDs/titles/explanations. The internal score is the greater of the rule score and
the capped sum of server-owned category weights; it cannot fall below the rules.
Weights are an uncalibrated heuristic, not fraud probabilities. Existing
`risk_score`/`risk_level` fields remain for contract compatibility, but no numeric
score is introduced into the public UI. The existing neutral frontend is unchanged.
No observations means unassessed, never safe. Insufficient information remains
visible and raises reported uncertainty; it never erases established warnings.
Even a model's `low` uncertainty is capped at medium when observations exist.

A successful response retains `engine=rules+ai-v1` and adds
`ai_status=performed`. There is no critic pass. Complex routing uses the existing
conditions (over 1,500 characters, at least three rule signals, or rule score ≥60);
by default both routes use the same inexpensive model.

## Resilience, fallback and cost

AI configuration/provider/refusal/malformed-output/timeout/overload/budget
failures in the beta profile return the **existing rules result** with
`engine=rules-v1`, `ai_status=not_performed`, a bounded `ai_fallback_reason` and
an explicit limitation saying AI was not completed. No AI signals survive an
invalid assessment. No generic provider error text, status body or secret leaks.
Fallback reasons: `timeout`, `overloaded`, `budget_exhausted`, `budget_unavailable`,
`not_configured`, `invalid_response`, `input_limit`, `text_only`,
`provider_unavailable`. Refusal/truncation are treated as unusable responses;
429/503 do not cause retries by default. Network errors never retry automatically.
Only a configured single retry for explicit 429/503 is possible; it requires a
fresh budget reservation and fits within the same request deadline.

The 10,000-character and 16,000-UTF-8-byte input limits remain. Invalid input,
missing `ai_consent=true`, parser/origin/session/rate/body errors and caller
cancellation remain errors, not successful fallback analyses. A valid input
exceeding the AI-specific token bound still receives rules without sending AI.
URL-only inputs get rules (`text_only`); no URL target is visited. URLs in text
remain untrusted message content, not requests for external verification.

The queue timeout aborts provider fetches. A worker ignoring cancellation retains
its slot until it actually finishes; timeouts cannot create unlimited replacement
workers. Budget attempts and conservative cost are atomically reserved before
**every** send, across workers sharing the same SQLite store. Exhausted or broken
budgets send nothing more. Failed/aborted calls are not refunded, conservatively.
The existing per-IP/session/global HTTP quotas and admission controls precede AI
and remain untouched. Multi-host queue/budget enforcement is not supported.

## Privacy and current integration limits

Only necessary text is sent, after explicit consent. The application holds text
and provider responses in request/job memory; it does not persist or log them.
SQLite stores daily counts and reserved costs only. API credentials are confined
to server provider authorization. `store=false` requests no Chat Completions
storage; it is **not** a zero-retention promise or control of provider abuse logs.
Provider/account retention, legal disclosures and all hosting/proxy logs still
need independent validation before actual private-beta use with personal data.

The unmodified frontend renders successful AI and runtime fallback responses
truthfully through their engine fields. If configuration is unavailable at startup,
the existing frontend still disables submission when `ai_configured=false`;
the backend fallback is available to consented API calls, but enabling that UI path
requires a separately reviewed frontend change. No frontend change is included.
Current privacy-page wording and operator details need reconciliation for an
approved deployed AI configuration; public files were not edited here.

The isolated Loan integration preparation is described in
[AI_LOAN_INTEGRATION.md](AI_LOAN_INTEGRATION.md). Validated questionnaire answers
remain local: only message-derived rules can affect provider routing or budgets.
Reconciliation retains local Loan topic, warnings, summary, uncertainties and
guidance. No Loan frontend files or flows changed. This endpoint is not an
underwriting, creditworthiness or financial-advice engine. The original dirty
`backend/ai-beta` worktree remains unchanged.

## Verification

Pinned intended runtime: Node 24.21.0. No dependencies added.

```sh
node --test tests/ai-beta.test.js
npm test
npm run check
npm run test:claude
node scripts/security-browser.js
node scripts/ai-beta-browser.js
```

Browser checks use the existing externally installed Playwright and Chromium;
set `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` as in the workspace workflow.
Canonical browser checks include no-JS/module-failure privacy regressions and M9.
The beta browser checks the actual unchanged frontend against a synthetic worker:
consent, neutral score-free result, truthful fallback, and no external requests.
Tests exercise the actual provider protocol against loopback HTTP servers, strict
schema/evidence rejection, injection boundaries, rule floors, cancellation/queue
limits, budgets/retries, session/CSRF/rate checks, and minimum/log-free payloads.

There are no credentials in this environment. **Live OpenAI API verification:
NOT VERIFIED.** Mocked responses verify protocol and server policy, not live
model quality or resistance to prompt injection. When existing secure credentials
and explicit small caps are supplied to an authorized test environment,
`npm run test:live` is the existing bounded synthetic smoke command. Keep retries
off; do not confuse successful rules fallback with a successful live AI check.

CR03 acceptance tests/thresholds are unchanged. No performance campaign is part
of this task. The previously accepted 25.113 ms private-beta performance
observation remains evidence; it is not a production waiver.
