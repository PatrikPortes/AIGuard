# AIGuard / Věřím tomu? — Independent adversarial security review (Claude)

| | |
|---|---|
| Reviewer | Claude (Anthropic AI model) acting as adversarial reviewer in an isolated cloud container. **Not a human reviewer.** This does not by itself satisfy the "independent security review by another person" requirement in `OPERATIONS.md` §4 / `SECURITY_RELEASE_GATE.md`. |
| Date | 2026-10-08 |
| Reviewed commit | `fde14ba57d62ba9e6aab0181170386a1d38da7a1` (detached HEAD, branch `security/gate-1-review`) — **verified** |
| Reviewed tree | `af22f138466dc28af62a0a1a2c9716ffb636ef8b` — **verified** |
| Scope | Entire tree: `src/`, `public/`, `scripts/`, `deploy/`, `Dockerfile*`, `.dockerignore`, `tests/`, all `docs/security/**` and evidence. Codex documents were treated as claims. |
| Not done | No deploy, no push, no commit, no DNS, no AI activation, no production/external system access. No Docker daemon was available, so no image was built or run. This is **not a penetration test**. |
| Artifacts added (uncommitted) | `tests/adversarial/claude-review.adversarial.mjs` (test-only, not picked up by `npm test`, excluded by `.dockerignore`) and this report. No production code was modified. |

---

## 1. Executive verdict

**BLOCK PUBLIC DEPLOYMENT.** The code is not yet ready for staging either: the P1 code fixes in §8 should land first, so that staging exercises the code that will actually ship.

What holds up. The HTTP/1.1 parser rejected every framing ambiguity I tried. Host/Origin/session enforcement works, including forged/expired/wrong-key cookies and Origin variants. The static allowlist is exact. There is no URL fetch, no upload and no outbound call in rules mode. The frontend renders text only. The production guard forces rules-only, and the dormant AI budget reserves atomically. The container config is hardened. I found **no path to code execution, secret disclosure or internal-service access from HTTP input** (P0: none).

What Codex missed. These are **application-layer problems an anonymous attacker can trigger today**, and they are not in Codex's gate:

* **Cheap global denial of service** (CR-01, CR-02, CR-03, CR-07). A single client with one IPv6 /64 can lock every user out of the API at about 10 req/s. Eight slow request bodies from one client pin all analysis slots. One 10 000-character message blocks the single-threaded event loop for about 190 ms of full-core CPU. Multi-MB images are served uncacheable and unthrottled. Codex's own test `Globální API quota funguje i při rotaci klientských IP` asserts the very behaviour that makes the lockout possible.
* **Dangerously misleading results** (CR-04, CR-05). Inserting invisible characters (U+200B, U+00AD, U+2060) or Cyrillic homoglyphs drops an obvious scam from 100 to 0. The UI then shows "Nízké riziko" with the smiling "success" mascot. Every phishing-style HTTPS URL that isn't a raw IP or punycode gets the same "low risk" presentation.
* **Two privacy and session-integrity weaknesses** (CR-06, CR-08). Without JavaScript the form sends the private message in the URL query string, and the session cookie is open to cookie-tossing.

On the 34 package findings, I disagree with Codex's dispositions on the substance. With symbol- and file-level evidence against the **exact production binaries**:

* **C01, C02 and C03 are NOT AFFECTED.** The vulnerable `x/crypto/ssh` connection/channel code and the `openpgp` packages are not linked into cloudflared. Codex's "FIX" is also not actionable: no cloudflared release with x/crypto ≥ 0.56.0 exists.
* **All four "CNA HIGH" advisories resolve to NOT AFFECTED, except CVE-2026-95619 in libstdc++6.** That one is MITIGATE: Node does import the aligned `operator new[]`, but the trigger needs a near-`SIZE_MAX` size.
* **Rebuilding from the newest base removes nothing today.** On 2026-10-08 the distroless `:nonroot` tag resolves to the same pinned digest, and a fresh Trivy scan reproduces all 31 + 3 rows.

---

## 2. Findings (ordered)

Severity: **P0** means code execution, secret or root exposure, or AI spend without control. **P1** means it must be fixed before public exposure and should be fixed before staging. **P2** means fix before or soon after a limited beta. **Info** means hardening or an observation.

### P0
None found.

### P1

#### CR-01: One IPv6 /64 (or a small botnet) can deny the API to all users. The global quota and the IP-limiter map are shared fail-closed resources.
* **Where:** `src/server.js:110-111`, `:118-119`; `src/limits.js:14`; `src/client-ip.js:5-14`.
* **Mechanism:**
  * The per-IP limiter keys on the **full /128** address from `CF-Connecting-IP`.
  * Every request to `GET /api/session` or `POST /api/analyze` then consumes the **single global 600/min bucket**. That happens before Origin/Host, session or content checks, with no cookie and no Origin needed.
  * Separately, the IP limiter refuses **every new key** with `503 AI_OVERLOADED` once it holds 10 000 keys (`limits.js:14`), for up to the full 60 s window.
* **Reproduced:**
  * `CR-01`: 600 requests from 600 addresses in `2001:db8:1:2::/64`, unauthenticated `GET /api/session`, production configuration. An unrelated client then receives **429**.
  * `CR-01b`: 10 000 distinct addresses. A new legitimate client receives **503**.
