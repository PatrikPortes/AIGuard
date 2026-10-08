# Claude independent security re-review — immutable remediation candidate

## Evidence identity and provenance

| Item | Value |
| --- | --- |
| Reviewed commit | `87b96cded187b9a200b5aa27a0b10d97fafe0e40` |
| Reviewed tree | `939b12e40d5400329c57dd80904a00585fb38e3f` |
| Reviewed commit's parent | `fde14ba57d62ba9e6aab0181170386a1d38da7a1` |
| Reviewed branch | `security/gate-1-remediation` |
| Documentation branch base / intended parent | `87b96cded187b9a200b5aa27a0b10d97fafe0e40` |
| Documentation branch | `security/gate-1-staging-prep` |
| Independent reviewer | Claude; complete response supplied by the owner in this task |
| Independent verdict | **INDEPENDENT SECURITY RE-REVIEW: CONDITIONAL PASS** |
| Independent recommendation | **GO FOR CONTROLLED STAGING** |
| Production status | **BLOCKED — not authorised** |

The complete supplied response, including the preliminary investigation notes, is preserved verbatim in the text block below. The introductory metadata and the context following the block are documentation by the implementing author, not additional independent review. No date, full artifact hash, raw probe output or reviewer signature absent from the supplied response has been invented. Abbreviated source/binary hashes remain abbreviated exactly as supplied. The reviewer’s underlying scratch artifacts are not attached to this document.

## Complete independent response — verbatim

