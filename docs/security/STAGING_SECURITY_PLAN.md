# Security Gate 1 — controlled staging execution plan

**Plan only. All checks are NOT RUN. No staging or production deployment is authorised by this document. Production remains BLOCKED.**

The source requirements are the complete [Claude independent re-review](CLAUDE_INDEPENDENT_REREVIEW.md). This execution plan is prepared by the implementing author; it is not an independent review or a claim that the remaining findings have been fixed.

## Immutable scope and execution contract

| Scope | Required value / boundary |
| --- | --- |
| Application candidate | `87b96cded187b9a200b5aa27a0b10d97fafe0e40` |
| Candidate tree | `939b12e40d5400329c57dd80904a00585fb38e3f` |
| Candidate parent | `fde14ba57d62ba9e6aab0181170386a1d38da7a1` |
| Documentation branch | `security/gate-1-staging-prep`, based on the candidate above |
| Current production guard | `NODE_ENV=production`, `AI_MODE=rules`, zero AI limits/budgets, no provider keys |
| Required origin in this candidate | `https://verimtomu.fyi` |
| Application listener | Container port `3000`; **no published host port** |
| Edge | Cloudflare HTTPS → outbound cloudflared tunnel → private ingress network → app |
| Host exposure | No public application, Docker API or debugging port; no VPS 80/443 required by the outbound-tunnel architecture |
| Proposed execution host | Dedicated, isolated staging host; actual addresses and ownership must be supplied and verified, never guessed |

The current [production guard](../../src/production-config.js) pins the origin to `https://verimtomu.fyi`; it does not support changing this production-mode candidate to a staging subdomain. The [deployment helpers](../../deploy/scripts/common.sh) fix the Compose project name to `verimtomu`. A different deployment directory alone does not isolate another project. Before activation, confirm this hostname and project can be used as protected staging without displacing an existing service. If not, STOP and request a separately approved design; do not weaken the guard, change the helpers, route public traffic, or replace an unrelated deployment.

Future execution requires separate explicit authorisation for the named staging host, hostname, edge/access configuration, test clients and drills. Read-only configuration audits do not authorise changes. No code remediation, DNS mutation, zone-wide rule change, shared-host firewall mutation, daemon restart, or destructive recovery action follows automatically from a failed test. Restrict all content to synthetic fixtures and named test accounts. Never send private content to staging while these gates are unresolved.

Use the phase order below. IDs T01–T24 map to the owner's requested checks; T25 tracks Claude's additional RR-03 requirement. Each checkbox represents evidence completion, not permission to run. Record **PASS / FAIL / NOT RUN** explicitly; missing evidence is NOT RUN, never PASS. Unless explicitly scoped to the future AI release, a FAIL or NOT RUN prevents production sign-off under this proposed plan; it does not rescind the reviewer's separate recommendation for controlled staging.

Before tests, approve a bounded run sheet: target addresses, source-owned IPv4/IPv6 ranges, fixture hashes, protocols, duration, connections, requests/bytes and recovery deadline. Use configured rate/concurrency limits from the exact candidate, not an assumed sliding-window interpretation. Never tune thresholds after observing failures. Stop traffic on unexpected cross-service effects, loss of investigator access, image/configuration drift, or inability to restore the baseline. Health probing and load generators must run outside the application image; never mount a Docker socket or testing credentials into it.

Evidence bundles stay outside the Git repository and contain UTC timestamps, test ID, commit/tree/image IDs, redacted configuration snapshots, fixture ID/hash/length, measurement method, per-run results, recovery observations and disposition. Exclude bodies, cookies, token values, Authorization headers, private keys and raw browser HAR/session captures. Record secret **names/presence/permissions**, never their values. A redacted summary may later be proposed for Git through a separate approval.

## PRE-DEPLOYMENT

- [ ] **P00 — Scope, baseline and explicit execution approval**
  - **Objective:** Establish an isolated, authorised test scope and preserve the reviewed candidate before any staging activation.
  - **Evidence:** Owner's later approval; host/hostname/project ownership inventory; immutable commit/tree/parent verification; approved run sheet and independent victim clients; baseline health and isolation inventory; log-sink/retention inventory; approved recovery path and image/config backup. Obtain the reviewer's probe scripts/corpus and full source/binary hashes if available; distinguish supplied results from newly reproduced results. Check existing untrusted sibling subdomains and shared Cloudflare settings without changing them.
  - **PASS:** Scope is owned and isolated, access protection can precede activation, health/recovery controls exist, secrets are separated, and no unrelated hostname/project/infrastructure will be replaced.
  - **FAIL:** Missing approval, origin/project collision, undefined test scope, unavailable log evidence or no safe recovery path.
  - **Blocks production:** Yes. Also blocks starting the live tests.
  - **Unrelated-infrastructure safety:** Read-only inventory is safe within owned scope. Provisioning/configuration is deferred until explicitly authorised; no guessed addresses or broad scans.