* **Cost to attacker:** about 10 req/s, sustained, from any host with IPv6 (Cloudflare passes the full IPv6 address). Pseudo-IPv4 is planned to stay disabled.
* **Fix:**
  * Key IPv6 clients by /64 (optionally also /48).
  * Evaluate per-IP and per-session limits before the global bucket, and charge the global analysis bucket only for requests that pass Origin and session checks.
  * Give `/api/session` its own bucket.
  * Evict the oldest limiter keys (LRU) instead of failing closed for every new key.
  * Add Cloudflare rate-limit rules keyed on /64 as a second layer.

#### CR-02: Eight slow request bodies from one client pin every analysis slot.
* **Where:** `src/server.js:123-124` takes the analysis slot **before** the body is read. `readJson` (`src/http-security.js:44`) then allows 5 s.
* **Reproduced (`CR-02`, production config):** one IP fetches 8 sessions and opens 8 POSTs with `Content-Length: 100` and a one-byte body. A victim's well-formed POST gets `503 AI_OVERLOADED`. That is 16 requests from one IP, below the 20/min per-IP limit; each round keeps the slots pinned for 5 s. Keeping them pinned continuously takes about 96 POSTs/min (plus session fetches), i.e. ~5–10 IPs, which are trivial to get from one IPv6 /64 (CR-01).
* **Unknown:** whether Cloudflare buffers request bodies before the tunnel. Only staging can show that. The application itself gives no guarantee.
* **Fix:**
  * Read the (≤ 64 KiB) body under the HTTP admission gate first, and take the analysis slot only for the CPU phase.
  * Cap in-flight analyses per IP/session at 1–2.
  * Shorten the body deadline, e.g. to 2 s.

#### CR-03: Super-linear rule regexes allow CPU exhaustion of the single-threaded server.
* **Where:** `src/analysis.js:15`: `rozbit.*telefon|ztrati[lva]+.*telefon`. The `[lva]+` followed by `.*` backtracks quadratically within a line.
* **Reproduced (`CR-03`):** `'ztrati' + 'l'.repeat(9994)` takes about **188 ms** of synchronous event-loop time on an unconstrained core. With `cpus: 0.5` that becomes roughly 2× wall time. During it, health, static and every other request is frozen. `analysisTimeoutMs` cannot interrupt synchronous work.
* **Scale:** within the legitimate per-IP quota (20/min), roughly 8–10 IPs saturate the container. Docker marks the container unhealthy but does **not** restart it (`restart: unless-stopped` only reacts to exit).
* **Codex claim disproved:** `SECURITY_RELEASE_GATE.md` R07 says "lineární ordered rules". The ordered phrases were fixed, but these two alternations were not.
* **Fix:**
  * Bound the gaps (`.{0,80}`, `[lva]{1,3}`) and cap line length before matching.
  * Optionally run rules in a `worker_thread` with a hard time budget.
  * Add an adversarial CPU regression corpus to CI.

#### CR-04: Trivial evasion makes an obvious scam score 0 ("Nízké riziko", success mascot). This is a dangerously misleading result.
* **Where:** `src/analysis.js:26` normalises only NFC and strips C0 controls. It keeps format characters and does not fold confusables or diacritics.
* **Reproduced (`CR-04`):** the built-in "family scam" example scores **100 / very_high**. After the following changes it scores:

  | Change | Score |
  |---|---|
  | U+200B inserted between characters | **0 / low** |
  | U+00AD (soft hyphen) inserted | **0 / low** |
  | U+2060 (word joiner) inserted | **0 / low** |
  | Cyrillic а/о substituted | **20 / low** |

  English and Slovak scams also score 0–35.
* **How it looks to the user:** for `low`, `public/app.js:57-59` shows `verka-success.png` and, with no signals, `robo-success.png`. A scammer can pre-process messages so recipients who check them are reassured. That defeats the purpose of a public anti-scam service. The disclaimers ("Nízké skóre nepotvrzuje bezpečnost") are present but secondary to the visual verdict.
* **Fix:**
  * Strip `Default_Ignorable_Code_Point`/`Cf` characters, apply NFKC, fold diacritics and map confusables to a skeleton before matching.
  * Treat the presence of such characters as a signal in its own right.
  * Never render the success state for "no signals found"; use a neutral "nelze posoudit" state.

#### CR-05: Every non-IP, non-punycode HTTPS URL is presented as "Nízké riziko" with the success mascot.
* **Where:** `src/analysis.js:36-39`. URL-type input can only ever produce `link` (+10) and `unusual_url` (+25).
* **Reproduced (`CR-05`):**

  | URL | Result |
  |---|---|
  | `https://csas-overeni-ucet.com/login` | **10 / low** |
  | `https://www.ceskasporitelna.cz.secure-login.top/ib` | **10 / low** |
  | `https://[::1]/admin` | **10 / low** (IPv6 literal not flagged) |

* **Fix (product decision plus a small code change):** the URL path cannot assess safety without fetching or reputation data, so it must never show a "low risk"/success verdict. Show "nelze posoudit" and the fixed verification steps.

