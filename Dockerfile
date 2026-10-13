ARG NODE_IMAGE=node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs24-debian13:nonroot@sha256:9eeb7f5887d0e239e78264b06f7f11d2e14be534050481803a9e4728fcdd278e
FROM ${NODE_IMAGE} AS validated
WORKDIR /app
COPY package.json package-lock.json ./
RUN --network=none npm ci --ignore-scripts --no-audit --no-fund
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY tests ./tests
COPY test-support ./test-support
# Validation-only: the private relay is tested here but never copied to the production stage.
COPY ai-proxy.cjs ./
# Validation-only: the admin usage reader is the consumer of the app usage snapshot
# (tests/usage-stats.test.js). It is never copied to the production stage.
COPY admin/src/usage.js ./admin/src/usage.js
COPY deploy/env/app.env.example deploy/env/deployment.env.example ./deploy/env/
COPY deploy/scripts ./deploy/scripts
RUN --network=none AI_MODE=rules node --test --test-concurrency=1 && node scripts/claude-review-check.js && npm run check
# Source permissions from isolated workspaces may be 0600/0700.
RUN chmod -R a+rX /app
# Original approved PNGs are kept in Git and tested, but not shipped in runtime.
RUN cp -R public /delivery-public && node --input-type=module -e "import { characterAssetFiles } from './public/character-assets.js'; import { unlinkSync } from 'node:fs'; for (const asset of characterAssetFiles) unlinkSync('/delivery-public/' + asset.source);"

FROM ${RUNTIME_IMAGE} AS production
ARG VCS_REF=unreleased
LABEL org.opencontainers.image.title="Verim tomu" \
      org.opencontainers.image.revision="${VCS_REF}"
WORKDIR /app
COPY --from=validated /app/package.json /app/package-lock.json ./
COPY --from=validated /app/src ./src
COPY --from=validated /delivery-public ./public
COPY --from=validated /app/scripts/production-guard.js /app/scripts/healthcheck.js /app/scripts/deployment-smoke.js ./scripts/
ENV PATH="/nodejs/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
ENTRYPOINT []
USER 65532:65532
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "scripts/healthcheck.js"]
CMD ["node", "--import", "./scripts/production-guard.js", "src/server.js"]
