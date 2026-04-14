# SceneSync — Architecture

## What this is

An acoustic similarity tool for film and TV editors. Drop in a reference track, get royalty-free matches with plain-language explanations of why each one works.

The core question it answers: **"What in the audio signal produces that feeling?"**

The acoustic explanation layer — returning the reasoning behind a match, not just the match itself — is SceneSync's primary differentiator. No commercial licensing platform has an equivalent.

## How it works

1. User uploads a reference track (MP3, WAV, M4A) — or selects a curated entry point
2. A Web Worker extracts a 90-dimension feature vector via Meyda
3. The app compares that vector against a 373-track library using weighted cosine similarity
4. Top matches are displayed with rank-based color tiers
5. An LLM explains what the reference track is doing acoustically and why each match works

## Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS (Create React App / webpack)
- **Audio analysis:** Meyda (browser + Node.js), runs in a Web Worker
- **Storage:** IndexedDB for track history, audio blobs, explanation caching, and feature library cache
- **Audio streaming:** Cloudflare R2 for library track playback
- **Serverless functions:** Vercel — `api/explain.js` (LLM proxy), `api/fetch-audio.js` (R2 CORS proxy)
- **Explanation layer:** DeepSeek API by default, swappable via `LLM_PROVIDER` env var (Anthropic, OpenAI)
- **Data pipeline:** Python 3.12 + Node.js scripts for feature extraction and library curation

## Feature vector schema

7 features, each stored as percentile snapshots at p25, p50, p75 across frames. Total: 90 values per track.

| Feature | Meyda name | What it captures | Dimensions |
|---|---|---|---|
| RMS | `rms` | Loudness / energy | 3 |
| ZCR | `zcr` | Signal activity / busyness | 3 |
| Spectral centroid | `spectralCentroid` | Brightness (treble vs bass) | 3 |
| Spectral spread | `spectralSpread` | Frequency width (sparse vs full) | 3 |
| Spectral flatness | `spectralFlatness` | Tonal vs noisy texture | 3 |
| MFCCs | `mfcc` (×13) | Timbral color / instrument character | 39 |
| Chroma | `chroma` (×12) | Harmonic content / pitch class presence | 36 |

**Critical constants:** BUFFER_SIZE/N_FFT = 2048, HOP_SIZE = 512. Changing either requires re-extracting the entire library.

**Meyda naming:** The correct feature name is `spectralSpread`, not `spectralBandwidth`. Centroid and spread output in frequency bins, not Hz.