#### CR-07: Unthrottled, uncacheable multi-MB static assets give egress amplification and connector saturation.
* **Where:**
  * The 14 PNGs total about **23 MB**: 1.4–2.2 MB each, displayed at avatar size.
  * Every response carries `Cache-Control: no-store` (`src/server.js:33`), so Cloudflare will not cache them.
  * Static GETs bypass every limiter.
  * `cloudflared` is capped at `cpus: 0.25`.
* **Reproduced (`CR-07`):** 100 sequential requests for `/assets/characters/verkarob.png` from one IP all returned 200, about **210 MB**, with no limit hit.
* **Impact:** one client can saturate the connector or VPS egress and take down the site for everyone. Legitimate page views also cost about 2–10 MB of uncached origin egress each.
* **Fix:**
  * Resize/compress the assets (they should be tens of KB each).
  * Serve static assets as `public, max-age=…, immutable` with versioned names, keeping `no-store` on HTML/API.
  * Add an edge rate rule.

### P2

#### CR-06: Session cookie can be shadowed (cookie tossing); no `__Host-` prefix and first-match parsing.
* **Where:** `src/limits.js:27`, `:39`.
* **Reproduced (`CR-06`):** `Cookie: guard_session=tossed; guard_session=<valid>` gives **403 SESSION_REQUIRED**. Any sibling subdomain or other same-site context that can set a `Domain=verimtomu.fyi; Path=/api` cookie causes a persistent per-victim DoS or session fixation into a shared quota. Exploitation needs control of some `*.verimtomu.fyi` content, which is not planned, so this is P2. The fix is trivial.
* **Fix:** name the cookie `__Host-guard_session` and accept any valid value when several are present.

#### CR-08: With JavaScript disabled, failing or not yet loaded, the form leaks the private message into the URL.
* **Where:** `public/index.html:16`. `<form id="analysis-form">` has no `method`/`action`, and the submit button is enabled in the HTML; only `app.js` (deferred) disables it.
* **Reproduced (real Chromium, JS disabled):** the URL after submitting is `/?type=text&content=PRIVATE-MARKER+moje+heslo+je+1234`, and the server received that request line.
* **Impact:** in production this ends up in Cloudflare request logs/analytics and in browser history and sync. It contradicts the privacy page ("neukládáme").
* **Fix:** `disabled` on the button in the HTML, `method="post"` pointing to a non-echoing endpoint, and a `<noscript>` notice.

#### CR-09: The app container has unrestricted egress to the internet, the Docker host gateway and the provider metadata service.
* **Where:** `deploy/compose.yaml`. The `ingress` network is a normal bridge, chosen to allow `127.0.0.1:43127` publishing. Codex documents this.
* **Why it matters:** if CR-0x or a future parser bug ever yields RCE, this is the pivot to `169.254.169.254` (cloud-init user-data) and to host services bound to `0.0.0.0`.
* **Fix:** a `DOCKER-USER` rule denying egress from `VERIM_APP_IP`, or an `internal: true` network with the diagnostic port removed (the healthcheck already runs in-container).

#### CR-10: The deploy reuses any pre-existing local image tagged `verimtomu:<sha>`.
* **Where:** `deploy/scripts/deploy.sh:88-91` skips the build when the tag exists and checks only the OCI label. Anyone or anything able to build with `--build-arg VCS_REF=<sha>` (e.g. a dirty-tree debug build) produces an image that will be deployed as that SHA. Inside the trust boundary (Docker admin), but it contradicts the comment "never build uncommitted working-directory code".
* **Fix:** always build from the archive (`--no-cache` is optional), or pin and compare the image **digest** recorded at approval.

#### CR-11 (future AI gate): AI budget exhaustion and output manipulation.
* **Not exploitable today:** `AI_MODE` is forced to `rules`. The items below must be closed before any AI activation.
* **Budget:** there is no per-identity AI budget. With CR-01-style address rotation, one actor can burn the whole daily cap in minutes. After that, `AI_CAPACITY_EXHAUSTED` returns **no result at all** (no rules fallback), which denies service to everyone.
* **Prompt injection:**
  * The evidence check (`schema.js:404`) is attacker-satisfiable, because the attacker writes the content.
  * The "overconfident" filter is a denylist. A paraphrase such as "Zpráva působí důvěryhodně a běžně" passes and is shown verbatim as the summary.
  * The rules floor only protects the numeric score.
* **SQLite reserve:** it is synchronous with `busy_timeout=3000`. Under multi-worker contention it can block the event loop for up to 3 s per call.

### Informational
* **I-1:**
  * Separate 10 000-char and 16 000-byte limits (`analysis.js:25`, `pipeline.js:206`): Czech text over about 8 000 characters with diacritics is rejected with `AI_INPUT_LIMIT` even in rules mode.
  * Restarts and expiry: sessions die on restart or after 1 h, and an open tab then gets `SESSION_REQUIRED` until reload. That is a UX issue, not security.
