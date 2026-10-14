# verimtomu-ai-proxy, built from the same approved Git SHA as verimtomu-web.
# Build context: a directory holding ONLY ai-proxy.cjs and this file, both taken
# from `git archive <SHA>` (see deploy/release/verimtomu-release.sh).
# Same pinned runtime as the web image; ai-proxy.cjs uses only node:crypto and node:http.
ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs24-debian13:nonroot@sha256:9eeb7f5887d0e239e78264b06f7f11d2e14be534050481803a9e4728fcdd278e
FROM ${RUNTIME_IMAGE}
ARG VCS_REF=unreleased
LABEL org.opencontainers.image.title="Verim tomu relay" \
      org.opencontainers.image.revision="${VCS_REF}"
WORKDIR /app
COPY --chown=65532:65532 ai-proxy.cjs /app/ai-proxy.cjs
ENV PATH="/nodejs/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
USER 65532:65532
EXPOSE 8080
# Same runtime contract as the current relay (deploy/recovery/deploy-verimtomu-ai.sh).
ENTRYPOINT ["/nodejs/bin/node", "--max-old-space-size=64", "/app/ai-proxy.cjs"]
CMD []
HEALTHCHECK NONE