```text
The commit, tree and parent all match, and the candidate is the branch HEAD. Next I'll export the candidate to a scratch directory so the Git object can't be touched.

I confirmed nothing in Node v24.21.0's source tree, including V8 and bundled deps, references pb_ds or __gnu_pbds. Next, I'll verify the erase_if hits are just standard C++20 std::erase_if and check the image's libstdc++ for PBDS.

A28 is confirmed NOT AFFECTED—the erase_if hits trace to std::erase_if/V8 code, and libstdc++ has no PBDS symbols. Since Debian's source servers are blocked, I'll check A31 by testing whether the node process can load the system libz.

Node's statically linked zlib (1.3.2.1-motley) contains gz_vacate, which Codex's A31 analysis didn't cover. I'll read that code next to check if the bug is present there.

Confirmed Node statically links Chromium zlib 1.3.2, which falls in the CVE-2026-85091 affected range (contains gz_vacate, exports gzprintf/gzvprintf/gzwrite), though Trivy misses it and there's no exploitable path since Node core, its JS API, and addons never call the gz* file API. I'll log this as an informational finding and move on to the candidate's browser test.

CR-06 is now fixed in code — the cookie is properly __Host- prefixed, HttpOnly, SameSite=Strict, Secure with no Domain, invalid/duplicate shadow sessions are rejected, and the old unprefixed name no longer works. I'll flag the residual sibling-subdomain cookie-bomb risk and move on to confirming the candidate is unchanged.

The candidate matches across commit, tree, parent, remote branch head, and the scratch export is byte-identical to the git archive output. Next, I'll check whether ordinary emoji trigger the new "unusual characters" signal.

Independent security re-review: Security Gate 1 remediation
INDEPENDENT SECURITY RE-REVIEW: CONDITIONAL PASS

The remediation fixes or materially reduces every original finding. I found no path to code execution, secret disclosure or AI activation. Five availability and detection weaknesses remain (CR-01, CR-03, CR-04, CR-07 and the new RR-01); they need fixing or edge validation before production, but they don't block a controlled staging deployment.

Candidate identity
Item	Value
Commit reviewed	87b96cded187b9a200b5aa27a0b10d97fafe0e40, which is also the current head of origin/security/gate-1-remediation
Tree	939b12e40d5400329c57dd80904a00585fb38e3f
Parent	fde14ba57d62ba9e6aab0181170386a1d38da7a1
Branch	security/gate-1-remediation
Unchanged	Yes. I tested only a git archive export in a scratch directory. After the review, that export was still byte-identical to a fresh export, and the commit, tree, parent and remote head matched again.

My original suite inside the candidate (tests/adversarial/claude-review.adversarial.mjs) is byte-identical to my commit 1e26f6c (SHA-256 94eabe97…).

Original findings
CR-01 — PARTIALLY FIXED

Evidence:

IPv6 clients are now limited per /64. The limiter evicts its oldest entries instead of refusing new keys.
/api/session has its own bucket, capped at 10 sessions per /64 per minute.
The shared 600/min bucket is charged only by analyses that pass the Origin, session, body and validation checks.
Probe with 300 addresses in one /64: 10 got through, the rest were refused, and the unrelated victim got 200.
My original CR-01 and CR-01b assertions pass.

Remaining concern:

An attacker with 65 /64s, which all fit inside a single /56, used up the shared bucket (616 analyses), and the victim then got 429. /56 and /48 allocations are cheap and common; free tunnel brokers hand out /48s.
Shared-IPv4 users (mobile carriers put many subscribers behind one address) share per-IPv4 limits: 10 new sessions/min and 2 concurrent analyses. One abuser behind the same address can lock out everyone on it.
Needs: /56 and /48 aggregation (or edge rate limiting) before production, and a staging check of how Cloudflare reports client IPs and how many users share an address.
CR-02 — FIXED (the original property)

Evidence:

The body is read and validated before an analysis slot is taken.
Concurrent body reads are capped at 2 per client and 1 per session, and the body deadline is now 2 s.
My original CR-02 assertion passes: 8 slow bodies from one client no longer block the victim.
Malformed, oversized and over-UTF-8 bodies are still rejected (invariant tests 1–6 pass).

Remaining concern: a related but different resource can now be exhausted. See the new finding RR-01.

CR-03 — PARTIALLY FIXED

Evidence:

The original catastrophic regex is fixed: ztrati+l×9994 now takes 0.1–0.3 ms (was 188 ms).
All gaps in the rule patterns are bounded.
Plain-ASCII input skips normalisation entirely.

My own measurements, Node 24.21.0 on an unconstrained core:

Input (all within the accepted limits)	analyze() only	Real server path
U+FDFA + é repeated (16 000 bytes)	median 8.4 ms, p99 17.4, max 17.7 (0 of 300 runs over 20 ms)	median ≈24, p95 ≈47, max ≈53 ms
U+FDFA + a	median 8.7, p99 30.0, max 34.8 (5 of 300 over 20 ms)	median ≈25, p95 ≈51, max ≈52 ms
U+FDFA + á	max 24.3 (1 of 300 over)	median 26.5, p95 56.3, max 60.4 ms

Remaining concern:

Each request is NFKC-normalised three times: once in the server's pre-validation, once in pipeline.validate, and again inside analyze().
The 16 000-byte limit is checked after normalisation, so rejected inputs still cost about 4–20 ms of CPU each.
Codex's ≤ 20 ms evidence covers analyze() only. On this hardware I could exceed 20 ms on accepted inputs, so the historical 92 ms / 46 ms failures were real instability, not a fluke.
Under the container's cpus: 0.5 limit, expect about 2× these numbers. The worst case is now linear and capped, a 5–10× improvement over the original.
Fix: normalise once, check bytes before normalising, cap the expanded length, and measure the full request path against the threshold.
CR-04 — PARTIALLY FIXED

Evidence: the original bypasses are fixed and now raise an "unusual characters" signal:

zero-width space, soft hyphen, word joiner;
combining grapheme joiner, variation selectors, tag characters, Hangul filler;
lowercase Cyrillic а/о/е/с/р;
fullwidth letters, mathematical bold, stacked combining marks.

The user's original text is never altered; matching runs on a separate copy.

Still bypassed (score 0, verdict "unassessed", no unusual-characters signal):

uppercase Cyrillic Н, Т, М, В, К mixed into Latin words;
Greek ν, ι, κ;
U+2800 (blank Braille cell) inserted between letters.

Partial: Cyrillic к/һ cost the bank example some signals, but it still scored "very high". Leetspeak and English/Slovak text remain outside the rule set.

New false positive: any emoji with a variation selector or zero-width joiner (❤️, 👨‍👩‍👧) raises the unusual-characters signal.

Remaining concern:

Flag any token that mixes scripts.
Use the full Unicode confusables mapping.
Treat U+2800 and similar blank symbols as invisible.
Exempt emoji sequences from the signal.

The fallback is neutral, not reassuring (see CR-05), so this is now a detection-quality issue, not false reassurance.

CR-05 — FIXED

Evidence:

The low level is gone.
URL input, zero-signal results and scores under 30 all map to unassessed. The UI labels that "Bezpečnost nelze určit", shows "—" instead of a number, hides the scale, and uses Věrka "thinking" and Robo "default".
URL results say "Cíl odkazu nebyl navštíven ani ověřen".
Phishing-style URLs and IPv6 literals now return unassessed, and my original CR-05 assertion passes.
In the dormant AI path, the summary now comes from server templates, not the model.

Remaining concern: product-level only. Results that contain weak signals (score under 30) share the "unassessed" label with zero-signal results. That's not reassuring; the summary text still lists the signals.

CR-06 — FIXED (code level)

Evidence:

The cookie is __Host-guard_session, HttpOnly, SameSite=Strict, Path=/, Secure, with no Domain attribute.
An invalid shadow cookie plus a valid session gives 200.
Two distinct valid sessions give 403.
The old unprefixed name is no longer accepted.

Remaining concern:

A sibling subdomain can still "cookie-bomb" a victim: oversized cookies push the request headers past 8 KB and every request returns 431. Mitigate by not hosting untrusted content on any subdomain.
__Host- behaviour still needs confirming on the real HTTPS domain.
CR-07 — MITIGATED

Evidence:

The character images went from about 23 MB of PNG to about 2.3 MB of WebP; the largest is 702 KB.
URLs are content-hashed and served public, max-age=31536000, immutable with a SHA-256 ETag, and 304 responses work.
Each client gets 120 requests and 2 MiB per minute: one IP sending 60 requests got 16 × 200 and 44 × 429, about 2 MB.
Old PNG URLs redirect (301), and the PNGs are not shipped in the runtime image.

Remaining concern:

Query-string cache-busters return 200 (…webp?cb=123), so they bypass Cloudflare's default cache key.
Bandwidth still scales with the number of /64s: 50 /64s pulled 32 MB in seconds.
Fix: reject or ignore query strings on static assets (in the app or in a Cloudflare cache rule), and validate caching at the edge.
CR-08 — FIXED

Evidence:

The form now uses method="post" action="/api/analyze", and the textarea has no name, so a browser form submission carries no content.
The submit button is disabled in the HTML, and there's a <noscript> notice.
Real Chromium tests with JavaScript disabled, app.js blocked and character-assets.js blocked: in all three the private marker was never in the URL, the query string, history or the referrer, and never reached the server.
The candidate's own browser test passes.

Remaining concern: none for privacy. Without JavaScript the user lands on a raw JSON error page, which is a UX issue only.

CR-09 — PARTIALLY FIXED

What the candidate itself proves:

The ingress network is now internal: true, so the app has no default route out to the internet.
No host port is published.
Neither container mounts the Docker socket or any credentials.

What depends on infrastructure: Codex's own local Docker probe (network-probe.json, which I could not reproduce because this environment has no Docker daemon) shows the host gateway is still reachable from the internal network. Blocking the host, metadata services and the other bridges depends on the VPS firewall and Docker host, which are NOT TESTABLE YET.

Remaining concern: that must be proven on the staging VPS. The cloudflared connector keeps outbound egress by design.

CR-10 — FIXED (procedure level; not executed live)

Evidence:

deploy.sh and build-connector.sh always build from a git archive of the exact commit and capture the image ID with --iidfile.
verify_image requires an exact sha256: ID match.
Compose and the settings file pin image IDs, not mutable tags.
The running container must match the configured ID.
A release manifest records commit, tree, image ID and base images.
Rollback accepts only a verified image ID.
The mock-Docker tests pass.

Remaining concern:

These are not signatures or reproducible builds; the Docker administrator remains trusted.
Nothing has run against real Docker yet. It is a staging-gate item.
CR-11 — MITIGATED (future AI gate remains open)

Evidence:

With NODE_ENV=production, createRuntime() now runs the production guard too, so a direct node src/server.js start is also protected.
The guard rejects AI_MODE=ai, non-zero budgets, API keys and NODE_OPTIONS (verified).
The money cap reserves atomically before every attempt (unchanged, and still correct).
The public summary no longer comes from the model.
An AI_ENDPOINT override is accepted by the guard but has no effect in rules mode.

Remaining concern, which must stay an explicit AI release gate:

There is no persistent per-user or per-client AI budget. Combined with the CR-01 /56 residual, one actor can drain the daily cap.
Budget enforcement isn't distributed.
When the budget is exhausted the user gets no result at all (no rules fallback).
Prompt injection still needs a model-level evaluation.
Outside production (NODE_ENV unset), AI mode can be enabled, though without keys it stays unconfigured.
Adversarial testing

My original suite, unchanged: 16 of 16 assertions pass, both under --test-reporter=tap and under the candidate's strict runner (claude-review-check.js, which also fails on any not ok).

Invariants 1–7 (pass):
parser rejects ambiguous or malformed framing;
duplicate critical headers are rejected;
no request smuggling;
forged, expired or wrong-key session cookies are rejected;
Origin and Host variants are rejected;
malformed UTF-8 and deep JSON are rejected;
static routing stays inside the allowlist.
Findings 8–16 (all now pass): CR-01, CR-01b, CR-02, CR-03 (the original specific input), CR-04 (original variants), CR-05, CR-06, CR-07, CR-08.

Other test runs:

npm test (Node 24.21.0): 90 of 90 pass.
npm run check: pass.
Candidate's security-browser.js: pass.

Additional independent tests:

Test	Result
CR-01: one /64 vs victim	victim 200
CR-01: 65 /64s in one /56	victim 429
RR-01: 80 slow bodies from 40 /64s	/api/health, / and new sessions all 503; recovered after about 2.3 s
CR-03	25 Unicode-expansion and mixed-script inputs, 15–300 repetitions each; numbers in the CR-03 section
CR-04	31 evasion variants; results in the CR-04 section
CR-05	lookalike URLs, URL-only input, zero-signal and weak-signal texts
CR-06	cookie attributes, shadowing, two valid sessions, cookie bomb
CR-07	ETag/304, query cache-buster, per-IP and distributed bandwidth
CR-08	real Chromium with JS off, module blocked, forced requestSubmit
XSS sinks	no innerHTML, outerHTML, insertAdjacentHTML, document.write or eval in the frontend

New findings:

RR-01 (P2 / medium): distributed slow request bodies fill the global HTTP admission gate.

Reproduction: with the production configuration, 40 /64s × 2 slow-body POSTs each, each with a valid session, Origin and Content-Length 100 but only { sent. Health, the homepage and session issuance all return 503 until the 2 s body deadline releases.
Scale: sustaining it needs about 96 /64s, which fits inside a /56.
Impact: short, repeatable outages of the whole site, including the health check.
Fix:
Give body reads their own small global limit, separate from the 64 slots static files and health checks need.
Aggregate concurrency per /56 or /48.
Require a minimum body transfer rate.
Verify whether Cloudflare buffers request bodies before they reach the tunnel.

RR-02 (low): emoji trigger the "Neobvyklý zápis znaků" signal.

Reproduction: "Ahoj mami, zítra přijedu ❤️" and "Rodinka 👨‍👩‍👧 se těší" both get the signal.
Impact: a false-positive signal on ordinary messages.
Fix: exempt valid emoji sequences.

RR-03 (informational): Node's bundled zlib is inside CVE-2026-85091's affected range, and no scanner sees it.

Evidence: the official Node 24.21.0 source ships Chromium zlib 1.3.2 containing gz_vacate. The production node binary exports gzprintf, gzvprintf and gzwrite.
Reachability: none. Node core never calls the gz* file API, Node's JavaScript API doesn't expose it, and there are no native addons.
Fix: track Node security releases explicitly.
CVE / Trivy status
	Codex	My disposition
NOT AFFECTED	24	26
MITIGATED	8	8
OPEN	2	0

I accept Codex's more conservative MITIGATED for A03, which I had earlier marked NOT AFFECTED.

A28 (CVE-2026-102010, libstdc++6): NOT AFFECTED. Evidence collected in this review:

The production node binary (7fde7b8a…) is byte-identical to the official nodejs.org v24.21.0 linux-x64 build, verified against SHASUMS256.txt.
The matching official source tarball (a6f54def…) contains no ext/pb_ds or __gnu_pbds reference anywhere, V8 and all bundled dependencies included. The only erase_if uses are std::erase_if or V8's own helper.
The image's libstdc++.so.6.0.33 has zero PBDS symbols or strings, as expected for a header-only library.
Codex's objection that inlining leaves no symbols is answered: without the PBDS headers, the vulnerable template can't be instantiated at all.

A31 (CVE-2026-85091, zlib1g): NOT AFFECTED at runtime; Debian package provenance unverified.

Debian's libz.so.1.3.1 is never loaded. The only executable in the image is node, which doesn't link it, has no libz.so string, and loads no native addons.
Codex's own reasoning applies the same "not loaded, so not affected" test to libgomp1 (A26/A27) but leaves A31 OPEN. That is inconsistent.
To close the package question as well, the owner would need the Debian security tracker status or the Debian source patches for 1:1.3.dfsg+really1.3.1-1+b1. Those servers were unreachable here.
The genuinely in-range copy is Node's bundled zlib (RR-03), which is not reachable either.

Other disagreements: none. C01–C03 now rest on symbol evidence from the exact image binary (6fb37346…), consistent with my release-binary analysis. No ACCEPT dispositions were made.

GO FOR CONTROLLED STAGING

Before any production approval, verify on the real VPS, Cloudflare and staging environment:

Access: while the RR-01 and CR-01 /56 residuals remain, put staging behind an access gate such as Cloudflare Access or an IP allowlist.
Client identity: Cloudflare overwrites CF-Connecting-IP over HTTP/1.1, HTTP/2 and HTTP/3; Pseudo-IPv4 is off; no Workers or Transform Rules sit in the path; only the connector's exact IP is trusted.
Request bodies: whether Cloudflare buffers bodies (RR-01, CR-02); that duplicate headers and Host survive translation correctly; that the parser holds end-to-end.
Rate limiting: edge or application aggregation per /56 and /48 (CR-01, RR-01); real shared-IPv4 behaviour.
Network: the app container cannot reach the host gateway, metadata IPs, other bridges or the internet (CR-09). External IPv4 and IPv6 port scan shows nothing exposed.
Caching: static cache keys and caching, including query-string cache-busting (CR-07); no-store respected on HTML and API.
Cookies: __Host- cookie delivery on the real HTTPS domain; HSTS and redirects; no untrusted subdomains (CR-06 cookie-bomb residual).
CPU: full-path cost under cpus: 0.5 with the Unicode-expansion corpus (CR-03), plus single normalisation and a byte-cap-first fix before production.
Detection: the CR-04 bypasses (mixed-script, Greek, U+2800) and the RR-02 emoji false positive fixed and regression-tested.
Deployment: live image-ID deploy, rollback and restore drill (CR-10); token file permissions; connector lifecycle.
Logging and privacy: no message content in app, connector, Cloudflare or hosting logs (synthetic marker test); privacy page wording matches the deployment.
AI: stays disabled; the CR-11 future-AI gate stays open.
Final safety confirmation
No application code was modified.
My original adversarial tests were not modified or weakened; they were run unchanged.
No commit was created; nothing was pushed, merged or deployed.
No VPS, Cloudflare, DNS or other infrastructure changes were made.
No secrets were added.
External AI remains disabled.
Scratch exports, probe scripts and downloaded reference artifacts stayed outside the repository, under /tmp/claude-0/.

The Security Gate remains BLOCKED regardless of this staging recommendation. Production deployment is NOT authorised and requires a separate explicit human approval.
```

