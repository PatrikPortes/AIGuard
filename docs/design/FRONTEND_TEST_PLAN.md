# Věřím tomu? — Frontend Test Plan (F0 baseline)

> **Stage:** F0 — frontend test and measurement baseline.
> **Baseline commit:** `899ad56f4ec69bee85e06f3ba839093139e4940e` (tree `3255b270dc5a15f637f2e2e04f602d586463857b`).
> **Authority:** `FRONTEND_DESIGN_DIRECTION.md` defines the targets. This document only measures the current frontend against them.
> **Security:** `scripts/security-browser.js` remains the authoritative security regression for the frontend. The F0 tools are **additional evidence only** and do not replace, weaken or reinterpret it.

F0 changed **no product file**. Every shortfall below describes the current UI and is expected at this stage. A shortfall is **not** a test failure.

---

## 1. Tools

| Tool | Measures | Needs a browser | Product files modified |
|---|---|---|---|
| `scripts/contrast-check.js` | WCAG contrast of colour-token pairs in `public/style.css`, plus reference values from FDD §5.3; ad-hoc pairs for F1 | No | No |
| `scripts/frontend-browser.js` | Layout at 6 viewports and simulated 200% zoom; text size, touch targets, approximate text contrast, overflow, first-viewport visibility of input and CTA, characters, reduced motion, keyboard baseline, console and page errors, failed, external and HTTP-error requests | Yes | No |
| `scripts/frontend-budget.js` | First-view transferred bytes by category, hero asset verification, LCP and FCP under emulated throttling | Yes | No |

None of the tools adds an npm dependency or modifies `package.json`. They aren't part of `npm test` or the Docker build, because Playwright is deliberately not a project dependency.

### 1.1 Result classification

All tools use the same vocabulary:

| Status | Meaning |
|---|---|
| **TARGET MET** | The requirement is satisfied in this environment |
| **SHORTFALL** | The current design doesn't meet a target in `FRONTEND_DESIGN_DIRECTION.md`. This is an expected baseline finding, not a failure |
| **REGRESSION** | Breaks an existing behaviour or invariant: console or page errors; failed, external or HTTP-error requests; horizontal overflow at widths `security-browser.js` already asserts (1440, 390, 320 px); input or CTA not reachable by keyboard |
| **NOT EXECUTED** | Couldn't be measured (for example, Playwright unavailable). Never reported as a pass |
| **TOOL FAILURE** | The tool itself crashed |

**Exit codes:**

| Code | `contrast-check.js` | `frontend-browser.js` | `frontend-budget.js` |
|---|---|---|---|
| 0 | Measured | No regression | Measured |
| 1 | — | Regression | — |
| 2 | Tool failure | NOT EXECUTED | NOT EXECUTED |
| 3 | — | Tool failure | Tool failure |

`--strict` makes shortfalls fail; it's intended for later stages once targets are adopted.

---

## 2. Prerequisites and how to run

**Common:**

- Node.js 24 (as in `package.json` `engines`). The baseline was measured with Node **24.21.0**.
- No secrets, no network access, no AI. The browser tools start the real application server in-process in **rules-only** mode on `127.0.0.1` with an ephemeral port.

**Browser tools additionally need** Playwright and Chromium in an isolated development or test environment, **outside** this project's dependencies:

```sh
# Contrast (no browser needed)
node scripts/contrast-check.js
node scripts/contrast-check.js --json
node scripts/contrast-check.js --pair '#b45309' '#fffce5' --target 7   # ad-hoc F1 candidate check

# Layout / accessibility baseline
PLAYWRIGHT_MODULE=<absolute path to playwright/index.mjs> \
CHROMIUM_PATH=<optional chromium executable> \
FRONTEND_OUTPUT_DIR=<directory outside the repo> \
node scripts/frontend-browser.js

# First-view bytes / LCP baseline
PLAYWRIGHT_MODULE=<…> CHROMIUM_PATH=<optional> FRONTEND_OUTPUT_DIR=<dir> FRONTEND_BUDGET_RUNS=5 \
node scripts/frontend-budget.js
```

**Notes:**