* **I-2:** A rejected `readFile` promise is cached forever (`server.js:153`); the asset stays 503 until restart. Low likelihood on a read-only rootfs.
* **I-3:** The fixed-window limiter allows a 2× burst at the window edge. `/api/health` is unthrottled but cheap.
* **I-4:** In development mode (`publicOrigin` unset) the expected origin is derived from the `Host` header, so a DNS-rebinding page could drive a developer's local instance. Rules only and no secrets, so harmless today. Keep `publicOrigin` mandatory in every non-loopback deployment.
* **I-5 (scanner coverage):**
  * Trivy reports `Number of language-specific files num=0` for the app image. **Node.js core (`/nodejs/bin/node`) is not vulnerability-scanned at all.** Node 24.21.0 is the newest v24 release as of the nodejs.org index on 2026-10-08, so it is fine today, but tracking Node security releases needs an explicit step.
  * Trivy also missed **GO-2026-5841** (`klauspost/compress` v1.18.0, s2 `NewDict` OOB read) in cloudflared. It is not affected: the `s2` package is not linked, and only `compress/flate` symbols are present.
* **I-6:** The session HMAC and the IP-hash HMAC share one key, with domain separation via the `ip:` prefix and a different input format. Acceptable.

---

## 3. Evidence summary

| Check | Result | Evidence |
|---|---|---|
| Commit and tree identity | **PASS** | `git rev-parse HEAD` = `fde14ba…a1`, `HEAD^{tree}` = `af22f13…ef8b` |
| `npm test`, Node 22.22.0 | **PASS** 65/65 | local run |
| `npm test`, **Node 24.21.0** (binary SHA `7fde7b8a…df4c`, identical to the audit image's `/nodejs/bin/node`) | **PASS** 65/65 | local run |
| `npm run check`, `bash -n` on four deploy scripts | **PASS** | local run |
| `scripts/security-browser.js` (Playwright and Chromium 1194) | **PASS** | local run |
| Adversarial suite `tests/adversarial/claude-review.adversarial.mjs` | **7 PASS** (invariants), **9 FAIL** (findings, marked `todo`) | `node --test --test-reporter=spec tests/adversarial/claude-review.adversarial.mjs` |
| No-JS form submit probe (real Chromium) | **FAIL** (leak reproduced) | CR-08 |
| Evidence manifests (pre-commit 150 files, gate-1.1 51 files) | **PASS**: all SHA-256 match the commit | local recomputation |
| Quick secret grep (API keys, private keys, CF tunnel token prefix) | **PASS**: no hits | `git grep` |
| `scripts/security-config.js`, Docker build and image runtime tests | **NOT RUN** | no Docker daemon in the review container |
| Gitleaks | **NOT RUN** | not installed; regex grep only |
| `npm audit` | **NOT APPLICABLE** | zero dependencies |
| Fresh Trivy 0.75.0 (checksum-verified download), pinned distroless base, from the registry | **RUN**: 31 rows, identical to Codex | DB UpdatedAt 2026-10-07T07:38:55Z, the newest published at review time |
| Trivy, current `distroless/nodejs24-debian13:nonroot` tag | **RUN**: same digest `9eeb7f58…`, same 31 rows | a rebuild today changes nothing |
| Trivy, cloudflared 2026.10.0 release binary | **RUN**: the same 3 rows | |
| Image layer extraction (gcr.io registry, every layer digest verified) | **RUN** | the node, libstdc++, libc and libz hashes equal Codex `runtime-files.json` |
| Cloudflare, VPS, HTTPS, edge parser, staging load | **NOT APPLICABLE** here, still to do | §9 |

**Claimed invariants I tried and failed to break** (adversarial suite, all PASS):

* **Parser and request smuggling:**
  * TE `chunked` given twice, `xchunked`, `chunked, identity`, obs-fold TE.
  * Space before the colon, CL list/`+`/negative, NUL or bare CR in a header, bare-LF line endings: all **400**.
  * The body of a rejected request (404, 405, 415) is never parsed as a second request.
  * Duplicate Origin, Content-Type, Cookie, Content-Encoding or Host headers: **400**.
* **Sessions:** forged, expired-but-re-signed, wrong-secret, truncated and zero-UUID cookies → **403** without the pipeline being invoked.
* **Origin and Host:**
  * Origin `null`, `http://`, `:443`, upper case or a trailing dot → **403**.
  * Host with a port or `www.` → **403**.
* **Request bodies:** CESU surrogates, overlong encodings, >U+10FFFF, truncated sequences and 0xFF bytes → **400**. 65 KB of `[` is rejected and the server stays up. `__proto__` in the JSON is inert.
* **Static files:** case, encoding, dot, `;` and directory variants never escape the 18-entry map.

---

## 4. Disagreements with Codex's audit

1. **"No new P0/P1 remote path proven"** (`ARCHITECTURE_REVIEW.md`, `INDEPENDENT_REVIEW_PACKAGE.md`). I disagree. CR-01, CR-02, CR-03, CR-04, CR-05 and CR-07 are remotely triggerable by an anonymous HTTP client and are P1 for a public service. Codex classified IPv6 /64 rotation and "botnet can block global capacity" as **residual risk**. It is actually the cheapest attack on the system and has a simple code fix.
2. **The global-quota test.** `security.test.js:115` (`Globální API quota funguje i při rotaci klientských IP`) is cited as evidence of a protection. It proves only that rotating IPs cannot *exceed* 600/min. It demonstrates, rather than prevents, the lockout of every other user.
3. **"Lineární ordered rules" (R07).** Only the ordered-phrase rules were linearised. `rozbit.*telefon` and `ztrati[lva]+.*telefon` remain super-linear (CR-03).
4. **C01/C02 "FIX".** Codex infers reachability from "198 x/crypto/ssh symbols linked". Symbol *count* is the wrong measure.
   * The Go vulnerability database (GO-2026-6355 / GO-2026-6354) lists the affected symbols: `Dial`, `NewClientConn`, `NewControlClientConn`, `NewServerConn`, `channel.Accept`, `channel.handlePacket`, `channel.responseMessageReceived`. **None of them, and no `(*mux)` or `(*channel)` method at all, is present in the binary.**
   * The linked SSH code is limited to key types, KEX/cipher tables and `MarshalAuthorizedKey`/`NewPublicKey` (used by `sshgen`).
   * There is also **no vendor release containing x/crypto ≥ 0.56.0**: 2026.10.0 is the latest tag, and `master` still pins v0.55.0. "FIX" is not achievable, and R13 should not wait for it.
5. **C03 "INVESTIGATE".** No `x/crypto/openpgp*` package is linked, not even a package `.inittask`. The OSV entry is import-level. Disposition: NOT AFFECTED.
6. **GCC source-family rows (A01, A02, A24–A27) "INVESTIGATE".** `gcc-14-base`, `libgcc-s1` and `libgomp1` do not contain libstdc++ code. This is a scanner match by source package. Disposition: NOT AFFECTED.
7. **A28 (PBDS `erase_if` UAF, CNA 7.0) "INVESTIGATE".** PBDS (`ext/pb_ds`) is a header-only template library. Vulnerable code exists only where a program instantiates it. The production `node` binary (not stripped, 142 720 symbols) has **zero** `pb_ds` symbols. Disposition: NOT AFFECTED.
8. **A29 (aligned `operator new` overflow, CNA 7.7).** Codex left this "not proven or excluded". I establish it **is** linked: `node` imports `_ZnamSt11align_val_t`, which `libstdc++.so.6.0.33` exports. Disposition: MITIGATE plus fix when a vendor build is available, not INVESTIGATE.
9. **A31 (zlib `gz_vacate`, CNA 8.3/7.4) "INVESTIGATE".** The image's `libz.so.1.3.1` reports upstream version `1.3.1`, which is below the CNA range 1.3.1.2–1.3.2. It is not NEEDED or loaded by node, and Node exposes no `gz*` file API to JavaScript. Disposition: NOT AFFECTED.
10. **A04 (strfmon, CNA 7.7) "MITIGATE".** The image contains exactly one ELF executable (`/nodejs/bin/node`), and no executable or shared library in it imports `strfmon`. Disposition: NOT AFFECTED.
11. **Coverage gap not stated.** Trivy does not scan Node.js core in this image (I-5), and it missed GO-2026-5841.
12. **Agreements.** I confirm the parser, origin, session and static-allowlist invariants, the absence of fetch/upload, the browser text-only rendering, the rules-only guard, the atomic SQLite reservation (the four-worker test is genuine) and Codex's honest statements of limits (bridge NAT, NODE_OPTIONS ordering, Docker admin trust).

---

## 5. Missing or inadequate tests

* **Availability:**
  * No test for global-quota fairness, i.e. that one /64 cannot lock out others (CR-01).
  * No test for limiter-map exhaustion (CR-01b).
  * No test for per-client slow-body slot pinning (CR-02).
  * No CPU-time regression for adversarial inputs (CR-03).
  * No static-asset rate or caching test (CR-07).
* **Result quality:**
  * No evasion corpus: invisible characters, homoglyphs, missing diacritics, English and Slovak text (CR-04).
  * No URL-verdict presentation test (CR-05).
  * `analysis.test.js` checks only friendly, positive examples.
* **Sessions:**
  * `server.test.js:47` labels a forged cookie test as "forgery". In non-production mode it actually asserts **200** with a fresh cookie, so it proves nothing about forgery rejection.
  * The production path tested only a *missing* cookie. My invariant test now covers forged, expired and wrong-key cookies.
  * Cookie tossing and multiple-cookie handling were untested (CR-06).
* **Parser:** Codex's raw tests covered CL+TE, duplicate CL and Host, and oversize headers. Obs-fold, TE variants, bare LF/CR, NUL, CL formats, duplicate Origin/Content-Type/Cookie and request-pipelining-after-reject were untested. I added them, and they pass.
* **Frontend:** nothing checks that the form is safe without JavaScript (CR-08), or that "low" and "no signals" are never shown with success visuals.
* **Logging:** the test labelled as logging only checks HTTP response redaction. There is no captured-stdout/stderr marker test. Codex acknowledges this.
* **Deploy:**
  * Mock Docker only.
  * No test that a pre-existing `verimtomu:<sha>` tag forces a rebuild or digest check (CR-10).
  * No failed-rollback recovery test.
* **Supply chain:** no symbol-level reachability step (govulncheck `-mode=binary` or equivalent) for cloudflared, and no Node-core advisory check.

---

## 6. Vulnerability / CVE disposition (all 34, plus extras)

**How the evidence was gathered:**

* **Binaries:** the production `node`, `libstdc++.so.6.0.33`, `libc.so.6` and `libz.so.1.3.1` were extracted from the pinned distroless layers (`gcr.io/distroless/nodejs24-debian13@sha256:9eeb7f58…`, amd64 manifest `sha256:2a2f6eb2…`, every layer digest verified). Their SHA-256 values equal Codex's `runtime-files.json`.
* **Symbols and files:** I checked symbol imports with `readelf`/`nm`, and the image file list for gconv modules, nscd, ldd and SUID/SGID files.
* **cloudflared:** the checks used the official 2026.10.0 release binary (`d33ff2d1…99db`, same tag, `go version -m` shows x/crypto v0.55.0). It is **not byte-identical** to the image binary (`6fb37346…e68906c8e`). The image binary has the same 198/0 SSH/openpgp symbol counts per Codex's evidence, but the C01–C03 conclusion must be re-confirmed on it with `go tool nm` (see §9).
* **Advisory data:** affected symbols came from the official Go vulnerability database via a clone of `github.com/golang/vulndb`, since `vuln.go.dev` was blocked by policy. The Debian security tracker was unreachable, so Debian triage status is not verified.

**Dispositions:**

| Row | ID | Package | Trivy / CNA | Disposition | Evidence (summary) |
|---|---|---|---|---|---|
| A01 | CVE-2026-102010 | gcc-14-base | MED / CNA 7.0 HIGH | **NOT AFFECTED** | metadata/doc package; PBDS is a header-only template; no code in this package |
| A02 | CVE-2026-95619 | gcc-14-base | MED / CNA 7.7 HIGH | **NOT AFFECTED** | no libstdc++ code in this package |
| A24 | CVE-2026-102010 | libgcc-s1 | MED / CNA 7.0 HIGH | **NOT AFFECTED** | unwinder library; vulnerable code lives in libstdc++ templates |
| A25 | CVE-2026-95619 | libgcc-s1 | MED / CNA 7.7 HIGH | **NOT AFFECTED** | aligned `operator new` is exported by libstdc++.so, not libgcc_s |
| A26 | CVE-2026-102010 | libgomp1 | MED / CNA 7.0 HIGH | **NOT AFFECTED** | not NEEDED or loaded; no libstdc++ code |
| A27 | CVE-2026-95619 | libgomp1 | MED / CNA 7.7 HIGH | **NOT AFFECTED** | as above |
| A28 | CVE-2026-102010 | libstdc++6 | MED / CNA 7.0 HIGH | **NOT AFFECTED** | header-only `ext/pb_ds`; production node has 0 `pb_ds` symbols |
| A29 | CVE-2026-95619 | libstdc++6 | MED / CNA 7.7 HIGH | **MITIGATE** (then FIX when distroless ships a patched libstdc++6) | node imports `_ZnamSt11align_val_t`, so the code is linked; the trigger needs a near-`SIZE_MAX` size; HTTP input is ≤ 64 KiB and there are no native addons; recheck the base digest weekly |
| A03 | CVE-2026-18374 | libc6 | MED | **NOT AFFECTED** | `fopen64` modes are compile-time constants in Node/libuv; no user-controlled mode |
| A04 | CVE-2026-19499 | libc6 | MED / CNA 7.7 HIGH | **NOT AFFECTED** | no ELF in the image imports `strfmon` (node is the only executable; all .so files checked) |
| A05 | CVE-2026-19542 | libc6 | MED | **NOT AFFECTED** | no importer of `tdelete`/`tsearch` |
| A06 | CVE-2026-5435 | libc6 | MED | **NOT AFFECTED** | no importer of `ns_sprintrr`/`fp_nquery` |
| A07 | CVE-2026-6238 | libc6 | MED | **NOT AFFECTED** | same as A06 |
| A08 | CVE-2026-6368 | libc6 | MED | **NOT AFFECTED** | no importer of `wordexp`; no shell in the image |
| A09 | CVE-2026-6791 | libc6 | MED | **NOT AFFECTED** | same as A08 |
| A10 | CVE-2026-77117 | libc6 | MED | **MITIGATE** | `gconv/SHIFT_JISX0213.so` **is present**; node does not import iconv; libstdc++ imports `iconv_open` (codecvt) but the charset is not attacker-selectable; no path found; pick up when vendor-fixed |
| A11 | CVE-2026-80489 | libc6 | MED | **MITIGATE** | same, `EUC-JISX0213.so` present |
| A12 | CVE-2026-8674 | libc6 | MED | **MITIGATE** | trigger is a long search domain in `resolv.conf`/`LOCALDOMAIN` (host/admin-controlled); rules mode performs no DNS lookups; on the VPS, verify the container `resolv.conf` and keep `LOCALDOMAIN` unset |
| A13 | CVE-2026-86805 | libc6 | MED | **NOT AFFECTED** | no SUID/SGID file in the image (verified by layer extraction); NNP; UID 65532 |
| A14 | CVE-2026-89092 | libc6 | MED | **NOT AFFECTED** | no `nscd` binary in the image; no nscd socket mount |
| A15 | CVE-2026-95818 | libc6 | MED | **NOT AFFECTED** | as A13 |
| A16 | CVE-2010-4756 | libc6 | LOW | **NOT AFFECTED** | no importer of `glob` |
| A17 | CVE-2018-20796 | libc6 | LOW | **NOT AFFECTED** | no importer of `regcomp`/`regexec`; JS uses V8 irregexp |
| A18 | CVE-2019-1010022 | libc6 | LOW | **MITIGATE** | disputed hardening weakness, relevant only with a separate memory-corruption bug (none known); keep NNP, RO and seccomp |
| A19 | CVE-2019-1010023 | libc6 | LOW | **NOT AFFECTED** | no `ldd` in the image; no user ELF processed |
| A20 | CVE-2019-1010024 | libc6 | LOW | **MITIGATE** | as A18 |
| A21 | CVE-2019-1010025 | libc6 | LOW | **MITIGATE** | as A18 |
| A22 | CVE-2019-9192 | libc6 | LOW | **NOT AFFECTED** | as A17 |
| A23 | CVE-2026-97399 | libc6 | LOW | **NOT AFFECTED** | Power8-only code; deployment is amd64. Deploys must stay amd64, because the index also publishes ppc64le |
| A30 | CVE-2026-27171 | zlib1g | MED (CNA 2.9, local) | **NOT AFFECTED** | `libz.so` not NEEDED or loaded; node's bundled zlib is `1.3.2.1-motley` (≥ 1.3.2) |
| A31 | CVE-2026-85091 | zlib1g | MED / CNA 8.3/7.4 HIGH | **NOT AFFECTED** | Debian lib version string `1.3.1` is below the affected range 1.3.1.2–1.3.2; not loaded; no `gz*` API reachable from JS. Residual: confirm Debian triage when the tracker is reachable |
| C01 | CVE-2026-56855 (GO-2026-6355) | golang.org/x/crypto v0.55.0 | MED | **NOT AFFECTED** | none of the affected symbols is linked; re-confirm on image binary `6fb37346…` |
| C02 | CVE-2026-78662 (GO-2026-6354) | golang.org/x/crypto v0.55.0 | MED | **NOT AFFECTED** | as C01, including `channel.Accept`/`responseMessageReceived` |
| C03 | GO-2026-5932 | golang.org/x/crypto (openpgp) | UNKNOWN | **NOT AFFECTED** | no `openpgp*` package linked (0 symbols, including init) |
| extra | GO-2026-5841 | klauspost/compress v1.18.0 | (missed by Trivy) | **NOT AFFECTED** | `s2` package not linked |
| extra | Node.js core 24.21.0 | node | (not scanned by Trivy) | **INVESTIGATE (process)** | current latest v24; add Node security-release monitoring |

**Totals:** **27 NOT AFFECTED, 7 MITIGATE (A29 also FIX when a vendor build is available), 0 FIX now, 0 INVESTIGATE** on the original 34. No ACCEPTED RISK is proposed; acceptance remains the owner's decision.

**Patched versions and rebuilds:**

* No patched Debian, distroless or cloudflared artifact exists today. A rebuild from the newest base or vendor artifact removes **none** of the rows.
* The scanner will keep reporting these rows. Record each disposition with this evidence instead of suppressing it blindly, and re-scan weekly.
* Any new feature (upload, PDF/image parsing, fetch, native addon, AI provider) invalidates the "NOT AFFECTED by reachability" rows and requires a re-review.

---

## 7. Remaining attack paths: answer to the review question

*Attacker controls all HTTP input reaching the public app, but not Cloudflare, the VPS or deployment credentials.*

* **A) Execute code.** No realistic path found.
  * The input surface is JSON ≤ 64 KiB, parsed by V8 and matched with JS regexes.
  * There is no `eval`, no child process, no fetch, no upload, no native addon and no template rendering.
  * Native library CVEs are not reachable (§6).
  * Residual risk is an unknown V8/llhttp/Node 0-day.
  * Blast radius if that happens: UID 65532, read-only rootfs, no capabilities, NNP, default seccomp, no secrets in the app container. But there is **full outbound egress, including the host gateway and provider metadata** (CR-09).