## Context and follow-up boundary — implementing author

Claude's independent dispositions are preserved as **26 NOT AFFECTED / 8 MITIGATED / 0 OPEN**, including **A28 NOT AFFECTED** and **A31 NOT AFFECTED at runtime; Debian package provenance unverified**. The earlier implementing-author proposal remains recorded unchanged in [VULNERABILITY_REMEDIATION_1.md](VULNERABILITY_REMEDIATION_1.md): **24 NOT AFFECTED / 8 MITIGATED / 2 OPEN**. Recording the independent assessment is not a vendor patch, disappearance of a Trivy finding, owner risk acceptance, or permission to overwrite the earlier evidence. RR-03 is a separate informational assessment of Node's bundled zlib, outside the scanner's Debian-package inventory. Its no-reachability conclusion is scoped to this runtime and must be revisited if Node, native addons, uploads, fetching or the runtime surface change.

CR-01, CR-03, CR-04, CR-07 and RR-01 remain production concerns; RR-02 requires a detection regression fix before production. CR-09 needs host-network evidence; CR-10 needs live operational evidence. CR-11's future-AI release gate remains **OPEN / unresolved**, while AI activation remains **closed / disabled**. Passing the unchanged original assertions does not close the new broader CR-03, CR-04 or distributed availability cases. Historical CPU failures and the independent measurements above are not superseded by earlier successful runs.

[STAGING_SECURITY_PLAN.md](STAGING_SECURITY_PLAN.md) translates the supplied requirements into proposed checks. It is not part of Claude's verbatim response, not independent test evidence, and not authorisation to execute those checks. No plan item has been executed by this documentation task. Future implementation fixes require their own reviewed candidate and regression evidence; infrastructure work requires separate explicit approval. **Production and the Security Gate remain BLOCKED.**