- If Playwright can't be imported, both browser tools print `NOT EXECUTED` and exit with code 2. They never fake a pass.
- Reports go to `FRONTEND_OUTPUT_DIR`, or to a new temporary directory if it's unset: `frontend-browser-report.json`, screenshots `<viewport>-home.png` / `<viewport>-result.png`, and `frontend-budget-report.json`. Keep reports **outside the repository**; screenshots and reports aren't committed.
- **Test-only server limits:** both browser tools start the server with raised per-client limits (`rateLimit`, `sessionIssueRateLimit`, `staticRateLimit`, `staticBytesPerMinute`, …). Their repeated cold page loads from one loopback IP would otherwise be throttled; the default 2 MiB/min static byte limit would return 429 for the 702 KB hero after about two loads. **Product code, defaults and production limits are unchanged.** Rate limiting itself is tested by the existing security tests, not by F0.
- Baseline environment: Playwright **1.56.1** with its bundled Chromium (revision **1194**, headless), Linux x86-64.

---

## 3. What is automated and what remains manual

| Area | Automated (F0 tools) | Manual / real-device only |
|---|---|---|
| Layout at 1440/1024/768/390/360/320 px | Overflow, first-viewport positions, character presence and size, screenshots | Visual judgement of composition and character recognisability (FDD TBD items 5–6) |
| 200% zoom | **Simulated** by a 640×360 CSS-pixel viewport, equivalent to a 1280×720 window at 200% | Real browser zoom (desktop Chrome, Firefox, Safari), OS text scaling, mobile "large text", pinch zoom. **Simulation is not equivalent to these.** |
| 320 px reflow | Overflow check at 320×568 | Real small phones |
| Text size / line height | Count of visible text elements under 18 px; body line-height ratio | Readability for older users |
| Touch targets | Visible interactive elements under 48×48 CSS px | Real touch use, thumb reach |
| Contrast | Token pairs (exact); rendered text vs. first opaque ancestor background (approximate; gradients and images marked "unresolved") | Sunlight and low-brightness checks on real phones; colour-vision-deficiency review |
| Reduced motion | `prefers-reduced-motion` rules present; running animations during analysis with `reduce` vs. `no-preference` | OS-level setting on real devices |
| Keyboard | Tab order, skip link first, input and CTA reachable, visible focus indicator (outline or box-shadow), keyboard-only submit moves focus to the result | Logical reading order, focus not obscured, real keyboard and switch-access users |
| Errors / network | Console and page errors, failed, external and HTTP ≥ 400 requests | — |
| Performance | First-view transfer by category, hero verification, LCP/FCP under emulated Slow 4G + 4× CPU and unthrottled | Real mid-range Android on a real mobile network, through Cloudflare (compression, edge cache) |
| Screen readers | **Not automated.** Not honestly automatable here | VoiceOver (iOS/macOS) and TalkBack (Android): see §7 |

---

## 4. Baseline measurements (commit `899ad56`)

### 4.1 Contrast (`contrast-check.js`)

**Formula** (WCAG 2.1/2.2):
- sRGB channel linearisation: `c ≤ 0.04045 ? c/12.92 : ((c+0.055)/1.055)^2.4`;
- relative luminance `L = 0.2126 R + 0.7152 G + 0.0722 B`;
- ratio `(L_lighter + 0.05) / (L_darker + 0.05)`.

**Targets:** 7:1 for essential text (FDD §16), 4.5:1 for normal text (AA), 3:1 for large text and UI or graphical objects.

**Self-check:** black on white is 21.00:1; `#777777` on white is 4.48:1. Both match the WCAG reference values.

**Result:** 24 pairs — 12 target met, **12 shortfall**.

| Pair (current tokens) | Ratio | Target | Status |
|---|---|---|---|
| `--ink` #0f1b3d on `--cream` #fffcf5 | 16.47 | 7 | Target met |
| `--ink` on `--surface` #fff | 16.87 | 7 | Target met |
| `--muted` #526078 on `--cream` | 6.20 | 7 | **Shortfall** |
| `--muted` on `--surface` | 6.36 | 7 | **Shortfall** |
| `--muted` on `--brand-soft` #f0eeff | 5.56 | 7 | **Shortfall** |
| White on `--brand-action` #5146d8 (primary button) | 6.53 | 7 | **Shortfall** (meets AA 4.5) |
| White on `--brand` #6c63ff | 4.32 | 4.5 | **Shortfall** |
| `--brand` on `--cream` (as text) | 4.21 | 4.5 | **Shortfall** |
| `--brand-action` on `--surface` | 6.53 | 4.5 | Target met |
| `--accent` #38bdf8 on `--cream` (graphic) | 2.09 | 3 | **Shortfall** |
| `--attention` #f59e0b on `--cream` (graphic) | 2.10 | 3 | **Shortfall** |
| `--success` #22c55e on `--cream` (graphic) | 2.22 | 3 | **Shortfall** |
| `--risk` #ef4444 on `--cream` (graphic) | 3.67 | 3 | Target met |
| `--ink` on amber/risk/mint/blue/brand-soft panels | 14.77–15.70 | 7 | Target met |
| `--muted-reference` #64748b on `--surface` | 4.76 | 4.5 | Target met (documented as not for final UI) |