* **B) Read secrets.** No path found.
  * The app container holds no secrets: no AI key, and the tunnel token is mounted only into the connector. The session HMAC key lives only in process memory.
  * The static map is exact, error bodies are fixed strings, and the app does not log.
* **C) Reach internal services.** No path found from HTTP input: there is no outbound request in rules mode, and provider redirects are refused for future AI. (An RCE would get unrestricted egress, see A.) Note that whoever holds the tunnel token or Cloudflare account can route any hostname to anything `cloudflared` can reach, including the host gateway. That actor is out of scope by assumption.
* **D) Exhaust resources.** **Yes, cheaply. This is the main open risk.**
  * Global API lockout via IPv6 /64 rotation or limiter-map exhaustion (CR-01).
  * Analysis-slot pinning via slow bodies (CR-02).
  * Event-loop CPU blocking at about 190 ms per request (CR-03).
  * Static egress and connector saturation (CR-07).
  * Unhealthy containers are not auto-restarted.
* **E) Exhaust future AI budget.** **Not today** (rules-only is enforced at startup). Once AI is enabled, CR-01 rotation plus the absence of per-identity AI budgets lets one actor exhaust the daily cap within minutes, denying AI to everyone with no fallback. The money cap holds: the atomic reserve before every attempt is correct.
* **F) Manipulate another user's session.**
  * Not from HTTP input alone. Sessions are HMAC-signed and HttpOnly/Secure/SameSite=Strict, and CSRF is enforced by exact Origin and Host.
  * A sibling-subdomain or same-site attacker can toss or shadow the cookie: per-victim DoS or quota fixation (CR-06).
  * Sessions are quota tokens, not authentication, so no data of another user is exposed.
