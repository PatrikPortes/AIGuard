# Gate 1.1 — přenosná raw evidence

Datum sběru: 2026-10-08. Bez nasazení, tokenu, DNS změny nebo live AI. Metadata/images neobsahují user content. [manifest.json](manifest.json) uvádí byte count a SHA-256 všech raw evidence souborů; manifest se nehashuje sám. Reviewer musí porovnat i vlastní image/release SHA, nikoli spoléhat pouze na soubor dodaný autorem.

## Skeny

- [trivy-app.json](trivy-app.json): byte-exact původní Gate1 report, SHA-256 `94561846a38dcb4b1f47a565e864ca37140362c24dc22c9c09a5a8e5c75ef4c9`; app image `sha256:32e4dbc56ceb626b4e87e1c39892e7d292bee3aaf702233659619a973051bdc2`.
- [trivy-connector.json](trivy-connector.json): byte-exact původní Gate1 report, SHA-256 `ca820133b4f0a4bd3425c970eb07ac0c1a99faf2f5de562f4dfe62dbcbb0f723`; connector image `sha256:3d0a7b710bbced831dc303af25dbb831129834d13f4bdc0d304682dd75f566c9`.
- [trivy-app-rescan.json](trivy-app-rescan.json) a [trivy-connector-rescan.json](trivy-connector-rescan.json): opakované skeny stejných exportovaných images, Trivy0.75.0, `--skip-db-update`, all severities/no ignore. DB v2 UpdatedAt **2026-10-07T07:38:55.515026687Z**, DownloadedAt 2026-10-08T05:16:37.376558156Z. Shodných 31+3 package findings; žádné HIGH/CRITICAL. Feed nebyl v tomto kroku aktualizován.
- [findings.json](findings.json) obsahuje všech 34 ručně kontextualizovaných řádků. Severity/version/fixed_version jsou z reportů, recommendation je návrh autora k review. Detail viz [VULNERABILITY_EVIDENCE.md](../../VULNERABILITY_EVIDENCE.md).

## Veřejné advisory snapshots

[source-fetches.json](source-fetches.json) obsahuje URL/status/SHA-256 27 CNA CVE records z oficiálního CVEProject/cvelistV5 mirroru a GO OSV + cloudflared tag go.mod. Přímý Debian security tracker a vuln.go.dev byly při pokusu transportně nedostupné. 14 glibc advisory paths odvozených z scanner references v bminor mirroru vrátilo 404; **nevyvozujeme z toho opravu, absenci CVE ani bezpečnost**. Relevantní CNA records jsou přiloženy. Žádné TLS verification bypass.

CNA affected/fixed upstream verze nelze automaticky zaměnit za Debian package verzi/backport. [GO-2026-5932.json](GO-2026-5932.json) má nulové datum published/modified (`0001-01-01`); jeho datace/kvalita vyžaduje potvrzení. Github branch snapshots nejsou podepsaný vendor waiver a jejich budoucí obsah může být jiný.

## Runtime / ELF pozorování

Image files byly zjištěny `docker create` + `docker export`/`docker cp` z vlastních dočasných **nespuštěných** inspection containers; po exportu byly odstraněny. Žádný host/root mount, tunnel ani server mutace. App CLI probe pouze `node` metadata a `/proc/self/maps`, `--network none`, bez AI/env secrets.

- [runtime-files.json](runtime-files.json): sha vybraných ELF files, image export neměl SUID/SGID files. `nscd`, `ldd`, `gcc`, `g++` executable se v exportu nenachází. Directory `usr/share/gcc` není compiler executable. Exportované binárky/tary nejsou součástí repository.
- [node-runtime.json](node-runtime.json): skutečný runtime x64, Node24.21.0, bundled zlib1.3.2.1-motley-8002e91, ICU78.3, OpenSSL3.5.8; startup loaded paths. libstdc++/libgcc/libc načteny; libgomp/libz nikoli v tomto startup probe.
- [node-linkage.json](node-linkage.json): `readelf -d node` a `readelf --dyn-syms --wide node`, NEEDED a vybrané přímé undefined symboly. Žádný libz/libgomp NEEDED. Přítomny fopen64/getaddrinfo/pthread_create; přímý fopen chybí, ale fopen-family tím není vyloučena. Chybějící přímý symbol nezaručuje nepřítomnost indirect/internal/inlined/dlsym cesty.
- [connector-symbol-counts.json](connector-symbol-counts.json): GNU `nm --defined-only cloudflared` nad ne-stripovaným statickým ELF, hledání case-sensitive celých Go package prefixů. x/crypto/ssh:198; openpgp:0. Nebyl použit nefunkční systémový program pojmenovaný `go` jako Go toolchain. Binárka SHA-256 `6fb373461c6de859684477920d9c599c309751f162e08592857f310a68906c8e` shodná s vendor kopií dle Gate1. Symbol evidence je podpůrná, nikoli úplná call graph/provenance analýza.
- [image-source-comparison.json](image-source-comparison.json): 36/36 regular `/app` files skutečného audit image má byte-exact SHA shodu s nynějším worktree. [review-source-manifest.json](review-source-manifest.json) identifikuje 64 source/config/test/asset files předávaných reviewerovi, nikoli schválený Git release.
- Test/verifier logs a [integrity-check.json](integrity-check.json) slouží k dohledání provedených scénářů; jejich praktické limity jsou v [GATE_1_1_VALIDATION.md](../../GATE_1_1_VALIDATION.md).

Reprodukce z vlastních důvěryhodných image exports (jen izolované review prostředí):

```sh
readelf -d node
readelf --dyn-syms --wide node
nm --defined-only cloudflared
sha256sum node cloudflared
```

Výpisy nativních symbolů nejsou exploit testy. Bez nezávislého rozhodnutí se žádná položka nesmí ignorovat v Trivy ani označit ACCEPT.