**Schema limitations:** No tempo (Meyda doesn't extract it), no instrument identity (MFCCs capture spectral envelope shape, not source — a clarinet and a synth pad with similar envelopes will have similar MFCC profiles).

## Dimension weighting

Not all 90 dimensions are weighted equally in similarity comparison. Based on the cross-source investigation (see `scripts/investigation/INVESTIGATION_NOTES.md`), loudness and production-density dimensions are downweighted or dropped:

| Dimension group | Weight | Reason |
|---|---|---|
| RMS (3) | 0 (dropped) | Encodes production loudness, not musical character |
| MFCC 1 (3) | 0 (dropped) | Correlates with loudness in cepstral domain |
| MFCC 2-3 (6) | 0.5 | Coarse spectral shape, partially production-dependent |
| Chroma 1-12 (36) | 0.75 | Reduces production-density bias while preserving harmonic character |
| Everything else (42) | 1.0 | ZCR, centroid, spread, flatness, MFCCs 4-13 |

Weight array lives in `src/services/similarityService.ts` as `DIMENSION_WEIGHTS`.

## Library

373 tracks merged into `public/data/feature_vectors.json` and loaded at runtime.

| Source | Count | License | Notes |
|---|---|---|---|
| FMA (curated) | 180 | CC BY | 7 genres via diversity sampling |
| Musopen | 63 | CC0 | Classical orchestral + solo piano |
| YouTube Audio Library | 130 | YT AL | 3 batches targeting cinematic, ambient, dark, intimate |

The library is cached in IndexedDB after first fetch. Cache is version-keyed via `LIBRARY_VERSION` in `similarityService.ts` — bump this constant when updating `feature_vectors.json`. Current version: `v2-373-patch1` (Schubert D.784 null interpolation patch).

Pipeline scripts live in `scripts/pipeline/`. QA scripts in `scripts/qa/`. Cross-source investigation scripts in `scripts/investigation/`.

## Hook architecture

| Hook | Responsibility |
|---|---|
| `useSimilaritySearch` | File drop → decode → extract → similarity search → results |
| `useTrackExplanation` | Thin LLM API layer (calls `/api/explain`) |
| `useExplanationCache` | Explanation fetching, caching, IndexedDB persistence, staleness guard via `selectedTrackIdRef` |
| `useTrackHistory` | Track history state, all IndexedDB operations |
| `useFileHandler` | File selection, pendingFile ref, post-extraction effect guard |

`App.tsx` is composition only — hook calls and prop wiring, no business logic inline.

## Explanation layer

The LLM translates feature values into plain-language descriptions. Raw numbers are never sent — they're first converted to semantic labels (e.g., centroid bin 29 → "warm, mid-heavy"; flatness 0.114 → "tonal, clean melodic character"). This is a translation problem, not classification, which is why an LLM works without training data.

Two modes:
- **Reference explanation:** Auto-fires on track load. Describes what the reference track is doing acoustically.
- **Match explanation:** Auto-fires on match card select. Describes why the match works relative to the reference.

Both are cached in IndexedDB on the `AnalyzedTrack` record (`referenceExplanation` and `matchExplanations` fields). No API call needed for previously explained tracks.

Temperature is 0.7 across all providers — lower values produced repetitive opening phrasing.

## Serverless functions

### `api/explain.js`
Proxies LLM API calls server-side. Exists because Create React App exposes `REACT_APP_*` env vars in the client bundle — anyone opening DevTools could steal a plaintext API key. The key lives in Vercel environment variables and never reaches the browser.

Provider-agnostic (DeepSeek, Anthropic, OpenAI) via `LLM_PROVIDER` env var. Provider config is self-contained — `src/config/llmProvider.ts` was deleted Mar 17 when configuration moved server-side.

In-memory rate limiter: 30 requests/hour per IP, resets on cold start. Acceptable for a portfolio project; Vercel KV (Redis) is the documented upgrade path if abuse occurs.

### `api/fetch-audio.js`
Proxies audio fetches from Cloudflare R2. Exists because Cloudflare's dashboard had a bug preventing direct CORS configuration — browser `fetch()` to the r2.dev URL was blocked, server-side fetch is not. Path prefix allowlist (`youtube/`, `fma_small/`, `musopen/`) prevents the endpoint from being used as an open proxy. Returns audio as binary with a 1-hour Cache-Control header.

## Curated entry points

Three hand-picked library tracks rendered as cards above the upload zone in the empty state. Each card fetches its audio from R2 via `/api/fetch-audio`, constructs a `File` object, and feeds it through the same extraction pipeline as a user upload.

Entry points solve the accessibility-of-entry problem (not everyone has a reference track handy) without bypassing the similarity engine — the alternative path (text-to-recommendation) was deprioritized because it would have shifted the product from "here's why this sounds the way it does" to "the AI picked some tracks."

Config in `src/config/entryPoints.ts`. Component: `src/components/EntryPoints.tsx`.

## Self-match filter

Cosine similarity ≥ 0.95 is excluded from results. Originally 0.98, lowered when library-sourced entry points scored just below that threshold against themselves.

The score-based threshold is a band-aid on a structural problem — see the PCM gap section below. The real fix is decode environment alignment, not threshold tuning.

## Browser/Node PCM gap

This is the most consequential architectural constraint in the system, and it's worth understanding in detail.

### What PCM is
PCM (Pulse Code Modulation) is raw audio — a long array of floating point numbers, one per sample, representing wave amplitude at each moment. At 44100 Hz, that's 44,100 numbers per second. An MP3 is not PCM — it's compressed. Decoding an MP3 means decompressing it back to raw PCM. Meyda operates on PCM directly; it never sees the MP3.

The pipeline is: **MP3 → decoder → PCM → Meyda → feature vector.** The decoder step is where the gap lives.

### Root cause
The Node.js batch extractor uses ffmpeg to decode MP3s to PCM. The browser uses Web Audio API (`decodeAudioData`). Both feed that PCM to the same Meyda library with identical parameters. The gap is not in Meyda — it's in how ffmpeg and Web Audio API normalize amplitude during decode.

MP3 decoding is not a single deterministic operation — the spec allows implementation flexibility in gain normalization and resampling. Both ffmpeg and the browser produce "correct" decodings, but at different amplitude scales. The PCM values differ by a consistent ~10–15% scaling factor across MFCC coefficients.

### Measurement
Measured Apr 13, 2026 using `test_mfcc_alignment.py` (Node values) vs browser console (Web Audio values) on FMA track 019412:

| Coefficient | Node p50 | Browser p50 | Ratio | Gap |
|---|---|---|---|---|
| mfcc_1 | 206.40 | 175.60 | 0.85 | ~15% |
| mfcc_2 | 72.86 | 61.30 | 0.84 | ~16% |
| mfcc_3 | -15.68 | -14.91 | — | small |

No sign flips, no order-of-magnitude differences — the pipeline is structurally correct. Values are consistently scaled lower in the browser. Systematic, not noise.

### Consequence
When a library track is used as an entry point (fetched from R2, decoded in the browser), its feature vector diverges from the library's copy (extracted in Node via ffmpeg). The same track scores ~81% against itself instead of ~100%. The 0.95 self-match threshold doesn't catch this — 81% is well below it, so the track appears as its own match.

For user-uploaded files, the gap is not user-visible. Users have no "correct" vector to compare against — they just see ranked matches. The gap only surfaces in the entry-point case where we know the reference is in the library.

### What was ruled out
- **Filename/path matching** — too shallow, broken by renames and different R2 paths
- **Score threshold** — imprecise, can't distinguish true duplicates from acoustically similar tracks
- **Content hash** — robust for exact byte matches, fails for re-encoded or trimmed versions
- **Decoder translator** — would model the difference between two implementations, fragile and hard to explain

### The real fix
Align the decode step across both environments. Two options, both deferred:

- **ffmpeg.wasm** — WebAssembly build of ffmpeg in the browser. No server round-trip, keeps everything client-side, aligns decode with library extraction. Downside: ~30MB on a 627KB bundle (48× increase). Startup cost: 1–3s on modern hardware (untested). Preferred fix when the time is right.
- **Server-side decode** — send uploaded audio to a Vercel function, decode with ffmpeg, return raw PCM. Adds a network round-trip per upload and changes the privacy model (audio leaves the browser).

Documented as an architectural constraint, not a bug. The gap is not user-visible for typical uploads.

## IndexedDB schema

Single database: `SceneSyncAudioDB` (version 2).

**`audioTracks` store** (keyPath: `id`):
- Audio blobs, track metadata, feature vectors, explanation caches
- 10-file limit with LRU eviction
- Index on `storedAt` for ordering

**`libraryCache` store** (keyPath: `key`):
- Single record with key `'library'`
- Stores the full feature library array + version string
- Invalidated when `LIBRARY_VERSION` in `similarityService.ts` changes

## Known issues

| # | Issue | Status | Impact |
|---|---|---|---|
| 6 | User-uploaded file decoding edge cases | Watch | Node.js decoders less tested than librosa/ffmpeg |
| 7 | Sample rate hardcoded to 44100 | Watch | Pro audio setups may use 48000 |
| 8 | `audio/x-m4a` console warning | Cosmetic | React DevTools, not app code |
| 9 | Cross-source similarity gap | Investigated, mitigated | Weighting applied. Underlying divergence persists; library growth is complementary. |
| 11 | StrictMode double-invoke | Dev only | `explainReference` excluded from deps intentionally |
| 12 | Match explanation write race | Watch | Two rapid clicks could overwrite. Low probability. |
| 14 | Skeleton loader timing | Cosmetic | Skeleton overlaps with ExtractionProgress during extraction phase |
| 15 | DeepSeek explanation accuracy | Watch | Mood/texture sometimes hallucinated. Mitigated via opener rotation, raw values, temp 0.7. |
| 17 | In-flight worker not aborted on new extraction | Watch | First worker can briefly set state before guard fires. Low probability. |
| 18 | Browser/Node PCM gap | Documented, deferred | Entry point tracks score ~81% against themselves. See PCM gap section. |
| 19 | FMA 130993 entry point — inaccurate LLM description | Watch | 29s duration too short for reliable percentiles. Flagged for replacement. |

## Key decisions

| Topic | Decision |
|---|---|
| Feature schema | Locked: 7 features, 90 values, p25/p50/p75 snapshots |
| Schema limitations | No tempo, no instrument identity. Documented, not planned to address. |
| Similarity method | Weighted cosine on z-score normalized vectors |
| Active dimensions | 84/90 after weighting (RMS + MFCC 1 dropped) |
| Self-match filter | Cosine ≥ 0.95 excluded. Band-aid — real fix is decode alignment (#18). |
| Browser/Node PCM gap | Deferred. ffmpeg.wasm is preferred fix path when bundle cost is acceptable. |
| Bundle size | 627KB main.js (186KB gzipped). ffmpeg.wasm would be 48× increase. |
| Data loading | `public/data/feature_vectors.json`, fetched at runtime, cached in IndexedDB |
| LIBRARY_VERSION | `v2-373-patch1` — must bump when feature_vectors.json changes |
| LLM provider | DeepSeek default. Swap via `LLM_PROVIDER` env var. |
| LLM API security | Serverless proxy (`api/explain.js`) — key never exposed to browser |
| Provider config location | `api/explain.js` (server-side). `src/config/llmProvider.ts` deleted Mar 17. |
| Rate limiting | In-memory, 30 req/hr per IP, resets on cold start. Vercel KV pinned as upgrade. |
| Temperature | 0.7 on all providers. Lower values caused repetitive opening phrasing. |
| R2 audio proxy | `api/fetch-audio.js` — CORS workaround. Path prefix allowlist prevents abuse. |
| Curated entry points | Chosen over text-to-recommendation — keeps users in the similarity engine. |
| App.tsx role | Composition only — hook calls and prop wiring |
| TrackExplanation | Pure display component — no caching or API calls |
| Explanation signal | More perceptually honest than percentage for cross-source comparisons |