- [ ] **T01 — Staging access restriction**
  - **Objective:** Keep CR-01/RR-01 residual availability risks behind Cloudflare Access or a narrowly scoped IP allowlist before the app becomes reachable.
  - **Evidence:** Redacted policy export for the exact hostname and all paths; tunnel ingress/catch-all review; authenticated and unauthenticated probes from IPv4 and IPv6, including `/`, `/api/health`, `/api/session`, `/api/analyze`, assets and alternate origin routes. Record the denial location, not an access token. Approved load sources must remain gated.
  - **PASS:** Only named testers reach the application; unauthorised clients are denied at the edge; no alternate hostname, host port or direct origin bypass. Protection remains active through all drills.
  - **FAIL:** A public/bypass route, path exception, unprotected first activation or a test requiring access protection to be broadly disabled.
  - **Blocks production:** Yes, until staging evidence is collected safely; later public access needs separate release approval.
  - **Unrelated-infrastructure safety:** Policy must target only this hostname. Do not alter zone-wide access, other applications or unrelated users.

- [ ] **T18 — Immutable image-ID deployment binding**
  - **Objective:** Bind a later staging deployment to the reviewed Git objects and exact runtime images; verify CR-10 with real Docker.
  - **Evidence:** Approved candidate archive hashes; build `--iidfile`; full inspected image IDs and VCS revision label; release manifest with commit/tree/base-image IDs; redacted Compose/settings; running container `.Image`; runtime file/`src/analysis.js` hashes and character allowlist; connector image identity. Record Docker context/version and trusted administrator boundary. Inspect UID, read-only root, dropped capabilities, no-new-privileges, `cpus: 0.5`, memory/PID bounds, empty PortBindings and app mounts. Check tunnel-token owner/mode and connector-only read-only mount without recording the token; app must have no credentials or socket.
  - **PASS:** Deployment built from the exact candidate archive, full image IDs match manifest/settings/live containers, runtime hashes match the archive, hardening matches [compose.yaml](../../deploy/compose.yaml), and connector secrets are isolated. No mutable tag is used as identity evidence.
  - **FAIL:** Old audit image reused as a commit-labelled release, wrong VCS/tree/hash, image-ID mismatch, published app port, privileged/host-network runtime, socket or credential mount in the app, or unverified connector image/token permissions.
  - **Blocks production:** Yes. Also blocks exposing the staging route to testers.
  - **Unrelated-infrastructure safety:** Build/activation later target only an empty dedicated staging project. Never run helper scripts against an existing unrelated `verimtomu` project or restart the Docker daemon. Image IDs do not establish reproducible builds or signatures.

- [ ] **T23 — External AI remains disabled**
  - **Objective:** Prove rules-only operation before activation and after every deployment/drill.
  - **Evidence:** Redacted effective settings: `NODE_ENV=production`, `AI_MODE=rules`, `GUARD_COOKIE_SECURE=true`, `GUARD_CLIENT_IP_MODE=cloudflare`, exact trusted connector IP/origin; `AI_DAILY_REQUEST_LIMIT=0`, `AI_DAILY_BUDGET_MICRO_USD=0`, `AI_TOTAL_BUDGET_MICRO_USD=0`, `AI_CRITIC_ENABLED=false`, `AI_MAX_RETRIES=0`, `AI_ALLOW_LOCAL=false`. Record absence of provider-key variables and `NODE_OPTIONS`. In a disposable network-disabled container of the pinned image, verify normal startup and rejection of synthetic `AI_MODE=ai`/non-zero budget settings through both supported startup paths. Use no real keys. Record rules-only result metadata and absence of provider outbound attempts during fixtures.
  - **PASS:** Guard is active, prohibited configurations reject before serving, no provider key is present, all analysis stays rules-only and no provider call occurs. An inert `AI_ENDPOINT` override is not treated as proof of AI activation or permission to call it.
  - **FAIL:** Guard bypass, production mode missing, non-zero limits, accepted AI startup, provider-key presence, provider traffic, or enablement in a rollback/restore configuration.
  - **Blocks production:** Yes, and blocks staging activation in this scope.
  - **Unrelated-infrastructure safety:** Negative startup probes are local, disposable, network-disabled and use synthetic values only; never contact a real LLM provider or modify shared secrets.

## LIVE STAGING

Keep the access restriction active. Before attack-like traffic, run T09 and T10, then T02–T05 and benign baselines. Run load tests sequentially, with recovery confirmed between them. Run T19/T20 only after collecting the normal-run evidence and preserving backups. After each drill repeat T01, T18 and T23 identity/access checks.

