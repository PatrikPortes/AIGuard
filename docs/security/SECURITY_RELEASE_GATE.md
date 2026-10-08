# Security Gate — Remediation 1

2026-10-08: **BLOCKED. Žádné oprávnění k deploymentu.** Lokální opravy ani PASS testů nejsou externí schválení. P0/P1 nesmí být otevřené při veřejné betě. Žádné Accepted Risk nebylo schváleno.

## Aktuální stav

| Oblast | Stav | Důkaz / další podmínka |
|---|---|---|
| Původní Git review release R00 | DODÁN | `fde14ba57d62ba9e6aab0181170386a1d38da7a1`, tree `af22f138466dc28af62a0a1a2c9716ffb636ef8b`, dříve schválená a pushnutá větev `security/gate-1-review`. Repo již není prázdné/unborn. |
| Claude independent AI review | DODÁN pro původní commit | Dva byte-exact soubory z `1e26f6c957e752eef86aa3227839efa64121dfaa`; nepřepisovány. Jde o jiného AI reviewera, nikoli požadovaný nezávislý lidský sign-off. |
| Remediation implementace | FIXED / MITIGATED IN CODE | CR01–08 a CR10 opraveny; CR09 interní bridge/no ports pouze kompenzace. CR11 bezpečný summary a production startup guard; další AI gate zavřený. [Report](REMEDIATION_1_REPORT.md) |
| CR03 stability follow-up | FIXED IN CODE / EXTERNAL RETEST ČEKÁ | [CR03 report](CR03_STABILITY_REMEDIATION.md): 30/30 finálních běhů <20ms, 90/90 testů + strict Claude16/16; historická selhání zachována. Původní image/source binding je po změně analysis.js zastaralý; nový build/runtime/hash check čeká. |
| Lokální testy | HOTOVÉ pro doložené scénáře | [Validation](REMEDIATION_1_VALIDATION.md); původních 65 testů zachováno, přidány regressions a přísná kontrola nezměněných Claude assertions. Infrastructure checks nejsou lokálním PASS nahrazeny. |
| CVE evidence | EXTERNÍ DISPOZICE ČEKÁ | 34 raw nálezů stále přítomných; autor navrhuje 24 NOT AFFECTED / 8 MITIGATED / 2 OPEN. Nejde o patche ani Accepted Risk. [Current CVE evidence](VULNERABILITY_REMEDIATION_1.md) |
| Nový nezávislý retest | ČEKÁ | [Review package](INDEPENDENT_REVIEW_PACKAGE.md); current candidate hashes, CR regressions, native/source/provenance otázky. |
| Staging | ČEKÁ | Žádný staging, end-to-end spoof/load/TLS/firewall, rollout/rollback/restore drill. |
| VPS / Cloudflare | REQUIRES VPS / CLOUDFLARE VALIDATION | Síť, resolver, patching, token, HTTP-only route, cache/WAF, klientská IP, parser a provozní logy nebyly ověřeny na skutečné infrastruktuře. |
| Privacy | ČEKÁ | Provozovatel/kontakt/DPA/region/retence a public-beta wording musí být skutečné. Syntetický app logging test není kontrola logů CF/VPS. |
| Git remediation release | ČEKÁ NA SCHVÁLENÍ | Branch `security/gate-1-remediation`, HEAD stále původní `fde14ba…`; změny necommitnuté/nepushnuté. Nezávislý retest přes clone vyžaduje samostatně schválený nový release commit. |

## P0

- **R00-R — remediated approved release: OPEN.** Původní P0 „prázdný Git“ R00 byl odstraněn před touto etapou. Nové opravy nejsou Git release ani sign-off; vyžadují review konkrétního scope/hashes, zvláštní schválení commit/push a následné přesné source/image identity. Audit image s revision `unreleased` není deployment kandidát.
- **R01 — high/critical scanner findings: FIXED LOCALLY pro dřívější runtime změnu.** Fresh-retrieved DB stále hlásí 0 HIGH/CRITICAL, ale CNA HIGH nativních nálezů se neskrývá. Scanner-only nulový count neuzavírá R13.
- **R02 — rules/cost/ingress guard: FIXED IN CODE.** Production guard se spouští také z `createRuntime`, vynucuje rules, nulové budgety/retries/critic a žádné známé AI secrets. Neexistuje dnešní prokázaný cost-cap bypass; reálný CF trust je R04.

