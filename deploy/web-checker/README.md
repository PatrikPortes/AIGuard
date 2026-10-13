# Unified production + SEO + Web Checker release
The verified production baseline is image sha256:d91f79fbc0cde8431e3558a3833b26a8fb124b860f03fb94207511a944023a90, revision 7e2112e. production-baseline.json records all 60 actual runtime source/public hashes, not an assumed Git tree.

The checkout restores the six frontend files differing between a7938eb and the actual runtime before applying this release. Production privacy.html and robots.txt are identical; sitemap retains all five existing URLs and adds /proverit-web. Existing CSP exceptions remain byte-identical, only on the three approved informational pages. API, form and new checker policies remain same-origin.

Deployment builds a small overlay on the immutable current image. Bundle context: src/server.js, src/sender.js, public/index.html, public/style.css, public/sitemap.xml and the three new Web Checker files. The environment is captured privately on VPS outside the build context (root-only permissions), never printed or committed. The helper verifies the production manifest, retains the old container and preserves private network/IP, mounts, environment, resources and isolation. Admin and AI proxy must retain identical container IDs. Failure restores the previous container automatically.

Run on VPS as root: `python3 /tmp/deploy-web-checker.py COMMIT /tmp/verim-web-checker.tar.gz`.
Rollback: `sudo python3 /opt/verimtomu/web-checker-release/rollback.py`. Old images and containers are retained. No data directories are replaced. The inherited rules-only Docker health probe is unchanged; the real HTTP health endpoint verifies AI readiness.

The Web Checker never visits targets, resolves DNS, calls AI or stores input URLs. It is structural guidance, not identity verification. Supported brands reuse the existing sender metadata (Meta/Facebook and Česká pošta). Browser-only checks do not increment completed-message server counters.