* **G) Make the application give dangerously misleading results.** **Yes, trivially.**
  * Invisible characters or homoglyphs turn an obvious scam into "Nízké riziko" with success visuals (CR-04).
  * Any lookalike HTTPS URL is shown as "low risk" (CR-05).
  * In future AI mode, injected content can steer the displayed summary past the denylist (CR-11).

---

## 8. Required fixes before staging

Code fixes. Each should come with a regression test; the matching `todo` test in `tests/adversarial/` can be flipped to a normal test.

1. **CR-01:**
   * IPv6 /64 keying.
   * Per-IP checks before the global bucket.
   * A separate session bucket.
   * The global analysis bucket charged only after Origin and session pass.
   * LRU eviction instead of fail-closed on map size.
2. **CR-02:**
   * Read the body before taking the analysis slot.
   * Per-IP/session in-flight cap.
   * Shorter body deadline.
3. **CR-03:** bounded regex gaps and a line-length cap, plus an adversarial CPU budget test (e.g. < 10 ms per 10 000-char input).
4. **CR-04:**
   * Input normalisation (strip `Cf`/default-ignorables, NFKC, diacritic folding, confusable skeleton).
   * Hidden characters treated as a signal.
   * An evasion corpus in the tests.
5. **CR-05 and CR-04 presentation:** remove the "low risk"/success state for URL-type and zero-signal results; show a neutral "nelze posoudit" state.
6. **CR-07:**
   * Optimise the PNGs.
   * Cacheable static headers (HTML/API stay `no-store`).
   * A plan for an edge rate rule.