- [ ] **T09 — Host gateway, metadata, other bridges and internet egress**
  - **Objective:** Prove CR-09 containment on the actual host; `internal: true` alone is insufficient.
  - **Evidence:** Redacted IPv4/IPv6 routes, bridge topology and scoped INPUT/FORWARD/bridge firewall rules/counters; bounded TCP connection outcomes originating in the app's network namespace to its actual host gateway, provider-documented metadata addresses, owned fixtures on another bridge and an owned internet endpoint. Record no default route and denial of NEW traffic while legitimate connector→app traffic/established replies work. Separately document connector egress and its intentionally different trust boundary.
  - **PASS:** App-originated NEW connections to all four target classes fail in both applicable address families; connector health and established replies work; no socket/secrets are exposed. The connector's required outbound tunnel traffic is not mistaken for app egress.
  - **FAIL:** Any reachable host/metadata/other-bridge/internet target from the app, untested applicable IPv6 path, or only Compose flags used as proof. A fixture alone does not establish denial of the real metadata route.
  - **Blocks production:** Yes.
  - **Unrelated-infrastructure safety:** Low-volume transport probes to explicitly owned/documented destinations only. Never request metadata credential endpoints or probe unrelated containers. Observation tools run outside the app; no broad firewall edits or socket mounts.

- [ ] **T10 — External IPv4 and IPv6 port scan**
  - **Objective:** Verify there is no public origin/application/admin bypass on the actual staging host.
  - **Evidence:** Approved host IP inventory and externally collected bounded TCP scan output for both families; host listener/PortBindings inventory. Confirm `3000`, `9229`, `2375` and other unexpected listeners are closed/filtered. If SSH is retained, document its restriction to the explicit management CIDR and denial from the untrusted scanner. Include 80/443 in the origin scan: this tunnel architecture requires neither on the VPS.
  - **PASS:** No ports exposed to general internet clients on either family; any approved administrative listener is reachable only from its management scope. Cloudflare's edge serves HTTPS without publishing the backend.
  - **FAIL:** Any public app/Docker/debug/admin listener, IPv6 bypass, unexamined assigned address or undocumented origin HTTP listener.
  - **Blocks production:** Yes.
  - **Unrelated-infrastructure safety:** Scan only explicitly authorised server IPs at agreed low rates. Never scan Cloudflare anycast/shared addresses, provider networks or unrelated hosts. If IPv6 is unavailable, document host/provider controls proving that fact instead of declaring an IPv6 scan PASS.

- [ ] **T02 — Cloudflare client-IP trust**
  - **Objective:** Validate end-to-end attribution and rejection of visitor-controlled identity headers.
  - **Evidence:** Known source IPs for owned IPv4/IPv6 clients; edge request IDs; redacted effective `GUARD_TRUSTED_PROXY_IP`; connector network identity; limiter outcomes for independent and shared sources. Send synthetic spoofed `CF-Connecting-IP`, X-Forwarded-For and forwarding headers and observe actual attribution through each negotiated protocol. In an isolated origin probe, verify a non-trusted peer cannot supply authoritative headers; record peer IP only in restricted operational evidence.
  - **PASS:** Edge overwrites visitor identity, app trusts only the connector's exact configured peer, forwarded alternatives cannot select another bucket, and missing/duplicate/malformed trusted-client headers fail closed.
  - **FAIL:** Spoofed attribution, trusted entire subnet, direct-origin bypass, silent XFF fallback, identity lost across protocols or a changed connector IP without matching validated configuration.
  - **Blocks production:** Yes.
  - **Unrelated-infrastructure safety:** Low-volume probes against this app only. Do not alter global header rules or infer real edge behaviour from internally spoofed IP fixtures alone.

- [ ] **T03 — HTTP/1.1, HTTP/2 and HTTP/3 behaviour**
  - **Objective:** Verify parser/security invariants through Cloudflare's protocol translation.
  - **Evidence:** Actual client-edge ALPN/protocol for each case; connector-app protocol; sanitised raw request construction and statuses for duplicate critical headers, ambiguous Content-Length/Transfer-Encoding, conflicting Host/authority/Origin, malformed framing and a healthy follow-up request. Record edge versus origin rejection and ensure no second unintended request is processed.
  - **PASS:** Benign requests work through all three protocols; ambiguous/malformed requests reject safely, origin/session checks hold, no request smuggling and no cross-request contamination. Distinguish client-edge HTTP/2/3 from origin HTTP/1.1.
  - **FAIL:** A framing/identity bypass, unverified negotiated protocol, state contamination or unsupported protocol left untested without a reviewed restriction.
  - **Blocks production:** Yes.
  - **Unrelated-infrastructure safety:** Dedicated connections, low-volume requests and this hostname only; no pipelined probes on shared upstreams or zone-wide HTTP/3 changes.

- [ ] **T04 — Pseudo-IPv4, Workers and Transform Rules**
  - **Objective:** Exclude edge features that rewrite identity or invalidate the trust assumptions.
  - **Evidence:** Redacted read-only configuration inventory: Pseudo-IPv4 **off**, matching Workers routes, request/response transforms, origin rules and tunnel ingress; compare known IPv6 source identity through all protocols. Include any rules inherited at zone/account scope and their effect on this hostname.
  - **PASS:** Pseudo-IPv4 is off; no Workers or Transform Rules sit in this request path; trusted IP/header/origin semantics match T02/T03.
  - **FAIL:** Overwritten client IPv6, a matching Worker/Transform rule, hidden inherited changes or inability to audit the path.
  - **Blocks production:** Yes.
  - **Unrelated-infrastructure safety:** Read-only audit. A conflicting shared feature is a finding requiring a separately approved scoped solution, not permission to disable it for unrelated applications.

