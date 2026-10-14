# Stage 7 — Důvěryhodnost: review

## Decision

**GO for feature review. No production merge or deployment performed.**

Branch: `feat/stage7-trust`. Baseline verified from the remote production branch: `d3e5a355315a55c161b179f17a2c9d01280b5075`. The review covers the Stage 7 changes committed together with this document (the final commit SHA is reported after committing).

## S7.1–S7.5 implemented

- Static `/o-projektu` explains the project's purpose, approved author Patrik Porteš and GrowMate brand, six checkers, limitations and actual privacy boundaries. Both approved core statements included. No invented qualifications, certifications or legal status.
- Static `/kontakt`: approved identity, mailto and brand link, warning against sending sensitive information, urgent next-step link; no contact form.
- Identical semantic footer on all 12 public HTML pages, including privacy and 404. Five approved links, attribution and limitation statement. Existing cartoon assets unchanged.
- Privacy corrected: messages/loan text use the application server, AI is consent-dependent; web/contract/investment local processing is distinguished from IČO/name registry queries. Documented optional firm checks from contract results. Described aggregate message counts separately from abuse-protection records and HTTP traffic.
- Fixed stale analytics copy: the code permits Web Analytics script only on `/` and `/privacy`; recovery page forbids external scripts. New pages add no script, tracking or cookie. Public `/api/contract-status` independently confirmed configured:false.
- Titles, descriptions, canonical and Open Graph for both pages; privacy metadata updated; sitemap preserves nine existing URLs and adds two new ones. Keyboard skip targets and 48px footer links; scoped information-page/footer styling.
- Only server change: two static whitelist entries. APIs, checker algorithms, relay, limits, CSP and deployment configuration unchanged. No old F5a/worktrees touched.

## Test evidence

- Complete `npm test` in isolated Linux Docker test environment: **501/501 PASS**, zero failed/skipped, followed by **strict security gate 16/16 PASS** (nine existing TODO labels retained). Docker test image is a development browser/runtime environment on the Mac; this is not a native production Linux build or deployment gate claim.
- `npm run check`: PASS.
- Focused Stage 7/M9/investment-page suite: **19/19 PASS**.
- Browser: **84 page/viewport combinations PASS**, all 12 public page layouts at 320, 360, 390, 430, 768, 1024 and 1280 px; no horizontal overflow, five footer links >=48px and inside viewport; keyboard skip-link focuses the heading, all footer links reachable. No external requests; new pages make no API requests.
- Screenshots manually inspected. Evidence saved outside Git in `outputs/stage7`.
- Existing M9 resource/active-content prohibitions remain: only the exact approved GrowMate anchor is now accepted in the body. No generic external resource allowance. The sitemap assertion now expects exactly eleven entries.

## Environment findings and resolution

Initial macOS complete run: 13 failures. Two stale assumptions introduced by the intended Stage 7 content change (nine sitemap entries; no external footer anchor) updated with narrowly scoped assertions. Missing pre-existing admin dependency `jose` installed from its existing lockfile in this isolated checkout using a temporary npm cache; no dependency/version or lockfile changes. Ten deployment/ingress failures (`flock` missing and `127.0.0.2` unavailable) reproduced on a pristine export of the baseline: 6/16 PASS, 10 identical failures. The complete suite passes in Linux Docker. No production code or test weakening used to work around platform failures.

## Limitations / release conditions

No blocking code findings. This is transparent project information, not a legal compliance certification. Provider contractual details/retention remain explicitly unverified in privacy copy, rather than invented. No new external integration was added. Before any later production deployment, follow the existing approved release process and its native build/rollback gates. Stage 8 artwork changes are intentionally absent.
