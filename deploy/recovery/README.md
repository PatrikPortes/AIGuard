# Production recovery — 2026-10-12

This branch preserves production application sources, not a new deployment.
Base Git commit: `6db985fcd2602916cb3941aaae9d48f22661d0cb`.
Production application image: `sha256:6d680aa4712a352c4f2d6810561c5b7aec3d1076b06fb361db3663545d05959e`.
Production AI proxy image: `sha256:5cded06c2095083afc3747529650de0a2750982417311b4e2d53168d0e8dfe96`.

The 54 files in `production-source-sha256.json` were verified against the production container and restored Docker image backup. `proxy/ai-proxy.cjs` maps to the repository root `ai-proxy.cjs`; other paths are unchanged. Original source artwork, tests, documentation and deployment files from the base repository are retained. No secrets, real environment files, database, user content, logs or Docker image archives are included.

Recovered components: homepage and message/loan routes; brand and social card assets; local loan-cost calculator and comparison; optional OpenAI observation integration; stable anonymous sessions, persistent visitor quotas, budget enforcement and cooldown; request admission/IP/Unicode performance repairs; fixed-endpoint AI relay; privacy wording.

`ai-settings.env.example` contains only reviewed non-secret settings. The shell scripts here are historical deployment snapshots and refer to local bundles and specific old image IDs; they are not instructions to run this recovery branch. The isolated image/source backups are stored outside this repository. Neither production nor existing worktrees were changed during recovery.

Known issue deliberately preserved: `scripts/healthcheck.js` requires rules mode and marks the AI production container unhealthy even though its HTTP endpoint works. The original Dockerfile and full release checks remain historical and have not been validated for this recovered version. No build, broad test suite, healthcheck fix or deployment was performed for this synchronization. Before a future deployment, prepare a build/deployment profile for these recovered sources separately.

The live app uses a read-only root, user 65532, capability drop, private network 172.30.41.0/24, application .2, relay .3, trusted host ingress .1, and persistent `/app/data` bind mount. Only relay TCP 8080 is permitted for app egress; the host firewall retains its other blocks. AI credentials are provided at runtime, never in Git or the image. Host cloudflared uses a root-owned token file; no token is included here.