- [ ] **T05 — Request-body buffering, slow bodies and parser translation**
  - **Objective:** Determine whether edge buffering protects the origin and verify CR-02 across the real tunnel.
  - **Evidence:** For each protocol, timestamp first client byte, completion, origin admission/body-read timing and result; use valid synthetic sessions/Origin, known Content-Length, partial and trickled bodies, then malformed UTF-8/deep JSON/oversize bodies. Record observed 2-second origin body deadline, 2/client and 1/session body-read bounds, duplicate-header/Host handling and a concurrent independent victim probe. Compare direct isolated-origin controls with edge results; do not assume Cloudflare buffers.
  - **PASS:** Original single-client starvation is prevented; framing/byte limits hold; incomplete bodies time out without analysing; buffering behaviour and any edge timeout are measured. A buffering observation alone does not close distributed RR-01.
  - **FAIL:** Victim starvation by the original case, body/UTF-8 limit bypass, analysis admitted before validation, uncontrolled partial bodies or unmeasured translation/buffering.
  - **Blocks production:** Yes.
  - **Unrelated-infrastructure safety:** Bounded partial-body connections on dedicated staging; controlled sources only. Stop on unrelated health effects; do not modify shared proxy buffering/timeouts during testing.

- [ ] **T06 — CR-01 IPv6 /56 and /48 exhaustion**
  - **Objective:** Reproduce residual broad-prefix exhaustion and evaluate any separately approved aggregation control before production.
  - **Evidence:** Owned/routed /56 and /48 test ranges and actual edge-reported IPs; original 300-address/single-/64 control; 65-/64-in-/56 analysis reproduction; independent victim outside the attacking prefix; prefix-specific requests/admissions/429 counts and global bucket/recovery timings. Test a /48 using separately bounded distinct /64 sources. Account for token-bucket refill: Claude's 616 admitted requests are evidence, not a new strict 600-per-sliding-minute assumption.
  - **PASS:** Single-/64 control is contained and the /56-/48 actor cannot consume the unrelated victim's capacity; approved edge/app aggregation is demonstrated with normal-user traffic preserved.
  - **FAIL:** Victim 429/global exhaustion, source IPs not actually routed/validated, or claimed prefix aggregation supported only by per-/64 tests. Baseline failure is expected from the reviewed residual; preserve it rather than changing code here.
  - **Blocks production:** Yes until a later approved control and retest close CR-01. Does not prohibit restricted baseline staging.
  - **Unrelated-infrastructure safety:** Load requires dedicated capacity and owned ranges, bounded requests and recovery pauses. Do not spoof Cloudflare headers as a substitute for real end-to-end clients or use others' IPv6 space.

- [ ] **T07 — Shared-IPv4 behaviour**
  - **Objective:** Quantify legitimate users sharing NAT/carrier IPv4 and the impact of one abusive client.
  - **Evidence:** Multiple isolated browsers/sessions behind one owned NAT source, an external independent victim, 10-session/minute issuance boundary and 2-concurrent-analysis boundary; legitimate versus abusive outcomes, waiting/retry UX and recovery. Record session-level versus IP-level refusals without storing cookies. Use controlled NAT to model the issue rather than probing real unrelated subscribers.
  - **PASS:** Observed limits are understood, legitimate-user availability has an explicitly approved policy/control and abuser tests satisfy it without bypassing the session/IP safety gates.
  - **FAIL:** One NAT user can deny others contrary to that policy, misleading capacity UX, unbounded abuse or no agreed policy/measurement. Do not silently remove IP limits to make this pass.
  - **Blocks production:** Yes until the shared-IP availability policy and evidence are reviewed.
  - **Unrelated-infrastructure safety:** Owned NAT/test accounts only; no carrier-wide traffic, unrelated subscriber testing or real customer content.

- [ ] **T08 — RR-01 distributed slow-body admission exhaustion**
  - **Objective:** Reproduce the newly identified global HTTP admission denial and test edge/body controls independently of CR-02.
  - **Evidence:** Baseline health/home/session success; 40 owned /64s × 2 simultaneous valid-session POSTs, `Content-Length: 100`, only `{` sent; per-protocol edge versus origin admitted connections, statuses for `/api/health`, `/` and session issuance, 64-slot admission effects and recovery after the 2-second body deadline. Preserve Claude's all-503/~2.3-second recovery comparison. Any sustained ~96-/64 experiment needs its own bounded run-sheet approval; single bursts alone do not prove sustained resilience.
  - **PASS:** Distributed bodies cannot starve health/static/session admission; minimum transfer-rate, separate body-admission budget and/or effective edge containment are evidenced with normal traffic healthy.
  - **FAIL:** Whole-site 503 bursts, refill/repeated starvation, recovery outside the pre-agreed deadline or only same-/64 testing. Baseline reproduction remains an unresolved finding, not an automatic remediation trigger.
  - **Blocks production:** Yes, as required by the independent availability assessment.
  - **Unrelated-infrastructure safety:** Only dedicated protected staging; abort at the agreed connection/time cap. Do not affect a shared host/edge resource or change global admission/proxy settings during the experiment.