7. **CR-08:** disable the submit button in the HTML, give the form a safe `method`/`action`, add a `<noscript>` notice.
8. **CR-06:** `__Host-` cookie prefix and tolerant multiple-cookie parsing (cheap, do it with the rest).
9. **Process items:**
   * Re-run the full suite and the adversarial suite on Node 24.21.0.
   * Rebuild the images from the approved commit and re-scan with a fresh DB.
   * Run `go tool nm` on the exact connector binary (§9).
   * Record the CVE dispositions from §6 against R13.
   * R00 (approved Git release) remains a human step.

Recommended before **public** use, not strictly before staging: CR-09 (egress restriction), CR-10 (digest pinning in deploy), I-5 (Node advisory monitoring), and the gates Codex already lists (R03–R06).

---

## 9. Checks that need the real VPS and Cloudflare

* **Exact connector binary:** `go tool nm /usr/local/bin/cloudflared` (SHA `6fb37346…`) must contain no `x/crypto/ssh.(*channel)`, `(*mux)`, `NewClientConn`, `NewServerConn`, `Dial` or `openpgp` symbols. This confirms C01–C03 on that binary.
* **Client IP:**
  * `CF-Connecting-IP` is overwritten for spoofed client headers, over HTTP/1.1, HTTP/2 and HTTP/3.
  * Pseudo-IPv4 is off.
  * There are no Workers or Transform Rules on the path.
  * Behaviour of Worker-originated requests from other zones.
