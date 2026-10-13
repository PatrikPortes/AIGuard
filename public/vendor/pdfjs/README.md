# Vendored PDF.js

Official Mozilla `pdfjs-dist@6.4.299` npm package, Apache-2.0; font/CMap licenses retained alongside their original bytes.

Upstream: https://mozilla.github.io/pdf.js/ and https://www.npmjs.com/package/pdfjs-dist

npm tarball integrity: `sha512-AVl138zALtfaAPvADulE0PZThbYzCBS79nL4pOSL/6Sm/4AH5A21BD9VHt97OlCuzJuCpmeZtAtkinisF4Vb1g==`

Files copied: `legacy/build/pdf.mjs`, `legacy/build/pdf.worker.mjs`, `cmaps/*`, `standard_fonts/*`, root `LICENSE`. Source maps, WASM, viewer, attachments and scripts are not used. `manifest.json` pins individual SHA-256 hashes and byte sizes; the server serves only those allowlisted files and verifies their actual bytes.

Obtain the same package using `npm pack pdfjs-dist@6.4.299 --ignore-scripts`, verify npm integrity before extraction, and copy those paths unchanged. Do not strip whitespace in upstream licenses or modify assets without updating and reviewing the manifest. The application does not load PDF.js from any CDN.