Nový potvrzený remote exploit, secret leak nebo root exposure okamžitě znovu otevírá P0. Není zde tvrzení, že původní package severity znamená potvrzený remote exploit.

## P1 — před veřejnou betou

| ID | Stav / povinnost | Ověření uzavření |
|---|---|---|
| R03 / CR09 | REQUIRES VPS VALIDATION | Internal app network bez host ports; vyzkoušet app-origin deny-new egress v host i bridge firewallu, IPv4/IPv6, metadata, host gateway, connector/same bridge a jiné sítě; žádné credentials probes. Samotné `internal:true` není kompletní firewall. Patching, SSH/MFA/recovery/source-CIDR a external port scan. |
| R04 / CR01/02/07 | REQUIRES CLOUDFLARE VALIDATION | Exact peer/header overwrite/Workers/PseudoIPv4/H2/H3; true source IP a /64 fairness; slow-body/CL-TE/duplicates end-to-end; **cache pouze explicitní hash-WebP paths**, HTML/API no-store; asset/API/session WAF a cold-cache burst/egress load; HTTPS/HSTS/redirect. |
| R05 | PRIVACY OPEN | Skutečné právní a kontaktní údaje; edge/VPS log retence a marker test; žádný obsah, cookies, query nebo secrets v logs. |
| R06 | REVIEW/STAGING OPEN | Nezávislý retest oprav a lidský sign-off, skutečný restricted staging s syntetikou, 0.5 CPU performance/admission, health alerts, failed start/rollback/restore drill. Unhealthy stav sám o sobě nerestartuje Docker službu. |
| R07 / CR01–08 | FIXED IN CODE, RELEASE VALIDATION OPEN | Lokální attacks již nesplňují původní exploit assertions. Distribuované prefixy, NAT, restart reset a edge capacity zůstávají explicitní residual rizika. |
| R08 / CR10 | FIXED IN CODE, REQUIRES VPS VALIDATION | Každý clean approved Git archive vždy build; captured immutable image ID, inspect/label verification a release manifest; žádný cached-tag shortcut. Mock tests nejsou real rollout/rollback/recovery proof. |
| R13 | EXTERNAL CVE DISPOSITION OPEN | Native proof pro A28 PBDS/inlining a A31 Debian/backport/fork; posouzení všech 34 řádků, CNA/Trivy rozdílů i kompenzací; exact future release scan a dependency/advisory review. C01/C02 nelze nyní tvrdit jako dosažitelný SSH channel jen z 198 symbolů. |

## P2 / residual a zavřené feature gates

- **R09:** týdenní fresh image/OS/Node-core/Go advisory kontrola; Trivy nepokrývá všechny Node core chyby a GO-2026-5841 module match sám neprokazuje reachability. Nový image, addon, upload, fetch nebo architektura ruší scoped NOT AFFECTED závěry.
- **R10 / RESIDUAL RISK:** single VPS/process; kvóty v RAM resetují restartem; /64/NAT mohou sdílet limit; LRU churn může obnovit lokální kvótu; distribuované admitted clients mohou vyčerpat globální burst. Edge/admission/load/monitoring musí doplnit procesové limity. Bez risk acceptance.
- **R11 / AI RELEASE GATE:** nulové provider calls v produkci, žádné AI secrets či budget DB. Před AI persistentní per-user/client cost budget, fair use, atomic global+identity reservation, hard cap/concurrency/retries/idempotency, busy-store mimo HTTP loop, output schema/evidence/semantic steering tests, untrusted-content isolation a schválené provider ceny/privacy. Fix summary neřeší všechny model-generated signal/uncertainty texty. Upload/fetch gates stále zavřené.
- **R12:** host/edge monitoring, token rotation, provenance/SBOM, reviewed config rollback a restore jsou provozní závazky; Docker socket nesmí dostat app/autoheal/agent.

Před veřejným nasazením člověk schválí exact Git SHA/tree/app+connector/base IDs, externí review/dispozice, staging/VPS/CF důkazy, privacy a rollback/restore. **Do té doby BLOCKED. Tato etapa nic necommitovala, nepushovala ani nenasadila.**
