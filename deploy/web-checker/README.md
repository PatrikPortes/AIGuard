# Web Checker 2.0 release
Baseline is the actual fafccd9 production image sha256:b2f3a1c579e9df989e0349ae6ac10a35e79b7da23729c7976d97db460b36c084. production-baseline.json records all runtime source/public files. Only Web Checker UI, new source adapters/data and explicit routes change. SEO, original CSP exceptions, AI and usage code are preserved.

See ../eshop/SOURCES.md for source permissions, data freshness and the production ARES egress limitation. Build context is packaged explicitly by package.py; no environment, keys or runtime databases enter it. deploy.py retains the previous container/image, verifies source hashes and preserves network/IP, mounts, environment, resources, logging and isolation. Other container IDs must remain unchanged. Failed deployment rolls back automatically.

After a future approved deployment, rollback on VPS: `sudo python3 /opt/verimtomu/web-checker2-release/rollback.py`.

This release is prepared only; it has not replaced production or installed the COI timer.