- [ ] **T11 — Static edge caching and query-string cache-busters**
  - **Objective:** Verify CR-07 bandwidth mitigation at the actual edge and demonstrate safe static cache-key behaviour.
  - **Evidence:** Every approved hashed WebP route from [character-assets.js](../../public/character-assets.js), ETag/304 and immutable headers, legacy PNG redirect, rejected unknown paths; cold/warm `CF-Cache-Status`/Age and origin request/byte counters; bounded unique `?cb=` variants, per-IP and distributed-owned-/64 tests. Compare an authorised constant asset request to query-buster requests; record actual origin bytes rather than headers alone.
  - **PASS:** Warm assets cache, unknown assets remain denied, query strings are rejected or safely excluded from the approved static cache key, and unique query values cannot create unbounded origin misses. Any later edge rule is restricted to the explicit approved asset routes; no generic `/assets/**` allowlist or Cache Everything.
  - **FAIL:** Cache-busters repeatedly reach origin, distributed bandwidth remains uncontrolled, user-dependent content is cached, or only browser caching is proven. Preserve the candidate's residual until a separately approved fix/control and retest.
  - **Blocks production:** Yes.
  - **Unrelated-infrastructure safety:** Bounded asset-byte budget and this hostname only. No global purge, cache-rule change or distributed load against unrelated Cloudflare customers.

- [ ] **T12 — HTML/API no-store**
  - **Objective:** Prevent caching of sessions, user results and other dynamic content.
  - **Evidence:** Redacted response/cache headers for HTML, `/api/session`, `/api/analyze`, health, errors and the candidate's dynamic JS/CSS policy; cold/repeated requests from two isolated users, edge cache rules and cache statuses. Store only synthetic response hashes and fixture IDs; do not retain session cookies or analysed bodies.
  - **PASS:** HTML/API carry and retain `Cache-Control: no-store` through the edge; no dynamic cache HIT or cross-user response reuse; static immutable rules do not spill into dynamic routes.
  - **FAIL:** Missing/overridden no-store, shared dynamic response, cached error/session/result or undisclosed edge override.
  - **Blocks production:** Yes.
  - **Unrelated-infrastructure safety:** Low-volume synthetic requests and read-only rule inspection; no shared cache purge or rules affecting other hostnames.

- [ ] **T13 — __Host- cookie behaviour on real HTTPS**
  - **Objective:** Validate CR-06 in real browsers, not only local response-header assertions.
  - **Evidence:** Sanitised attribute/acceptance checks for `__Host-guard_session`: Secure, HttpOnly, SameSite=Strict, Path=/, no Domain; browser rejection of nonconforming __Host cookies; invalid shadow plus valid session, two distinct valid sessions, forged/expired cookies and rejected old unprefixed name. Record status/attribute names only. Inventory all sibling-subdomain trust; reproduce oversized-cookie 431 only in the investigator's own isolated browser/profile.
  - **PASS:** Cookie scoping/delivery and session rejection match the independent evidence on HTTPS; no untrusted content is hosted on sibling subdomains, or an independently reviewed alternative closes the residual cookie-bomb risk.
  - **FAIL:** Accepted nonconforming cookie, readable HttpOnly state, wrong Domain/Path, session shadow bypass, untrusted sibling content without control or no real-browser evidence.
  - **Blocks production:** Yes.
  - **Unrelated-infrastructure safety:** Test profiles/accounts only, no production sessions or sibling-domain content changes. Cookie-bomb fixture cannot target another user or shared browser.

- [ ] **T14 — HSTS and redirect behaviour**
  - **Objective:** Ensure HTTPS enforcement without redirect, host-trust or domain-scope regressions.
  - **Evidence:** HTTP→HTTPS chain for the exact hostname, final origin, no sensitive query propagation, HSTS value on real edge HTTPS, invalid Host/authority rejection and absence of redirect loops. Compare edge versus app policy and subdomain inventory. Audit zone settings read-only; record explicit approval for any intended HSTS duration/scope.
  - **PASS:** Requests reach the canonical HTTPS origin, valid security headers survive translation and access restriction, no loop/open redirect, no premature `includeSubDomains`/preload impacting unverified siblings.
  - **FAIL:** Plaintext application exposure, missing/conflicting HSTS, redirect bypass/loop, forwarded-host poisoning or unapproved domain-wide policy.
  - **Blocks production:** Yes.
  - **Unrelated-infrastructure safety:** Low-volume requests only. Do not activate zone-wide redirects, long-lived HSTS, includeSubDomains or preload as part of this test.