**FDD §5.3 reference values** (recorded for F1; **not chosen** in F0):

| Pair | Ratio | Target | Status |
|---|---|---|---|
| Ink #0f1b3d on FDD cream #fffce5 | 16.32 | 7 | Target met |
| Proposed amber #b45309 **as text** on #fffce5 | 4.86 | 7 | **Shortfall** (AA only) |
| Proposed amber #b45309 **as icon or graphic** on #fffce5 | 4.86 | 3 | Target met |
| Purple #6c63ff as text on #fffce5 | 4.17 | 4.5 | **Shortfall** |
| Blue #38bdf8 as graphic on #fffce5 | 2.07 | 3 | **Shortfall** |

**Notes for F1 (findings, not decisions):**

- The current `--cream` is **#fffcf5**, while FDD §5.3 names **#fffce5**. This must be reconciled in F1.
- The proposed amber is usable for icons and graphics but not as essential text at 7:1.

### 4.2 Browser / layout (`frontend-browser.js`)

**Result:** 134 checks — **83 target met, 51 shortfall, 0 regression, no tool failure**.

**What passes everywhere:**

- **Errors and network:** 0 console errors, 0 page errors, 0 failed requests, **0 external requests** and 0 HTTP ≥ 400 responses, in every scenario including the result state.
- **Overflow:** no horizontal overflow at 1440/1024/768/390/360/320 px or simulated 200% zoom, on both home and result.
- **Line height:** body text is 18 px with line-height 1.6 (target ≥ 1.5 met).
- **Reduced motion:** the stylesheet has a `prefers-reduced-motion: reduce` rule. During analysis the progress animation runs with `no-preference` (one 1.7 s animation) and **no animation runs with `reduce`**.
- **Keyboard:**
  - 13 Tab stops; the first is the skip link „Přejít k ověření";
  - `#content` and `#submit` are reachable;
  - every stop has a visible focus indicator;
  - keyboard-only submission shows the result and moves focus into it.

**Baseline shortfalls (current design vs. FDD targets):**

| Finding | Details | FDD reference |
|---|---|---|
| **Input and primary CTA not in the first viewport at any size** | At 360×640: input top at 1529 px, CTA at 1832–1885 px. At 320×568: input at 1638 px. At 1440×900: input at 1177 px. The tool sits below the hero and intro sections | §7, §15 (input and CTA in the first 360×640 viewport) |
| **Characters not in the first viewport at 360 and 320 px** | The only character on home is the combined `verkarob` hero (280 CSS px wide on mobile). It's visible in the first viewport at 390×844 and above, but not at 360×640 or 320×568 | §7.3 (both characters present and recognisable in the first view) |
| Text under 18 px | 30–31 of 51–53 visible text elements on home; 49–50 of 77–79 in the result state. Examples: tagline 11.2 px, header links 13.5 px, eyebrow/intro paragraphs 17.1 px, speaker labels 13.0 px, „připravujeme" 10.8 px | §16 (body ≥ 18 px) |
| Touch targets under 48 px | Home: the brand/header link (116×23 desktop, 105×21 mobile). Result: also the `#simple` checkbox (20×20) | §16 (≥ 48×48) |
| Approximate rendered text contrast between 4.5:1 and 7:1 | 33–35 elements on home, 37–39 in the result state; **0 elements below 4.5:1**. Mostly secondary text in `--muted`, purple-tinted markers and labels (e.g. `.section-marker`, `.step-number`, `.input-option.upcoming`). Approximation: text colour vs. first opaque ancestor background | §16 (~7:1 essential text) |