* **IPv6:** whether the edge can be configured to aggregate or limit per /64 (CR-01 second layer).
* **Request bodies:** whether Cloudflare/cloudflared buffers request bodies or streams them slowly to the origin (CR-02). Also measure the end-to-end parser for CL/TE and duplicate-header normalisation at the edge, and whether duplicated Origin, Cookie or Host headers survive H2→H1 translation.
* **Host header:** cloudflared forwards the original `Host: verimtomu.fyi`; no `httpHostHeader` override.
* **Edge caching and logging:**
  * Edge caching behaviour for static assets after the CR-07 fix; `no-store` is respected for HTML/API.
  * Cloudflare and VPS log content: no query-string content after the CR-08 fix, and no bodies or cookies. Retention to be documented.
* **Load:** CPU and event-loop behaviour under `cpus: 0.5` with the adversarial corpus. Health-check behaviour and alerting on an unhealthy container that does not restart.
* **Network:**
  * Connector egress and app egress restrictions (CR-09).
  * The container `resolv.conf` has no long search domains (A12).
  * Docker 28+ loopback-publish protection, and an external IPv4/IPv6 port scan.
* **Host and operations:** HTTPS, HSTS and redirect; token file owner/mode; SSH/firewall hardening; rollback and restore drill (Codex's R03–R06).

---

## 10. Final recommendation

**BLOCK PUBLIC DEPLOYMENT.**

* **Staging** should start only after the §8 code fixes (CR-01 to CR-05, CR-07, CR-08, CR-06), with their regression tests, have been made and re-reviewed. The code is not yet "READY FOR STAGING".
* **Production** readiness cannot be declared: no production or staging infrastructure exists, and none of the §9 checks has been performed.
* **Risk acceptance:** no risk was accepted on the owner's behalf.
* **Independence:** this review was performed by an AI reviewer distinct from the implementing agent. It does not replace the human independent review and approval that the project's own gate requires.
