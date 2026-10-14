# Web Checker 2.0 release (RETIRED)

**Do not use.** `package.py` and `deploy.py` built a partial overlay on the fafccd9 image and exit immediately. They cannot produce a complete runtime (no contract modules, contract page or PDF.js). Every release now uses `deploy/release/verimtomu-release.sh`: a `git archive` of the full approved SHA, the root `Dockerfile` for `verimtomu-web` and `deploy/release/ai-proxy.Dockerfile` for `verimtomu-ai-proxy`.

Baseline is the actual fafccd9 production image sha256:b2f3a1c579e9df989e0349ae6ac10a35e79b7da23729c7976d97db460b36c084. production-baseline.json records all runtime source/public files. Only Web Checker UI, new source adapters/data and explicit routes change. SEO, original CSP exceptions, AI and usage code are preserved.

See ../eshop/SOURCES.md for source permissions, data freshness and the production ARES egress limitation. Build context is packaged explicitly by package.py; no environment, keys or runtime databases enter it. deploy.py retains the previous container/image, verifies source hashes and preserves network/IP, mounts, environment, resources, logging and isolation. Other container IDs must remain unchanged. Failed deployment rolls back automatically.

After a future approved deployment, rollback on VPS: `sudo python3 /opt/verimtomu/web-checker2-release/rollback.py`.

This release is prepared only; it has not replaced production or installed the COI timer.