The other FDD shortfalls aren't measured as layout checks; they're known from the plan review and will be addressed by later stages:
- tykání copy;
- numeric score and scale;
- simple-mode toggle;
- hard-coded privacy and "checked" claims;
- brand "Věřím?" instead of "Věřím tomu?".

### 4.3 Performance (`frontend-budget.js`)

**Method:** median of 5 cold runs per profile. Each run uses a fresh context with the cache disabled, no scrolling and no input. "First view" means every request completed by `load` plus 500 ms of network idle. Transfer is CDP `Network.loadingFinished.encodedDataLength` (headers + body).

**Hero asset verification:** `verkarob.614a9920…bf.webp` is **702 152 B** in the integrity map, **702 152 B** on disk and **702 152 B** as the served body. Size and SHA-256 are consistent. Transferred with headers: **702 890 B**.

| Profile | First-view transfer | Target ~300 KiB | LCP (median) | Target 2.5 s | LCP element | Load event |
|---|---|---|---|---|---|---|
| Mobile 360×640, DPR 2, Slow 4G (150 ms RTT, 1.6 Mbit/s down, 750 kbit/s up) + 4× CPU | **729.6 KiB** (747 119 B) | **SHORTFALL** | 780 ms | Target met | `h1` text | ≈ 3.9 s |
| Mobile 390×844, DPR 3, same throttling | **729.6 KiB** | **SHORTFALL** | 756 ms | Target met | `h1` text | ≈ 3.9 s |
| Mobile 360×640, unthrottled | 729.6 KiB | **SHORTFALL** | 108 ms | Target met | `h1` text | ≈ 0.09 s |
| Desktop 1440×900, unthrottled | 729.6 KiB | **SHORTFALL** | 120 ms | Target met | hero `img` (verkarob) | ≈ 0.08 s |

**First-view composition** (identical in all profiles):

| Resource | Transfer |
|---|---|
| Hero `verkarob.webp` | **686.4 KiB (94.1%)** |
| Scripts (`app.js` 7.5 KiB + `character-assets.js` 12.0 KiB) | 19.5 KiB |
| Stylesheet | 13.6 KiB |
| HTML document | 9.3 KiB |
| `/api/session` | 0.8 KiB |

External requests: 0. Failed requests: 0.

**Interpretation and limits:**

- **Bytes:** the first-view budget shortfall is driven almost entirely by the combined hero image (FDD §17; plan F10 / C7). Everything except the hero totals about 43 KiB.
- **LCP vs. the image:** LCP meets the target in emulation, but on mobile the LCP element is the H1 text. The hero is still downloaded eagerly (`fetchpriority="high"`) even when it's below the first viewport (360×640). Under Slow 4G the page finishes loading at about 3.9 s because of the hero. LCP therefore doesn't capture when the character illustration appears.
- **Compression:** this local server sends **no content compression**. Behind Cloudflare, HTML, CSS and JS may be compressed, so text transfer would be smaller. The WebP hero wouldn't shrink.
- **Emulation:** throttling is emulation, not a real device or network. Real mid-range Android measurements through the real edge are required (§6).

---

## 5. `scripts/security-browser.js`: invariants vs. design-specific assertions

The script is unchanged and authoritative. This classification is guidance for **future** stages: when markup changes, design-specific selectors and strings may be updated **in a Codex-reviewed change**; the invariant intent must stay asserted at least as strongly.