- [ ] **T15 — CR-03 full request-path CPU under `cpus: 0.5`**
  - **Objective:** Measure the whole request cost and preserve the independent partial-fix conclusion; do not use analyze-only evidence as closure.
  - **Evidence:** Pinned image/runtime/Node/CPU/cgroup quota; isolated sequential runs without builds/audits; request-process CPU deltas with idle/health baseline and measurement uncertainty, plus separate end-to-end wall times and CFS throttling. Include JSON/parser/session/validation/pipeline/analyze/response work, accepted and rejected byte-limit inputs, `ztrati` + `l`×9994, U+FDFA with é/a/á at the accepted 16,000-byte boundary and expansion/mixed-script controls. Record each sample, counts, min/median/p95/p99/max and >20-ms counts; test a separately bounded concurrent phase after controlled runs. Preserve original 92.124-ms, controlled 46.843-ms and Claude's additional analyze/full-path measurements. Measure real HTTP request processing, not only the rule function.
  - **PASS:** The unchanged 20-ms security CPU bound is satisfied by controlled analysis tests and the measured full request path, byte-limit rejection is bounded before costly work, expansion is capped and a later approved single-normalisation fix is evidenced and regression-tested. Report throttled wall time separately; do not double CPU measurements to infer quota impact. Uncertainty that prevents assessing the bound is NOT RUN.
  - **FAIL:** Any controlled CPU sample >20 ms, repeated normalisation/byte-cap-after-normalisation remains unresolved, unsafe expansion, inaccurate attribution or analyze-only numbers presented as full-path PASS. Existing candidate can be benchmarked, but Claude's required code fix cannot be certified without a new reviewed candidate.
  - **Blocks production:** Yes. No threshold increase, test removal or silent environmental explanation is permitted.
  - **Unrelated-infrastructure safety:** Controlled performance work requires dedicated quiet staging resources and external read-only measurement tools. Never alter host-wide quotas or run concurrent build/audit load that affects other services.

- [ ] **T16 — CR-04 Unicode, mixed-script and U+2800**
  - **Objective:** Demonstrate the remaining detection gaps and preserve the original input independently of matching normalisation.
  - **Evidence:** Original unchanged adversarial fixtures plus hashes/results for uppercase Cyrillic Н/Т/М/В/К in Latin tokens, Greek ν/ι/κ, U+2800 between letters, Cyrillic к/һ, original invisibles/fullwidth/combining variants and legitimate non-Latin/Braille controls. Compare score, signals, neutral verdict, original-input hash/length and browser rendering. Use reviewer scripts if obtained; do not claim to reproduce all 31 variants from the prose alone. Include no-JS/module-blocked marker tests and desktop/390-/320-px result rendering as low-volume UI regressions.
  - **PASS:** Original bypass fixes hold, new mixed-script/blank-symbol cases are detected under the later approved policy without changing the user's source or falsely labelling ordinary non-Latin/Braille text; unsupported/zero-signal content stays unassessed, never reassuring. Newly required changes have reviewed regression evidence.
  - **FAIL:** New bypasses remain, original text changes, genuine language/Braille is indiscriminately removed, neutral fallback is replaced with false safety or UI/no-JS privacy regresses.
  - **Blocks production:** Yes; keep the independent classification as a detection-quality concern, not a proven code-execution exploit.
  - **Unrelated-infrastructure safety:** Synthetic fixture requests/browser sessions only. No real user messages, screenshot/PDF uploads or URL fetching; no code changes during this plan's execution without separate approval.

- [ ] **T17 — RR-02 emoji false-positive regression**
  - **Objective:** Confirm ordinary emoji do not create a suspicious-character signal after a separately approved fix.
  - **Evidence:** Exact reviewer examples `Ahoj mami, zítra přijedu ❤️` and `Rodinka 👨‍👩‍👧 se těší`; variation-selector, ZWJ, skin-tone and plain-text controls; score/signal/verdict metadata and original-input hashes. Pair with malicious invisible/mixed-script cases from T16 to ensure emoji exemption cannot mask attacks.
  - **PASS:** Valid emoji sequences alone do not raise `Neobvyklý zápis znaků`; malicious invisible/confusable cases remain detected and source preservation holds.
  - **FAIL:** Benign examples still raise the signal, malicious symbols become exempt or original text is altered. Record RR-02 as **low**, without inventing a higher independent severity.
  - **Blocks production:** Yes under Claude's explicit pre-production detection-fix requirement; not a blocker to protected baseline staging.
  - **Unrelated-infrastructure safety:** Low-volume synthetic analysis only, no edge or other-service changes.

- [ ] **T19 — Rollback drill**
  - **Objective:** Demonstrate CR-10 image-ID rollback on live isolated staging without weakening the production guard.
  - **Evidence:** Approved compatible previous immutable image and its revision/tree/manifest, pre-drill settings/health/access snapshot; scoped [rollback.sh](../../deploy/scripts/rollback.sh) outcome; running image ID, runtime/config hashes, health and rules-only analysis after rollback. Record pointer updates and restoration to the approved candidate; repeat T01/T18/T23. A first deployment with no previous approved image cannot claim this drill passed.
  - **PASS:** Verified prior image activates, metadata/settings/live image agree, health and access protection recover, AI stays disabled and restoration to the reviewed candidate succeeds within the pre-agreed deadline. Document that image rollback does not roll back firewall, Cloudflare, secrets or mutable state.
  - **FAIL:** Mutable/unverified prior image, config/image drift, lost access/health, AI guard regression, unrelated project changes or only an app-stop test offered as rollback proof.
  - **Blocks production:** Yes.
  - **Unrelated-infrastructure safety:** Mutates only the dedicated staging app. Requires separate drill approval; no merge/rebase/Git rollback, daemon restart, connector/DNS changes or rollback of other services.

