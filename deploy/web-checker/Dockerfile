ARG BASE_IMAGE
FROM ${BASE_IMAGE}
ARG RELEASE_COMMIT
LABEL org.opencontainers.image.revision=${RELEASE_COMMIT}
COPY --chown=65532:65532 src/ /app/src/
COPY --chown=65532:65532 public/ /app/public/
