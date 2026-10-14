# Production release: verimtomu-web + verimtomu-ai-proxy

The **only** release path. Both images are built from one approved, full Git SHA (`git archive`):

| Service | Build | Rollback target |
|---|---|---|
| `verimtomu-web` | root `Dockerfile` (the release gate runs inside the build: `node --test`, Claude strict gate, `npm run check`) | the image running at `prepare` |
| `verimtomu-ai-proxy` | `deploy/release/ai-proxy.Dockerfile` (context = `ai-proxy.cjs` from the same archive; pinned distroless Node 24) | the image running at `prepare` |

`deploy/web-checker/package.py` and `deploy.py` are retired partial-overlay tools: they exit immediately and are never used.

## Steps (root on the VPS)

```bash
bash verimtomu-release.sh prepare  <SHA>          # records running images of BOTH services as rollback targets
bash verimtomu-release.sh build    <SHA>          # builds both, checks content, starts each artifact in isolation
# merge the approved PR ("Create a merge commit"); the merged tree must equal the release tree
bash verimtomu-release.sh deploy   <SHA>          # relay first, then web; any STOP auto-rolls back this run
bash verimtomu-release.sh verify   <SHA>
bash verimtomu-release.sh rollback <SHA> proxy    # or: web | all — each service independently
```

`build` stops unless:
- the gate summary is in the build log (the gate stage is never taken from cache);
- the revision labels equal the SHA;
- the web image contains `contract-legal-catalog.json` = `[]`, the contract page and modules and PDF.js;
- the relay image contains `ai-proxy.cjs` byte-identical to the archive, with the expected entrypoint and user 65532;
- both images pass the clone pre-check against the running containers (env keys, entrypoint, mounts, networks, privileges);
- both images start with the **current** runtime env, `--network none`, read-only, and a scratch data dir:
  - web: health ok, catalogue `[]`, `/proverit-smlouvu` 200, production guard accepted;
  - relay: `/health` 200.

`deploy`:
- renames each running container to `<name>-before-<sha7>` and stops it (original image and configuration are kept);
- creates the new container with identical runtime configuration;
- compares the runtime (env, mounts, read-only, caps, security-opt, limits, logging, restart policy, networks with fixed `172.30.41.2/.3`);
- checks health.

`rollback <target>`:
- removes the new container and renames the kept one back;
- starts it with its original image and configuration;
- checks health.

Each of web and relay rolls back independently; the API between them is unchanged in this release.

Never changed: firewall, Cloudflare, DNS, tunnel, Docker networks, persistent data, env values. No `AI_CONTRACT_*` variable is added, so `AI_CONTRACT_ENABLED` stays false.

## Test results outside a Linux/Node 24 environment

The suite targets Node 24 on Linux, the production platform. With `admin/` dependencies installed (`npm ci` in `admin/`, which provides `jose`), `node --test` passes in full on the pinned `node:24-bookworm-slim` image.

Failures seen elsewhere are environment limits, not application defects:
- `admin/tests/dashboard.test.js`: `jose` is not installed. The admin service has its own `package.json`; this test is not part of the web image gate.
- `tests/ingress.test.js`: binds `127.0.0.2`, which macOS does not route without a loopback alias.
- `tests/deploy-scripts.test.js`: uses Linux `flock` (util-linux).
- On Node 22, the ARES client timeout test is cancelled because the `AbortSignal.timeout` timer does not keep the event loop alive. It passes on Node 24, the supported runtime (`engines: >=24 <25`).
