# Responsive layout, current copy and firm-name search

Base: `289f27389e75957ba3f2135bde35b8bf2bc3b031` (current remote release branch, includes Stage 4).

## Changes

- Reviewed homepage, six checker entry pages, privacy, recovery guide and 404 at 320, 360, 390, 430, 600, 768, 1024, 1440 and 1920 CSS pixels.
- Improved narrow-screen padding, long-label wrapping, navigation reflow, minimum control widths and contract heading/guide spacing. Existing character assets and design tokens retained.
- Updated homepage to six tools, including investment inputs and limits. Documented firm-name data flow and local investment analysis in privacy copy; corrected 404 navigation.
- Firm form accepts either IČO or a partial name (3–100 characters). Every candidate requires explicit selection before `/api/firm`, including a single match. Existing IČO-only flows and orchestrator are unchanged.
- New `/api/firm-search` extends current same-origin/session/admission controls. Uses the same firm source instance and shared two-slot admission gate, with 5 searches/session/minute and 10 searches globally/minute.
- Authenticated `/v1/registry/ares-search` extends the existing relay: fixed ARES POST endpoint, no redirects, 3.5s upstream deadline, streamed 256 kB response cap, two concurrent searches, 10 upstream calls/minute, exact request validation. No arbitrary host/path/URL or AI.
- Responses include only validated IČO, name and public business seat; sole traders show only municipality. Searches are not cached or persisted. Candidate names rendered using `textContent`.

## Search limits

Results are paginated in groups of 10, with the total count and next/previous controls. All matches can be visited within the official ARES search ceiling of 1,000; broader searches request a more specific name or IČO. Failures are explicit, never represented as a successful empty match or a positive verdict. Search does not infer a relationship between a website and a company.

Official schema verified: https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/v3/api-docs (`POST /ekonomicke-subjekty/vyhledat`, `obchodniJmeno`, `start`, `pocet`). A single read-only official smoke query confirmed a partial name returns multiple candidates. Automated tests use mocked registries.

## Evidence

- 90 entry-page/viewport combinations: no horizontal overflow or header collisions.
- Message, web, contract and investment results at 320/390/768/1440: no overflow or guide/headline collision; loan calculator results checked at the same widths.
- Firm-name flows at 320/390/1440: explicit single-match selection, pagination (12 matches), unavailable-source errors and safe literal rendering of hostile text.
- Targeted registry/API/orchestrator/investment/release tests: 67 PASS (including the homepage/privacy copy assertion).
- Loan/contract/verdict regressions: 34 PASS.
- Existing firm browser suite: 20 mobile result scenarios PASS (IČO flow, errors, focus, 48px targets and XSS).
- `npm run check`: PASS. Existing strict security gate: 16/16 PASS (9 original TODO labels preserved).
- Screenshots and full reports are local evidence in `outputs/responsive-review` outside the application Git tree.

## Release

Not deployed. Deploy both web and existing relay from this commit through the established release process; relay first because the new search route is needed by the web. No production environment, Docker/network/firewall, CSP, AI settings or analytics changes are required. Existing deployment machinery and rollback remain unchanged.

Protected pre-existing worktrees/F5a were not modified. Only this isolated branch was changed.