| # | Current assertion (abridged) | Class | Invariant to preserve when markup changes |
|---|---|---|---|
| 1 | At 1440/390/320 px, `#submit` becomes enabled after the session loads | Functional invariant | The analysis flow becomes usable only after the session is established |
| 2 | No horizontal overflow at 1440/390/320 px | Responsive invariant | No horizontal overflow at those widths (F0 extends this to 1024/768/360 and simulated zoom) |
| 3 | `.hero-character img` complete, `object-fit: contain`, original aspect ratio, inside the viewport | Character-integrity invariant (INV-8); the selector is design-specific | Approved character images are shown whole, uncropped and undistorted |
| 4 | Hero `alt` equals „Věrka a Robo – průvodci bezpečným ověřováním digitálního obsahu" | Design-specific (copy) | A meaningful alt text for the hero characters (or `alt=""` with adjacent text, per FDD §6.2) |
| 5 | Exactly one `<main>` | Accessibility structural invariant | One main landmark |
| 6 | Labels „Obsah k ověření" and „Typ obsahu" each exist once | Design-specific labels; a labelled input is the invariant | The content input has an accessible label; any type control remains labelled (FDD §8.1 makes the type control a secondary correction) |
| 7 | Content `<img src=x onerror=…>` → no `img` inside `#summary` | **Security invariant (XSS)** | User content is never rendered as HTML anywhere |
| 8 | No-signal text → `#risk-level` = „Bezpečnost nelze určit"; `#risk-character` = `verka-thinking`; `#signals-character` = `robo-default` | **Product-safety invariant** (no reassurance, no success imagery); exact strings and selectors are design-specific | Zero-signal results are never presented as safe and never use success, green or celebratory visuals (FDD §10) |
| 9 | URL input → summary contains „Stránku jsme nenavštívili", `#risk-level` neutral, `#risk-scale` hidden | **Product-safety invariant**; selectors design-specific | Link-only input is never reassuring, and no score or scale is shown as the verdict |
| 10 | HTML-looking `summary`/`signals` from a (future) model are rendered as text; no `img`; `window.xssExecuted` undefined | **Security invariant (XSS)** | Backend/model strings are rendered only as text |
| 11 | No page errors | Functional invariant | No uncaught page errors |
| 12 | JavaScript disabled, and module failure: submit disabled; Ctrl+Enter doesn't navigate; no request URL or body contains the private marker; native programmatic `submit()` posts an empty body | **Security/privacy invariant (CR-08)** | Analysed content never reaches the URL, query, history, referrer or server without the JS flow; the no-JS form carries no named data |

---

## 6. Real-device checks required later (not executable here)

**Devices and conditions:**

- Physical phones: a small Android (360×640-class viewport at 1.0–2.0 text scale), an iPhone SE-class device, a large Android and a large iPhone.
- Real Chrome/Android and Safari/iOS. Keyboard open and closed.
- Real 4G and outdoor conditions (sunlight, low brightness).

**Checks:**

- **First viewport:** is the input and primary CTA visible without scrolling, with the keyboard closed (FDD §7.3, §15)?
- **Characters:** are both visible and recognisable (TBD items 5 and 6)?
- **Real zoom:** browser zoom at 200% (desktop Chrome, Firefox, Safari); Android font scale up to 200% and iOS Larger Text; pinch zoom. Check content reflow, overlap and clipping.
- **Paper texture and annotation density** (TBD items 3 and 4, from F1/F7 onward).
- **Performance through the real edge:** first-view bytes with real compression and edge caching; LCP on a mid-range Android over real 4G.
- **OS reduced motion:** with the setting enabled on iOS and Android, no essential animation remains.

---

## 7. Screen-reader checks (manual; cannot honestly be automated here)

Run with **VoiceOver** (iOS Safari, macOS Safari) and **TalkBack** (Android Chrome) and record the results per release candidate:

1. **Landmarks and headings:** header, one main, footer; one H1; logical heading order.
2. **Skip link** reaches the analysis input.
3. **Labels:** the content input announces its label and hint; any type control announces its label.
4. **Submission:** the disabled → enabled state change is understandable; the loading status is announced politely; the result heading or region receives focus and is announced.
5. **Errors:** error, capacity and timeout states are announced as alerts and contain a next action.
6. **Decorative characters** are skipped. Meaningful character context is available as text.
7. **Future annotated message (F7):** the message and the numbered explanations are read in matching order; highlights are announced.
8. **Gestures:** with VoiceOver/TalkBack running, no essential action requires hover, swipe or timing.

---

## 8. Handover notes for F1

These are inputs, not decisions:

- **Contrast tokens:** `--muted` (6.20–6.36:1), white on `--brand-action` (6.53:1) and white on `--brand` (4.32:1) fall below the 7:1 essential-text target. Graphic tokens `--accent`, `--attention` and `--success` fall below 3:1 on cream.
- **Cream mismatch:** current #fffcf5 vs. FDD #fffce5.
- **Amber:** the FDD amber #b45309 reaches 4.86:1 on #fffce5. That's enough for icons, not for essential text at 7:1. Final amber and knowledge-family tokens stay F1 implementation-validation items.
- **Re-run before and after every later stage:** all three tools; the existing `npm test`; `npm run check`; the Claude strict suite (`node scripts/claude-review-check.js`); and `scripts/security-browser.js` where Playwright is available.