- [ ] **T20 — Restore/recovery drill and connector lifecycle**
  - **Objective:** Verify recovery of the staging service beyond swapping an application image.
  - **Evidence:** Protected backup inventory/checksums and access permissions for images, release manifests, settings and connector configuration/token; recover into the authorised isolated target or approved restore area; confirm exact image IDs, settings, private network/connector IP, token permissions, health/access/rules-only state. Record connector restart/reconnection and app health failure recovery without mounting a Docker socket. Distinguish `restart: unless-stopped` process recovery from unhealthy-container handling; Docker does not restart solely on healthcheck failure. Record any required manual/supervised action and recovery time.
  - **PASS:** Approved recovery procedure restores correct isolated runtime, secret separation, tunnel connectivity, health/access and zero AI settings within the agreed deadline. Current rules-only absence of uploads/user database is explicit; do not claim future storage/AI-ledger recovery was tested.
  - **FAIL:** Missing/unreadable backup, exposed token, stale identity/config, unrelated-resource overwrite, no health recovery or untested required manual action.
  - **Blocks production:** Yes.
  - **Unrelated-infrastructure safety:** Dedicated restore scope only; encrypted/protected secrets never enter Git/logs. No shared-host reboot, global Docker prune, host firewall reset or token rotation affecting another tunnel. Destructive drills need additional explicit authorisation.

- [ ] **T21 — Synthetic-marker privacy across all logging layers**
  - **Objective:** Prove message content does not enter application, cloudflared, Cloudflare or hosting logs; validate CR-08 through the deployed path.
  - **Evidence:** Before requests, inventory actual sinks, retention, request/body capture, WAF/Access/analytics/Logpush/hosting console and access permissions. Submit a unique non-sensitive marker in synthetic message bodies through normal, rejected, timeout and no-JS/module-blocked cases. After requests/drills inspect the relevant time window of every sink; record marker present/absent, sink/field and redacted reason only. Verify URL/query/history/referrer, browser storage and form submission never contain the marker. Ensure investigator-generated test files are distinguished from operational logs.
  - **PASS:** No marker/content in any operational sink, URL/history/referrer or unintended persistent storage; cookies/tokens/credentials are also excluded. Necessary bounded operational metadata only; actual retention/third-party processing is documented.
  - **FAIL:** Marker/content or credentials in a log, sensitive HAR capture, uninspectable required sink, unknown retention/capture or blanket "no logs" claim unsupported by edge/hosting evidence.
  - **Blocks production:** Yes.
  - **Unrelated-infrastructure safety:** Synthetic data only; inspect only scoped records with authorised read access, never harvest unrelated customer logs. No account-wide logging disablement, deletion or retention mutation to conceal a failure.

## POST-TEST / RELEASE-GATE

- [ ] **T22 — Privacy-page wording verification**
  - **Objective:** Align [privacy.html](../../public/privacy.html) and the browser privacy flow with proven deployment behaviour and the responsible operator.
  - **Evidence:** Deployed page hash/text snapshot, identified operator/contact, actual hosting/Cloudflare processors/regions/retention, comparison to T12/T21 and storage/network observations. Verify rules-only mode, unavailable uploads/PDF and URL-not-fetched wording, consent/user controls and neutral result language. Record differences as findings; do not edit the page in this documentation task.
  - **PASS:** User-facing wording is accurate, operator/contact and third-party processing/retention information are complete, and no unsupported privacy/security/AI claims remain. A later content change must be separately approved and validated against its new artifact.
  - **FAIL:** Placeholder operator/contact, inaccurate retention/data flow, "never logged" without all-layer evidence, implied external AI or URL/image/PDF processing, or missing meaningful privacy information.
  - **Blocks production:** Yes. Synthetic-only restricted staging may collect evidence before wording is final; real users/content must not be invited meanwhile.
  - **Unrelated-infrastructure safety:** Read-only page/evidence comparison; no real personal data or other-site privacy policy changes.

- [ ] **T24 — CR-11 future-AI gate remains OPEN**
  - **Objective:** Prevent the rules-only staging recommendation from authorising external AI or closing unresolved AI safety work.
  - **Evidence:** Release checklist explicitly retains CR-11: persistent per-user/client budgets absent, distributed enforcement absent, exhausted-budget rules fallback absent and model-level prompt-injection evaluation outstanding. Attach T23 results; record separate requirements for future keys/provider calls, queue/workers, uploads/PDF/fetch changes and revised threat model. Record no owner risk acceptance.
  - **PASS:** CR-11 is clearly **OPEN/unresolved for future AI release**, AI activation is **closed/disabled**, and rules-only release consideration cannot automatically permit AI. This is a boundary check, not a claim the AI deficiencies are fixed.
  - **FAIL:** CR-11 marked closed because rules mode passed, budgets/provider enabled, future features declared reviewed without tests or staging permission treated as AI permission.
  - **Blocks production:** Yes if the boundary is violated. A retained OPEN future-AI gate alone does not prohibit a separately approved rules-only release after all its own blockers close.
  - **Unrelated-infrastructure safety:** Documentation/configuration review only; no provider credentials, API calls, new worker/queue service or feature activation.

