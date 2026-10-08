# Remediation 1 — portable local evidence

Collected2026-10-08 by the implementing author. **Not independent sign-off; Gate BLOCKED.** All user markers/session credentials are synthetic. No real provider calls, production access, deployment, DNS/Cloudflare changes, commit or push. No binary image archives or machine-local credentials belong in this evidence directory.

## Evidence map

- `import.json`: exact hashes/sizes of the two byte-preserved Claude files from review commit `1e26f6c957e752eef86aa3227839efa64121dfaa`, parent `fde14ba57d62ba9e6aab0181170386a1d38da7a1`.
- `baseline-tests.txt`, `baseline-claude.txt`: actual baseline results, including failed TODO assertions that Node itself tolerated.
- `no-js-before.json`: actual Chromium private-query baseline. `deploy-before.json`: isolated original-release-helper cached-tag mock. `ai-before.json`: fake-provider steering reproduction and functioning global cost reserve.
- `tests.txt`, `syntax.txt`, `browser.txt`, `config-check.txt`: final candidate results. Raw Claude TODO labels are preserved; strict wrapper checks actual assertion outcomes and immutable test hash.
- `docker-build.txt`, `container-local-smoke.txt`, `container-runtime.json`: network-none audit build/runtime,87 original+new tests,16 unchanged Claude assertions, direct production AI guard rejection.
- `image-source-comparison.json`: all37 runtime app files equal candidate bytes; no original PNGs/docs/tests/env/Git;14 delivery WebP; native files unchanged against the pinned baseline.
- `asset-optimization.json`: sizes/source hashes/delivery hashes/dimensions/alpha/fidelity; original masters untouched.
- `network-probe.json`: isolated owned host fixture remains reachable from an internal bridge. Missing default route is only mitigation; host+bridge IPv4/IPv6 enforcement remains a VPS gate.
- `trivy-app.json`, `trivy-connector.json`, `trivy-db-metadata.json`: exact local images, fresh DB retrieval, unchanged34 package rows. `findings.json` retains raw identifiers/version/severity/evidence and adds author proposals; no risk acceptance or suppression.
- `native-linkage.json`, `native-files.json`: defined/undefined symbols across284 ELF files and filesystem observations. Absent dynamic imports alone cannot exclude inlining/dlsym; A28 and A31 stay OPEN.
- `connector-reachability.json`: exact binary identity, selected embedded module versions and affected symbol counts.198 means matching defined-symbol lines, not substring count; SSH channel/mux/connection entrypoints, OpenPGP and compress/s2 absent.
- `GO-2026-6354.json`, `GO-2026-6355.json`, `GO-2026-5932.json`, `GO-2026-5841.json`: freshly fetched official Go OSV records, including the Trivy gap. Placeholder zero timestamps in GO5932 are recorded rather than silently corrected.
- `node-security-index.json`, `node-release-index.json`, `node-core-check.json`: official Node core advisory/release snapshots and semver7.7.3 evaluation for actual runtime24.21.0;39 relevant advisories, zero known unpatched, zero parse errors. Not a zero-day assurance.
- `fetches.json`: source URLs, HTTP results and response hashes. Older CNA records/severity evidence remain frozen in `../gate-1.1/`.
- `npm-audit-final.json`, `gitleaks.json`, `secret-scan.json`: dependency/secret check evidence and limitations. `image-metadata.json` and `gitleaks-image-metadata.json` additionally cover extracted metadata for all30 images; Gitleaks does not decode compressed raster pixels, and the16 original PNGs remain byte-exact.
- `changed-files.txt`, `git-status.txt`, `diff-stat.txt`: local unstaged/untracked scope, never a staged release approval.
- `candidate-manifest.json`, `candidate-files.txt`: SHA-256/size/Git executable mode for every versionable candidate file. **Only these two self-reference files are excluded from hashed entries.** The file list itself contains all candidate paths, including both files. The manifest is not signed and does not claim an approved Git tree.

## Verify source evidence

From repository root:

```python
import hashlib, json, pathlib
manifest = json.loads(pathlib.Path('docs/security/evidence/remediation-1/candidate-manifest.json').read_text())
for row in manifest['files']:
    p = pathlib.Path(row['path'])
    assert p.is_file() and not p.is_symlink()
    assert p.stat().st_size == row['bytes']
    assert hashlib.sha256(p.read_bytes()).hexdigest() == row['sha256']
```

Repeat `git ls-files --cached --others --exclude-standard` to check the candidate path set and investigate additions/deletions. The current index still contains the original approved tree, while source fixes are unstaged. Review/tests match the candidate through the file manifest and runtime comparison, not through HEAD's old tree.

For exact linkage reproduction export the pinned images locally, extract the connector executable, check its SHA, run `nm --defined-only`, compare the named functions from the saved Go OSV JSON, and inspect ELF `readelf --dyn-syms --wide` imports/NEEDED across the runtime. Do not count generic module text or all SSH symbols as proof of vulnerable channel reachability. Header-only PBDS and zlib/fork/backport provenance still need independent investigation.

Full commands, test counts, failed intermediate attempts and infrastructure limitations: [validation](../../REMEDIATION_1_VALIDATION.md). All34 row-specific impact/fix/reachability proposals: [CVE report](../../VULNERABILITY_REMEDIATION_1.md). Current test source is in `tests/`; the independent suite must remain byte-exact. A future feature/image change invalidates scoped reachability claims and requires a new manifest, image scan and review.
