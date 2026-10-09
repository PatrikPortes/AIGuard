# Věřím tomu? — Frontend Design Direction

Status: Approved baseline frontend/UX direction.
Intended location: docs/design/FRONTEND_DESIGN_DIRECTION.md
Scope: UX, layout, interaction, responsive behaviour and frontend product direction. This document is not production code and does not change security architecture.

## 1. Purpose

This document is the canonical frontend and UX direction for Věřím tomu? (verimtomu.fyi). It consolidates the independent design review and the product-owner decisions taken afterwards. An implementation agent should be able to build the redesigned frontend from it without re-deciding product questions.

Věřím tomu? is not an AI detector. It is a guide to making a safer decision. Every screen must help the user understand:

what looks suspicious;
why it matters;
what we do and do not know;
what to do safely next;
how to verify the situation independently.
The product must never imply more certainty than the analysis has.

„Nenašli jsme problém" ≠ „je to bezpečné".

## 2. Design authority

When sources disagree, this order applies:

| Rank | Source | Authoritative for |
| --- | --- | --- |
| 1 | Věrka: the six PNGs of the 2026-10 refresh (public/assets/characters/verka/*.png, public/assets/characters/verkarob.png). Robo: docs/design/VERIM_CHARACTER_REFERENCE.png | The appearance of Věrka and Robo (the old Věrka on the reference sheet is historical material) |
| 2 | docs/design/FRONTEND_DESIGN_DIRECTION.md (this document) | UX, layout, interaction, responsive behaviour, frontend product direction |
| 3 | docs/design/DESIGN_SYSTEM.md | Design tokens, components, implementation primitives |
| 4 | docs/design/VERIM_VISUAL_REFERENCE.png | Original visual and layout inspiration |

Conflict rules:

On UX or layout, this document overrides the older visual reference.
Věrka and Robo must not be redesigned. Their character reference stays authoritative. Responsive work may change scale, placement, spacing and composition only.
Where a token in DESIGN_SYSTEM.md contradicts an accessibility requirement here (§16), the accessibility requirement wins, and the design system should be updated to match.

## 3. Product principles

Action before assessment. The first sentence of every result tells the user what to do next, not how risky the content is.
No "safe" verdict exists. No message result is ever presented as safe, low risk, or with green or celebratory styling.
Show the evidence, not just the verdict. Every signal points to the exact words or element in the user's own content. If we can't point to it, we don't claim it.
The suspicious content's own contacts are never part of the solution. Its phone numbers, links, email addresses and names are untrusted. They are shown only as plain text and never offered as a way to verify.
Say what was and wasn't checked, honestly and dynamically. The result reports only the checks that actually ran during that analysis.
Plain language is the default. Detail is opt-in, behind „Chci vědět víc". There is no separate "senior mode".
One decision per screen. No dashboards, gauges, tabs or carousels.
Calm urgency. Even the strongest warning is steady and direct. No fear UX: no countdowns, flashing, alarm red or exclamation-mark copy.
Always a useful next step. Every state, including errors, gives the user a safe action.
Ask only what changes the advice. At most 2–3 tap-to-answer follow-up questions, always skippable.
Honest about AI and synthetic media. The product never claims to detect AI-generated or deepfake content unless the backend actually performs and reports that check.
Privacy is visible at the point of input, and every privacy claim matches the deployed implementation.

## 4. Audience and usability target

Primary users: ordinary, non-technical Czech users, including:

people aged 60+;
people under stress right after receiving a suspicious message;
users with low digital or security literacy;
mobile users, often arriving from an SMS on the same phone;
people worried about AI scams, phishing and deepfakes.
Typical situations:

„Mami, mám nové číslo"
a fake bank message
a fake courier or parcel message
a phishing email
a suspicious invoice or payment request
an investment scam
a romance scam
a suspicious link
a screenshot from WhatsApp, Messenger, SMS or social media
suspected AI-generated content
Usability target:

An interface that an 8-year-old and an 80-year-old can understand, without making an adult feel they are using a children's app.

| The personality is | It must not feel |
| --- | --- |
| friendly | childish |
| calm | cyberpunk |
| trustworthy | like antivirus software |
| approachable | like a security operations (SOC) dashboard |
| Czech | alarmist |
| simple | overly corporate |
| human | clinically sterile |
| non-technical by default |  |

Language:

Czech vykání everywhere. Never ty.
For gender-neutral past tense, prefer the plural form („Už jste zaplatili?") over slash forms („zaplatil/a"), which hurt readability.
Avoid unexplained terms such as phishing, homoglyph, NFKC, heuristic, threat intelligence, doména, URL. Use „podvodná zpráva", „odkaz", „skutečná adresa". Technical terms may appear only under „Chci vědět víc", and then only with an explanation.

## 5. Visual direction

### 5.1 Concept

A calm, illustrated notebook of a trusted helper. The interface is a clean, conventionally typeset page. Věrka adds a few drawn marks to it: a marker highlight, a circled number, a small arrow, a short note.

The illustration explains; the typography informs.

### 5.2 Two strictly separated layers

| Layer | Contains | Style |
| --- | --- | --- |
| Information layer | All text, inputs, buttons, results, errors, labels | A standard, highly readable sans-serif with full Czech diacritics. Crisp edges, solid fills, high contrast. |
| Personality layer | Characters, marker highlights, circles, arrows, circled numbers, small illustrated icons, section dividers | Slightly hand-drawn, one consistent line weight, navy "ink" with purple or blue accents. Always decorative or redundant. Never the only carrier of meaning. |

Rules:

No handwritten or script fonts for body text, labels, inputs, buttons or any information.
Hand-drawn elements support explanation, personality, guidance and hierarchy. They must never reduce usability.

### 5.3 Palette (from the existing direction)

| Role | Value |
| --- | --- |
| Background, cream | #FFFCE5 |
| Primary accent, purple | #6C63FF (large text or buttons only, after contrast check) |
| Ink / body text, dark navy | #0F1B3D |
| Secondary accent, blue | #38BDF8 (decorative or large elements only, after contrast check) |
| Concern accent, amber | proposed #B45309 on cream. TBD — IMPLEMENTATION VALIDATION: exact value after contrast measurement |
| Neutral "knowledge" family | blue-grey. TBD — IMPLEMENTATION VALIDATION: exact token |

Avoid excessive red. Green is reserved for the user's own completed safe actions (§10.6). It is never used for an analysis outcome.

### 5.4 Surfaces and texture

Background: cream with an optional, barely perceptible paper grain, implemented as a tiny CSS or SVG noise, never a large texture image.
Cards: "sheets of paper": a near-white fill, a soft shadow and generous rounded corners, with at most one very subtle irregular edge. Cards are never tilted, taped or stacked like a scrapbook.
Icons: one illustrated icon set in the same line style as the characters, always paired with a text label.
Motion: minimal. A marker stroke may "draw" once; Robo may have a gentle idle loop while analysing. All motion respects prefers-reduced-motion. Nothing bounces, and nothing celebrates an analysis outcome.
Paper-texture intensity: TBD — IMPLEMENTATION VALIDATION, on real phones.

### 5.5 Keeping it mature, not childish

Ink and decoration: one ink colour for drawings, with no rainbow palettes, stickers, stars, glitter or confetti.
Annotation density: at most one hand-drawn annotation per element, with a working ceiling of about 3–4 annotations per screen. The exact density is TBD — IMPLEMENTATION VALIDATION.
Copy: calm, adult, matter-of-fact vykání. No baby talk, puns or exclamation marks.
Characters: they behave like a capable professional and her assistant. Their expressions convey attention and explanation, not cuteness.
Litmus test: a screenshot of the result screen should look at home in a police or bank public-awareness leaflet.

## 6. Character usage

### 6.1 Roles

Věrka: the user's guide. She speaks to the user, explains, and accompanies the user through results, verification and the „Už se to stalo?" path.
Robo: analysis and system activity: checking, processing, technical states, errors and capacity.
Věrka's appearance comes only from the six approved PNGs of the 2026-10 refresh; Robo's from VERIM_CHARACTER_REFERENCE.png. Neither may be altered. Responsive adaptation changes only scale, placement, spacing and composition.

### 6.2 Rules

At most one speaking character per screen region. Věrka talks; Robo works.
Characters react to the user's situation, never emotionally to the analysed message.
No celebrating, success or happy state appears because an analysis found nothing.
A positive character moment is allowed only after a completed safe user action (§12.4).
Characters never carry essential information alone. Every state is also expressed in text.
Decorative character images have empty alt. Meaningful context is given in adjacent text.

### 6.3 State map

| Context | Character | Expression |
| --- | --- | --- |
| Homepage welcome | Věrka and Robo (both required) | warm, calm / friendly, ready |
| Analysing | Robo | focused, working |
| Explaining signals | Věrka | explaining |
| Concern outcomes (§10) | Věrka | serious, steady; not frightened |
| Knowledge outcomes (§10) | Věrka | thoughtful, attentive |
| Completed safe action | Věrka (optionally Robo) | encouraging; the only "success" use |
| Technical error / capacity | Robo | apologetic, calm |
| „Už se to stalo?" path | Věrka | serious, supportive |

Each state must map to an existing approved character asset. If an expression above has no approved asset, use the closest approved one. New expressions need separate art approval and must stay consistent with the character reference.

## 7. Homepage

Goal: understand → submit the suspicious content → receive understandable help. Don't add marketing sections just to make the page longer.

### 7.1 Section order

Header: the logo „Věřím tomu?" and a persistent „Už se to stalo?" entry. On desktop, a „Jak to funguje" link also appears.
Hero = the tool, with Věrka and Robo.
„Už se to stalo?" band.
Typical situations: short entry points into verification guides.
How it works: three steps.
What we can / cannot do: the trust block.
Footer.

### 7.2 Hero content and microcopy

H1: „Přišla vám podezřelá zpráva?"
Sub: „Vložte ji sem. Pomůžu vám rozhodnout, co udělat dál."
Input: one large input area; see §8.
Secondary actions: [Vložit zkopírovanou zprávu], plus further input actions only when that capability is available (§8.2).
Primary CTA: [Prověřit zprávu]
Safety line: „Na odkazy ve zprávě neklikejte. Stačí je zkopírovat." with an expandable „Jak zprávu zkopírovat?"
Privacy line: generated from the deployed privacy configuration (§18.5). Never a hard-coded claim.

### 7.3 Character composition

Both Věrka and Robo stay visible on desktop, tablet and mobile. Neither may be removed to solve a responsive problem.
Mobile: the pair is scaled and placed so that, in the first viewport:
the input stays visible;
the primary CTA stays easy to reach;
the first viewport stays useful;
both characters remain recognisable as the brand.
Preferred mobile composition: both characters at full figure and original proportions, sitting on the top edge of the input card, so they add presence without taking a separate block of height.
Alternative to test: the pair beside the H1. The choice between the two is TBD — IMPLEMENTATION VALIDATION, on real phones.
Mobile speech: Věrka's bubble shrinks to one short line or merges into the subline.
Keyboard open on mobile: the characters may temporarily scale down or step aside so the input and CTA stay visible. They return when the keyboard closes.
Desktop: two columns, with the tool on the left (about 60%) and Věrka and Robo on the right at a larger scale with a speech bubble, above a short "Co umíme / co neumíme" card.
Exact sizes at every breakpoint: TBD — IMPLEMENTATION VALIDATION, on physical devices.

### 7.4 „Už se to stalo?" band

Copy: „Už jste klikli na odkaz, zaplatili nebo někomu sdělili kód? Jednejte hned." → [Co dělat hned teď]
Visual: calm and visible (navy card, amber icon), never alarm-red.

### 7.5 Typical situations

Six short entries:

„Mami, mám nové číslo"
„Píše vám banka"
„Balík nelze doručit"
„Nedoplatek / faktura"
„Investice s jistým výnosem"
„Nová známost chce peníze"
Each entry opens a verification guide. An optional secondary link loads an example into the tool. On mobile these are a vertical list, not a horizontal scroller.

### 7.6 How it works / trust block

Steps: „Vložíte zprávu → Ukážu, čeho si všímám → Pomůžu vám to ověřit jinou cestou." Then: „Rozhodnutí je vždy na vás."
„Co umíme / Co neumíme": both lists are generated from, or kept in sync with, actual capabilities (§18.1).
Examples: „Najít typické znaky podvodu" · „Vysvětlit je srozumitelně" · „Poradit bezpečný další krok".
Limits: „Zaručit, že zpráva je pravá" · „Spolehlivě poznat obsah vytvořený AI" (unless such a capability actually exists and is reported).

### 7.7 Footer

Anti-impersonation statement: „Věřím tomu? po vás nikdy nebude chtít platbu, heslo ani kód." Its exact wording must be verified against real operations before publication.
Also: operator, contact, privacy and „O projektu".

## 8. Input experience

### 8.1 One input, auto-detected

One input area. No mandatory type dropdown.
Planned input types: text, link (URL), screenshot/image, PDF. Audio and video are deferred.
The type is detected automatically. If detection fails, offer a simple correction („Je to odkaz / text?").

### 8.2 Capability-driven availability

Which inputs are offered depends on what the backend reports as available (§18.1). Nothing is hard-coded.
Unavailable formats are either hidden or shown clearly as not yet available („Snímky obrazovky a PDF připravujeme"). They must never appear usable when they're not.
Rejected formats: if a user pastes or drops one, show the unsupported-input state (§14) with a useful alternative.

### 8.3 Images and PDFs (when available)

Confirm the extracted text: after extraction, show „Z obrázku jsem přečetla tento text. Je to správně?" with an editable text box. The user confirms before analysis.
Privacy hint: „Zakryjte prosím čísla karet a hesla, pokud tam jsou." Don't promise automatic redaction unless it exists.

### 8.4 Mobile copy-paste support

This is the main obstacle for the target users.

Paste: a large [Vložit zkopírovanou zprávu] button that reads the clipboard where the browser allows it, and otherwise falls back to focusing the input.
„Jak zprávu zkopírovat?": short illustrated steps for Android and iPhone („Podržte prst na zprávě → Kopírovat → vraťte se sem → Vložit").
Copying a link safely: „Podržte prst na odkazu a zvolte Kopírovat odkaz. Neotvírejte ho."
Screenshots: when screenshots are supported, the screenshot path is first-class, with its own how-to.

### 8.5 Follow-up questions

Limits: at most 2–3, each answered by tapping, each with „Přeskočit". Ask them while the analysis runs where possible, so they add no waiting time.
Questions:
„Znáte odesílatele z dřívějška?" — Ano, známe se · Píše, že je blízký, ale z nového čísla · Neznám ho · Nevím
„Co po vás zpráva chce?" — Peníze nebo platbu · Kód, heslo nebo údaje z karty · Kliknout na odkaz nebo nainstalovat aplikaci · Zavolat na číslo · Nic konkrétního
„Udělali jste už něco z toho?" — Ne · Ano. „Ano" routes to the „Už se to stalo?" flow (§13).
How the answers combine with the analysis outcome is a backend/product contract; exact rules are TBD — IMPLEMENTATION VALIDATION.

### 8.6 Privacy of input

Analysed content must never appear in the URL, query string or browser history. That holds with JavaScript disabled or failing too.
Without JavaScript, the form must not submit content and must explain that JavaScript is required.

## 9. Analysis / loading experience

Robo represents the system working.
Show only real steps. The status lines reflect actual stages reported by, or known to be performed by, the backend (e.g. „Čtu text", „Hledám známé varovné znaky", „Připravuji doporučení"). They are not a fake percentage progress bar.
No fake technical theatre. No „Scanning neural network…", no „Deepfake probability calculation…", unless that operation genuinely runs.
Language: calm and non-certain. Nothing that implies a verdict before the result arrives.
Follow-up questions (§8.5) may appear alongside the loading state.
Long waits: after a reasonable wait, show a calm notice („Trvá to déle než obvykle…"). On timeout, move to the timeout state (§14). The exact time thresholds are TBD — IMPLEMENTATION VALIDATION.
Accessibility: the status changes are announced to screen readers through a polite live region, and the loading animation respects reduced motion.

## 10. Result model

### 10.1 No numeric score as the primary result

No score as the result. A 0–100 risk score is not the primary result. If a score exists internally, it may appear only under „Chci vědět víc", with an explanation, or not at all.
Banned label: „Nízké riziko" (and any equivalent) is not used.

### 10.2 Four outcomes in two families

| Family | Outcome | Meaning |
| --- | --- | --- |
| Concern: we found something | Velmi podezřelé | Strong warning signs found |
|  | Zbystřete | Some warning signs found |
| Knowledge: what we could tell | Nenašli jsme jasné varovné znaky | We examined the content and found nothing clear. This is not a statement of safety. |
|  | Nemáme dost informací k posouzení | We could not meaningfully assess it: link-only input, unreadable image, too little content, or an unavailable capability |

### 10.3 Visual separation of the families

No linear scale. The four outcomes are never shown on one scale, gauge, ordered bar or traffic light.
Concern family: an amber "attention" visual (for example a navy or cream card with an amber accent and a hand-drawn ✋ or ⚠ icon). Věrka serious or attentive.
Knowledge family: a neutral blue-grey "note" card with a different shape or treatment and an open ○ or ? icon. Věrka thoughtful.
Not the safer end of a scale: knowledge outcomes must never look like a calmer step on the same ladder as the concern outcomes.
Never success-styled: no outcome uses green, a checkmark, a success icon, or a happy or celebrating character.
Text first: each outcome is always communicated by icon + word + sentence, never by colour alone.

### 10.4 Result hierarchy (top to bottom)

Outcome headline and one action sentence. Example: „Zastavte se. Nic neposílejte a zavolejte na číslo, které už máte uložené."
Primary actions: [Jak to bezpečně ověřit] and, where relevant, [Už jsem něco udělal(a) → Už se to stalo?]
Short plain-language explanation: two or three sentences.
„Čeho jsem si všimla": the annotated message (§11) with numbered signal explanations.
„Co jsme ověřili a co ne": mandatory and dynamic (§10.5).
Uncertainty („Co nevíme"): always visible, never collapsed.
Recommended next action and independent verification steps (§12).
„Chci vědět víc": an optional disclosure with technical detail, how the result was produced (rules, or rules plus AI if that is ever enabled), and limitations.
Optional feedback: „Víte teď, co udělat dál?" — Ano / Částečně / Ne. Whether and how this is collected is TBD — IMPLEMENTATION VALIDATION, and must match privacy commitments.

### 10.5 „Co jsme ověřili a co ne"

Mandatory and dynamic. It is rendered only from the per-analysis list of checks the backend reports (§18.3).
Nothing hard-coded. No claim is permanently written into the layout: not „odkaz jsme neotevřeli", „ověřili jsme web", „ověřili jsme odesílatele" or „zjistili jsme, zda jde o AI".
Each check has a status: performed, not performed, unavailable, or failed. Each status has fixed, vetted Czech wording.
Unverified items are always listed. "Not verified" items that matter are always shown; if the sender's identity was not verified, that line appears.

### 10.6 Example copy per outcome

Velmi podezřelé (e.g. "Mami, nové číslo… pošli peníze… nevolej mi")

Velmi podezřelé
Zastavte se. Nic neposílejte a na nové číslo neodpovídejte. Zavolejte svému blízkému na číslo, které už máte uložené.

Zbystřete (e.g. an unexpected invoice)

Zbystřete
Než zaplatíte, ověřte si, že fakturu opravdu čekáte. Kontakt na firmu najděte sami, ne ve zprávě.

Nenašli jsme jasné varovné znaky

Nenašli jsme jasné varovné znaky
To ale neznamená, že je zpráva v pořádku. Pokud zpráva chce peníze, kód, údaje nebo kliknutí, ověřte ji jinou cestou.

Nemáme dost informací k posouzení (e.g. link only)

Nemáme dost informací k posouzení
Bezpečný krok: do banky nebo obchodu vstupte přes svou aplikaci nebo adresu, kterou napíšete sami. Na odkaz ze zprávy neklikejte.

The "what we checked" lines under each example come from §10.5, not from these templates.

Link inputs additionally:

Show the real address the link leads to, with the deceptive part visually de-emphasised (e.g. …secure-login.top).
The link is always plain text and never clickable.
Whether that address was checked against any external source is stated only through §10.5.
Mapping from backend signals to outcomes, including how weak signals are treated: TBD — IMPLEMENTATION VALIDATION. It is defined by the backend contract (§18.2). Weak signals must never produce a reassuring presentation.

## 11. Annotated-message interaction (signature)

### 11.1 Concept

After analysis, the user's own content is shown back exactly as provided, with the suspicious parts visibly marked. Věrka explains each mark in plain Czech. This should feel like Věrka helping the user understand the message, not like a scanner showing detection metadata.

### 11.2 Behaviour

Text stays exact. The user's text is never altered: no case changes, no rewording, no normalisation shown to the user, no silent truncation. Long content collapses around the highlighted passages, with „Zobrazit celou zprávu".
What highlights look like: a soft marker-style highlight with an underline as well, so meaning isn't carried by colour alone, plus a small circled number. Explanations below use the same numbers and the normal readable font.
Linking: tapping or clicking a highlight moves focus to its explanation and emphasises it, and the reverse works too.
Arrows: hand-drawn arrows and margin notes are a desktop enhancement only. On mobile, circled numbers replace arrows, because arrows break when text reflows.
Images and PDFs: annotation applies to the user-confirmed extracted text (§8.3), not drawn over the image. Image-region annotation is TBD — IMPLEMENTATION VALIDATION and a future contract.
No marks: if there's nothing to annotate, the card says „V textu jsem nenašla nic, co bych vám mohla ukázat." There is no decorative highlighting.

### 11.3 Backed by evidence, never decorative

Highlights come only from structured backend evidence: exact spans plus vetted explanation keys (§18.2). The frontend must not invent highlights by its own pattern matching.
Explanations come from a vetted, human-reviewed catalogue. Free-form model text is never shown as an explanation.
If a span doesn't match the original content exactly, the frontend drops that highlight and still shows the signal in the list.

### 11.4 Rendering safety

User content is rendered as text nodes only, never as HTML.
Highlights are built by splitting the original text at the given offsets.
Links, phone numbers and email addresses inside the content are never made clickable.

### 11.5 Accessibility

Highlights use semantic marking, for example `<mark>` with an accessible description.
Circled numbers are real text.
Screen readers get the message followed by the numbered list of explanations, in the same order.
The full interaction works by keyboard.

## 12. Independent verification

### 12.1 Core rule

Verification instructions must never direct the user to:

the phone number in the suspicious content;
its link or web address;
its email address;
any contact information contained in it.
Recommend only:

a contact the user already knows (saved before the message arrived);
the official app (bank, carrier, shop);
an official website typed in manually;
previously verified contact details, for example the number on the back of a bank card or on an earlier contract.

### 12.2 Guided verification („Ověřme to spolu")

One tap from the result starts a short, situation-specific, step-by-step guide.
Example for „Mami, nové číslo":
„Najděte v telefonu kontakt, který máte uložený dřív. Nepoužívejte číslo ze zprávy."
A suggested script for the call: „Přišla mi zpráva z nového čísla, že potřebuješ peníze. Psal(a) jsi mi?"
„Nedovolali jste se? Zkuste jiného člena rodiny. Peníze do té doby neposílejte."
The guide ends with the user reporting what happened: [Ověřil(a) jsem to – byl to podvod] [Byl(a) to opravdu on/ona] [Ještě nevím].
The content of every situation guide must be reviewed before publication. TBD — IMPLEMENTATION VALIDATION.

### 12.3 Positive moment only for safe action

Only a completed safe user action earns a positive acknowledgement from Věrka (optionally with Robo), with copy such as „Udělali jste důležitý krok." Examples of such actions:

contacting the person through a known number;
checking in the bank's official app;
independently verifying the request.
This is acknowledgement, not gamification: no points, badges, streaks or confetti.

### 12.4 Offline availability

The static verification guides and the basic safety rules should stay available offline or when the analysis is unavailable. The mechanism is TBD — IMPLEMENTATION VALIDATION.

## 13. „Už se to stalo?" flow

### 13.1 Discoverability without fear

It's reachable from:

a persistent header entry on every page;
the homepage band (§7.4);
follow-up question 3 (§8.5);
the action area on concern outcomes.
It's styled calmly and visibly, never as an alarm.

### 13.2 Entry

Co se stalo? (multiple selection, large tap targets)
Klikli jste na odkaz · Zadali jste údaje nebo heslo · Poslali jste peníze · Sdělili jste kód z SMS · Nainstalovali jste aplikaci · Někdo se připojil k vašemu telefonu nebo počítači · Něco jiného

### 13.3 Response

A short checklist, urgent steps first, tailored to what was selected.
Trusted channels only: steps direct the user to the bank through its official app or the number on the card, to official authorities, and to people they trust. Never to contacts from the suspicious content.
Tone: calm and non-judgemental, e.g. „Stává se to i opatrným lidem. Důležité je jednat hned."
Ticking steps off: each step can be ticked off, and that is where Věrka's positive acknowledgement belongs (§12.3).
Keeping the list: the checklist should be printable or saveable, and available offline where feasible.

### 13.4 Verification before publication

All damage-control instructions, contacts and phone numbers must be independently verified before publication. The implementation must not invent emergency instructions.

Content status: TBD — IMPLEMENTATION VALIDATION. Use clearly marked placeholders until verified content is approved.

## 14. Error / capacity states

Every failure state has the same structure: what happened → what to do now → a safety box.

Mezitím platí: Nic neplaťte. Nikomu neříkejte kódy ani hesla. Ověřte si to přes kontakt, který už znáte. [Jak to ověřit]

Never imply the content is safe because the analysis failed.

| State | Copy direction | Next action |
| --- | --- | --- |
| Malformed input | „Tohle se mi nepodařilo přečíst. Zkuste zprávu vložit znovu." | Edit in place; the user's input is kept |
| Too long | „Zpráva je moc dlouhá. Vložte prosím jen tu část, která po vás něco chce." | Edit in place |
| Unsupported input | „Tento typ souboru zatím neumím přečíst." plus the currently supported alternatives (capability-driven) | Switch input type |
| Unreadable image (when supported) | „Na obrázku jsem nepřečetla text. Zkuste ostřejší snímek, nebo text opište." | Retry or paste text |
| Timeout | „Kontrola trvala příliš dlouho. Zkuste to prosím znovu." | [Zkusit znovu] + safety box |
| Temporary error | „Ověření teď nefunguje. Není to vaše chyba." | [Zkusit znovu] + safety box + guides |
| Rate limit | „Právě jste poslali hodně zpráv. Zkuste to prosím za chvíli." | Retry when allowed; no countdown pressure |
| Capacity / budget limit | „Právě pomáháme mnoha lidem. Zkuste to prosím později." | Safety box + guides |
| Capability unavailable | „Tento druh kontroly teď není dostupný." | Alternative input or guides |
| Offline | „Vypadá to, že nejste připojeni k internetu." | Offline guides and safety box |

Robo, apologetic and calm, may accompany technical states. Věrka accompanies input/validation guidance.
Error messages are plain text, announced to assistive technology, and never auto-dismissed.

## 15. Responsive behaviour

| Context | Rules |
| --- | --- |
| Desktop | Two-column hero (tool about 60%, Věrka and Robo plus the trust card); results in a main column with the action card visible near the top; desktop-only annotation arrows allowed |
| Tablet | Single or two-column depending on width; both characters present; tool first in reading order |
| Mobile | Single column; input and primary CTA in the first viewport (target 360×640 with the keyboard closed); both characters present at reduced scale (§7.3); full-width primary action about 56 px tall |
| Narrow mobile (~320 px) | No horizontal scrolling; characters scale further but remain present and recognisable; annotations use circled numbers only |
| 200% zoom | All content and actions reachable; nothing overlaps or is clipped; annotations reflow correctly |

General rules:

No essential interaction depends on hover, swipe, a timed carousel or animation.
No hamburger-hidden essentials. The „Už se to stalo?" entry is always visible.
If the user leaves to make a verification call, the result stays available on return, without the content ever being put into the URL. The mechanism is TBD — IMPLEMENTATION VALIDATION.
The 360×640 first-viewport fit is a strong target, not a reason to compromise accessibility or character quality.

## 16. Accessibility

Accessibility is the default product. There is no separate mode.

| Requirement | Target |
| --- | --- |
| Body text | ≥ 18 px |
| Result headline/body | about 20 px where appropriate |
| Line height | ≥ 1.5 |
| Line length | about 60–65 characters |
| Interactive targets | ≥ 48 × 48 px, with adequate spacing |
| Primary mobile action | about 56 px tall, full width |
| Essential text contrast | about 7:1 target (verify every token, including purple and blue) |
| Zoom | fully usable at 200% |
| Width | fully usable at about 320 px |
| Keyboard | every function reachable and operable, with a visible focus indicator |
| Screen readers | result heading receives focus and is announced; loading and status use live regions; annotated message has an equivalent ordered list |
| Motion | prefers-reduced-motion respected; no essential information in animation |
| Colour | state never communicated by colour alone (icon + word + text) |
| Time | no time limits, no auto-dismissing messages, no auto-advancing content |
| Controls | all actions are visible, labelled buttons; no icon-only, hover-only, swipe or long-press-only actions |

Further rules:

„Vysvětlit jednoduše": plain language is the default. Technical detail sits behind „Chci vědět víc". Inside technical sections, a visible „Vysvětlit jednoduše" button collapses back to the plain version.
Read aloud (optional enhancement): offered only where a Czech voice is available, and never the only way to get content.

## 17. Performance

| Target | Value |
| --- | --- |
| First viewport weight | about < 300 KB where practical |
| LCP | < 2.5 s on a throttled mid-range mobile connection |

Rules:

Performance work must not compromise accessibility, character quality, readability or clarity. These targets are strong goals, not trade-off mandates.
The existing optimised WebP character assets are the baseline. Introduce AVIF only if measurement shows a meaningful benefit.
Annotations and decorative marks are inline SVG or CSS, not image files.
At most two font weights, subset to the needed Latin and Czech characters.
The paper texture must not noticeably affect weight or rendering.

## 18. Frontend / backend contracts

These are conceptual contracts, not schemas. Exact field names, formats and versioning are TBD — IMPLEMENTATION VALIDATION and must be agreed and tested on both sides.

### 18.1 Capabilities

The backend reports which input types and checks are currently available: for example text, link, image, PDF, and any external verification.
The frontend shows input options, „Co umíme / Co neumíme" and the loading steps only from this report.

### 18.2 Analysis result

Outcome: one of four values in two families:
concern: very suspicious, heightened caution;
knowledge: no clear warning signs, insufficient information.
Signals: each has a stable identifier and a vetted explanation key that maps to human-reviewed Czech copy. Free-form text is never shown as an explanation.
Annotation spans: for each signal, exact positions in the original, unmodified content as received by the backend:
each span references a signal;
spans are sorted and non-overlapping, or the overlap rule is defined;
the offset unit (UTF-16 code units vs. code points) must be fixed explicitly. TBD — IMPLEMENTATION VALIDATION;
the frontend checks every span against the original text and drops any that don't match exactly.
Recommended action and verification steps: from vetted templates only, never containing contacts from the analysed content.

### 18.3 Checks performed

A list of checks with a status each: performed, not performed, unavailable, failed.
Each status maps to fixed, vetted Czech wording.
The "what we checked" section is rendered only from this list.

### 18.4 Errors

Stable error codes covering: malformed input, too long, unsupported, unreadable, timeout, temporary error, rate limit, capacity/budget, capability unavailable.
The frontend maps each code to the states in §14. A failure never maps to a reassuring outcome.

### 18.5 Privacy statement

What is stored, logged, sent to third parties, and for how long, comes from the actual deployed configuration.
The frontend must not hard-code claims such as „Zprávu neukládáme" unless they are verified true for the deployment.

### 18.6 Damage-control and verification content

Published only from an independently verified content set (§12.2, §13.4).

## 19. Prohibited patterns

A 0–100 score, gauge, traffic light or linear scale as the primary result.
The labels „Nízké riziko", „Bezpečné", „Vše v pořádku" or any equivalent reassurance.
Green, checkmarks, success icons or happy or celebrating characters attached to an analysis outcome.
Removing Věrka or Robo from the homepage at any breakpoint, or altering their appearance.
Handwritten or script fonts for any readable text, label, input or button.
Clickable links, phone numbers or email addresses taken from the analysed content.
Any verification advice using contacts from the analysed content.
Hard-coded "what we checked" claims or privacy claims.
Fake technical theatre in loading states.
Fear UX: countdowns, flashing, alarm red, exclamation-mark copy, threatening language.
Gamification: points, badges, streaks, confetti.
Essential interactions that depend on hover, swipe, carousels, animation or timeouts.
Rendering user content as HTML; frontend-invented highlights.
Analysed content in the URL or query string, or a non-JS form that submits content.
Advertising input types or checks that aren't currently available.
Unverified emergency or damage-control instructions.
Marketing filler sections that push the tool down the page.
A separate "senior mode".
Tykání.

## 20. Implementation acceptance criteria

The redesign is accepted when every item below is demonstrated.

Homepage and input

Both Věrka and Robo are visible on the homepage on desktop, tablet, mobile and ~320 px, matching the character reference exactly.
On a 360×640 viewport, keyboard closed, the input and primary CTA are visible without scrolling, without compromising accessibility.
Input options and capability statements reflect the backend capability report. An unavailable format is never presented as usable.
The „Už se to stalo?" entry is reachable from every page and from concern results.
Results

The four outcomes render in two visually distinct families. None uses green, a checkmark, a numeric primary score or a celebrating character.
The first sentence of every result is a safe next action.
„Co jsme ověřili a co ne" is rendered only from the backend checks list. Removing a check from the response removes its line, and no static claims remain.
Annotated message:
spans come only from backend evidence;
mismatched spans are dropped;
the original text is shown unaltered as text nodes;
an equivalent ordered list exists for screen readers;
the interaction works by keyboard.
No link, phone number or email from the analysed content is clickable or recommended for verification.
Verification and damage control

Positive character acknowledgement appears only after a completed safe user action.
All damage-control and verification content comes from the verified content set. Unverified content is absent or clearly marked as a placeholder in non-production builds.
Errors

Every error, capacity and timeout state shows the safety box and a next action, and none implies safety.
Accessibility

The baseline in §16 is met. At minimum:
200% zoom;
320 px width;
keyboard only;
screen readers (TalkBack and VoiceOver);
reduced motion;
contrast measured.
Privacy

With JavaScript disabled or failing, no analysed content reaches the URL, history, referrer or server.
Privacy wording matches the deployed configuration.
Performance

First-view weight and LCP are measured against §17 on a throttled mid-range Android. Any shortfall is documented, not resolved at the expense of accessibility or character quality.
Comprehension testing with real users (including people aged 60+)

Participants do not describe the knowledge outcomes as "safe".
Adults don't describe the interface as "for kids".
Users can copy an SMS into the tool without help and without tapping its link.
Items marked TBD — IMPLEMENTATION VALIDATION:

Exact amber concern colour and the neutral knowledge-family token, pending contrast measurement (§5.3).
Paper-texture intensity (§5.4) and annotation density limits (§5.5), to be decided on real phones.
Exact Věrka and Robo sizes per breakpoint, and the mobile composition choice: on the input card's edge vs. beside the H1 (§7.3).
How follow-up answers combine with the analysis outcome (§8.5).
Loading-state time thresholds (§9).
Mapping from backend signals to the four outcomes, including weak signals (§10.6).
Whether and how the "Víte teď, co udělat dál?" feedback is collected (§10.4).
Image-region annotation for screenshots and PDFs (§11.2).
Review of the content of each situation-specific verification guide (§12.2).
Offline mechanism for guides and the safety box (§12.4).
Verified damage-control content and contacts (§13.4).
Keeping the result available after app switching without using the URL (§15).
Exact contract field names, formats, versioning and the span offset unit (§18).