- [ ] **T25 — RR-03 and independent CVE assessment follow-up**
  - **Objective:** Retain the scanner blind spot and independently scoped dispositions without owner risk acceptance or misleading "patched" claims.
  - **Evidence:** Original 34-row Trivy inventory and fresh later staging image scan/database timestamp; compare added/removed/version-changed rows without suppression. Preserve both earlier author **24/8/2** and Claude **26/8/0** assessments. Obtain full official Node binary/source hashes and SHASUMS verification evidence if available; document absence of PBDS instantiation (A28), Debian libz runtime non-loading/native-addon absence (A31), unavailable Debian package provenance, and bundled Chromium zlib/gz* reachability (RR-03). Name an operational owner/cadence for Node security-release checks; scan coverage must explicitly exclude proof of bundled-source safety.
  - **PASS:** Independent A28 NOT AFFECTED and A31 NOT AFFECTED at runtime are recorded with their qualifications, RR-03 informational remains tracked, Debian provenance uncertainty remains visible, no ACCEPT disposition is invented and no new finding is silently classified. Runtime/feature changes trigger reassessment and explicit review.
  - **FAIL:** RR-03 omitted because Trivy misses it, raw CVEs hidden/waived, unverified Debian patch claimed, new native addon/runtime changes escape review or owner acceptance presumed.
  - **Blocks production:** Yes for unreviewed new findings or unsupported safety claims. RR-03 and package-provenance qualification themselves retain Claude's stated scope; they are not silently promoted into or removed from blockers by this plan.
  - **Unrelated-infrastructure safety:** Read-only image/source/advisory analysis on the approved artifact. No registry deployment, system package upgrade or unrelated image pruning.

- [ ] **G00 — Final evidence reconciliation and separate release approval**
  - **Objective:** Produce a reproducible gate decision that does not confuse protected staging, historical local tests and production authorisation.
  - **Evidence:** All check results with immutable identities, redacted evidence locations and reviewer/owner decisions; explicit CR-01/03/04/07/RR-01/RR-02 residual register; actual host isolation and CR-10 drills; privacy/operator readiness; unchanged adversarial suite/strict-runner and full regression results for any later remediation candidate. Separate baseline candidate observations from subsequent fixes and never attach later results to the old tree. Verify restored final image/config/access/rules-only state and record remaining NOT RUN items.
  - **PASS:** Evidence is complete and attributable, required pre-production fixes/controls are independently reviewed and retested, no implicit risk acceptance occurred, and a separate explicit human production approval is recorded. Until that last approval, the gate stays BLOCKED even if tests pass.
  - **FAIL:** Any blocker/required NOT RUN item, scope/image drift, unsupported closure, historical measurements deleted, incomplete review, or deployment inferred from the staging recommendation.
  - **Blocks production:** Yes.
  - **Unrelated-infrastructure safety:** Evidence reconciliation is read-only. Any future deployment, infrastructure modification or public release is a separate authorised task, never the next automatic step of this plan.

## Required remediation versus this plan

The reviewed candidate remains immutable. Claude specifically requires a single-normalisation/byte-cap-first/expanded-length fix for CR-03, mixed-script/confusable/blank-symbol detection for CR-04, emoji exemption for RR-02, and fixes or proven edge controls for CR-01, CR-07 and RR-01 before production. Their baseline staging tests may reproduce failures; that is valid evidence, not a PASS and not permission to patch during this documentation task. Any subsequent code or infrastructure remedy needs a separately approved change, a new immutable identity where applicable, regressions and independent follow-up. Keep CR-02's fixed original property separate from RR-01; keep analyze-only CR-03 results separate from full-path results.

Relevant reviewed implementation: [server.js](../../src/server.js), [http-security.js](../../src/http-security.js), [analysis.js](../../src/analysis.js), [AI pipeline](../../src/ai/pipeline.js), [AI runtime](../../src/ai/runtime.js), [AI budget](../../src/ai/budget.js), [production-config.js](../../src/production-config.js), [Compose](../../deploy/compose.yaml), [deployment](../../deploy/scripts/deploy.sh), [connector build](../../deploy/scripts/build-connector.sh), [common helpers](../../deploy/scripts/common.sh), [rollback](../../deploy/scripts/rollback.sh), [unchanged Claude suite](../../tests/adversarial/claude-review.adversarial.mjs), [strict runner](../../scripts/claude-review-check.js), [browser checks](../../scripts/security-browser.js) and [CVE evidence](VULNERABILITY_REMEDIATION_1.md).

**Current execution status: NOT RUN for every item. External AI remains disabled. Security Gate and production remain BLOCKED; no risk has been accepted on the owner's behalf.**
