# Filzy conversion capability plan

Updated: 2026-07-15

## Product rule

The format picker may list the broad catalogue, but a target is selectable only when the current Filzy build has an executable conversion path for that exact source. The first section is always **Available from {source}**. Everything else stays visible as **Soon**; Filzy must never accept a job and fail later because a converter was never implemented.

Same-format selection is always valid. For formats with settings, it means re-encode/resize/compress; for other formats it is a lossless pass-through.

## Implemented now: fully local

Files in these paths do not leave the browser.

| Family | Inputs | Outputs / operations | Engine |
| --- | --- | --- | --- |
| Raster images | PNG, JPG/JPEG, WebP, AVIF, GIF, BMP, SVG, ICO plus FFmpeg-decodable image inputs | PNG, JPG, WebP, AVIF | Canvas first, self-hosted FFmpeg WASM fallback |
| Image vectorization | Browser-decodable raster images plus FFmpeg-decodable fallbacks | SVG | ImageTracer path tracing with live preview/settings |
| Video | MP4, WebM, MOV, MKV, AVI and other FFmpeg-decodable video inputs | MP4, WebM, MOV, MKV, AVI, GIF, still images, audio extraction | Self-hosted FFmpeg WASM |
| Audio | MP3, WAV, OGG, M4A, AAC, FLAC, Opus and other FFmpeg-decodable audio inputs | MP3, WAV, OGG, M4A, AAC, FLAC, Opus | Self-hosted FFmpeg WASM |
| Text | TXT, Markdown, HTML | TXT, Markdown, HTML where structurally valid | Native JavaScript / DOMParser |
| Structured data | CSV, JSON, XML, YAML | CSV, JSON, XML, YAML, HTML table, TXT where structurally valid | Native JavaScript / DOMParser / local YAML parser |
| Subtitles | SRT, VTT, ASS, SSA, SBV, LRC, TTML, DFXP | Full interchange among SRT, VTT, ASS, SSA, SBV, LRC, TTML/DFXP plus TXT | Native JavaScript / DOMParser |
| Image documents | Browser-decodable images plus FFmpeg-decodable fallbacks | PDF | pdf-lib, loaded only for PDF jobs |

The FFmpeg core is emitted with Filzy's production assets. It is lazy-started only for jobs that require it, but it is not fetched from esm.sh, unpkg, or another third-party runtime CDN.

## Next browser-only engines

These are feasible without uploading user files, but need a specialist parser/encoder and test fixtures before their picker entries should be enabled.

| Priority | Family | Reliable target matrix | Proposed engine |
| --- | --- | --- | --- |
| P0 | HEIC/HEIF and camera RAW | HEIC/HEIF → JPG/PNG/WebP/AVIF; supported RAW → JPG/PNG | libheif WASM + LibRaw WASM |
| P0 | PDF tools | PDF → PNG/JPG per page; split/merge/rotate/reorder | PDF.js + pdf-lib (image → PDF is implemented) |
| P0 | Spreadsheets | XLS/XLSX/ODS ↔ CSV; XLSX → JSON/HTML/PDF; CSV/JSON → XLSX | SheetJS plus PDF renderer |
| P0 | Archives | ZIP/TAR/GZ create/extract; 7Z/RAR extract; archive repacking | fflate + libarchive WASM |
| P1 | DOCX | DOCX → HTML/TXT/Markdown; HTML/Markdown → DOCX | Mammoth + a DOCX generator |
| P1 | EPUB/CBZ | EPUB → HTML/TXT/Markdown/images; HTML/Markdown/TXT → EPUB; CBZ ↔ PDF/image ZIP | ZIP/XML pipeline + pdf-lib |
| P1 | Fonts | TTF/OTF/WOFF/WOFF2/EOT conversions | fonttools/FreeType WASM, preserving licence metadata |
| P1 | 3D | OBJ/STL/PLY/glTF/GLB/DAE/3MF common interchange | three.js loaders/exporters + specialist WASM |
| P2 | Presentations | PPTX → images/PDF/text/HTML; images/PDF → PPTX | PPTX parser/rendering pipeline |
| P2 | OCR | Image/PDF → TXT/searchable PDF | Tesseract WASM + pdf-lib |

Each engine needs golden-file tests for byte signatures, dimensions/duration, text fidelity, cancellation, memory pressure, and multiple-file runs. Browser support must be feature-detected rather than inferred from an extension.

## Compute fallback for proprietary and heavyweight formats

Native tools remain the practical fallback for legacy Office, complex PDF/PostScript, Calibre formats, CAD, unusual codecs, damaged archives, and conversions that exceed a device's memory:

- FFmpeg for the complete codec/container matrix.
- LibreOffice headless for DOC/DOCX/XLS/XLSX/PPT/PPTX/ODF and PDF export.
- ImageMagick + Ghostscript for broad raster/PostScript/PDF processing.
- Calibre for MOBI/AZW/AZW3/EPUB and reflow conversions.
- Inkscape for complex SVG/EPS/PS and vector rendering.
- FontTools/FreeType for fonts.
- libarchive/7-Zip/unrar for archive coverage.

This fallback is not “free Cloudflare Workers conversion.” Workers are appropriate for authentication, rate limits, signed upload/download URLs, job state, and streaming. R2 is object storage for temporary inputs/outputs, not compute. A native conversion image can run in Cloudflare Containers, but Containers require Workers Paid; the current included allowance starts with the $5/month plan.

## Cloudflare architecture (only after fresh scoped credentials)

```text
Browser
  ├─ supported job → local engine → download
  └─ optional fallback, with explicit upload consent
       → Worker creates job + signed upload
       → browser uploads directly to private R2
       → Worker routes job to Media Transformations or Container
       → output returns to private R2
       → short-lived signed download
       → lifecycle deletion + explicit delete-now endpoint
```

Security requirements:

- Never ship an account token, R2 access key, or secret in the frontend.
- Use a freshly created, least-privilege deployment token in CI secrets only.
- Use R2 bindings from Workers instead of distributing S3 credentials.
- Buckets stay private; objects use random job IDs and short expiry.
- Add lifecycle deletion, explicit cancellation/deletion, size limits, MIME sniffing, archive-bomb protection, rate limits, and per-job observability with filenames excluded from logs.
- Make server fallback opt-in and visibly distinguish it from local processing.

Current Cloudflare references:

- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [R2 architecture](https://developers.cloudflare.com/r2/how-r2-works/)
- [Media Transformations](https://developers.cloudflare.com/stream/transform-videos/)
- [Containers pricing](https://developers.cloudflare.com/containers/pricing/)

## Rollout order

1. Ship and regression-test the local matrix already enabled.
2. Add PDF, spreadsheet, archive, HEIC/RAW, and DOCX browser engines in isolated lazy chunks.
3. Add capability telemetry that records only format pair, device class, duration, and error code—never file content or names.
4. Build the Worker job API with local Miniflare tests and fresh scoped credentials.
5. Add R2 only for explicitly consented fallback jobs.
6. Add one hardened native container, then enable server-only picker pairs gradually from observed tests.

This order keeps the default product private and free while creating a truthful route to the much larger catalogue.
