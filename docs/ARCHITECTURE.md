# SceneSync — Architecture

## What this is

An acoustic similarity tool for film and TV editors. Drop in a reference track, get royalty-free matches with plain-language explanations of why each one works.

The core question it answers: **"What in the audio signal produces that feeling?"**

## How it works

1. User uploads a reference track (MP3, WAV, M4A)
2. A Web Worker extracts a 90-dimension feature vector via Meyda
3. The app compares that vector against a 243-track library using cosine similarity
4. Top matches are displayed with rank-based color tiers
5. An LLM explains what the reference track is doing acoustically and why each match works

## Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS (Create React App / webpack)
- **Audio analysis:** Meyda (browser + Node.js), runs in a Web Worker
- **Storage:** IndexedDB for track history, audio blobs, explanation caching, and feature library cache
- **Audio streaming:** Cloudflare R2 for library track playback
- **Explanation layer:** DeepSeek API (swappable via `src/config/llmProvider.ts`)
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

## Dimension weighting

Not all 90 dimensions are weighted equally in similarity comparison. Based on the cross-source investigation (see `scripts/INVESTIGATION_NOTES.md`), loudness and production-density dimensions are downweighted or dropped:

| Dimension group | Weight | Reason |
|---|---|---|
| RMS (3) | 0 (dropped) | Encodes production loudness, not musical character |
| MFCC 1 (3) | 0 (dropped) | Correlates with loudness in cepstral domain |
| MFCC 2-3 (6) | 0.5 | Coarse spectral shape, partially production-dependent |
| Chroma 1-12 (36) | 0.75 | Reduces production-density bias while preserving instrument character |
| Everything else (42) | 1.0 | ZCR, centroid, spread, flatness, MFCCs 4-13 |

Weight array lives in `src/services/similarityService.ts` as `DIMENSION_WEIGHTS`.

## Library

243 tracks: 180 FMA (7 genres) + 63 Musopen (classical). Merged into `public/data/feature_vectors.json` and loaded at runtime.

The library is cached in IndexedDB after first fetch. Cache is version-keyed via `LIBRARY_VERSION` in `similarityService.ts` — bump this constant when updating `feature_vectors.json`.

### Library sources

- **FMA:** Free Music Archive, `fma_small` subset. Curated via `scripts/curate_library.py` for diversity across genres.
- **Musopen:** Classical recordings from Archive.org DVD. Curated tracklist in `scripts/musopen_tracklist.md`.

## Hook architecture

| Hook | Responsibility |
|---|---|
| `useSimilaritySearch` | File drop → decode → extract → similarity search → results |
| `useTrackExplanation` | Thin LLM API layer |
| `useExplanationCache` | Explanation fetching, caching, IndexedDB persistence |
| `useTrackHistory` | Track history state, all IndexedDB operations |
| `useFileHandler` | File selection, pendingFile ref, post-extraction effect guard |

`App.tsx` is composition only — hook calls and prop wiring, no business logic inline.

## Explanation layer

The LLM translates raw feature values into plain-language descriptions. Raw numbers are never sent to the LLM — they're first converted to semantic labels (e.g., "bright," "warm," "sparse").

Two modes:
- **Reference explanation:** Auto-fires on track load. Describes what the reference track is doing acoustically.
- **Match explanation:** Auto-fires on match card select. Describes why the match works relative to the reference.

Both are cached in IndexedDB on the `AnalyzedTrack` record (`referenceExplanation` and `matchExplanations` fields). No API call needed for previously explained tracks.

Provider is DeepSeek by default. Swap via `ACTIVE_PROVIDER` in `src/config/llmProvider.ts`.

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
| 12 | Match explanation write race | Watch | Two rapid clicks could cause overwrite. Low probability. |
| — | Schubert D. 784 null values | Pinned | 3 nulls at p50 for centroid/spread/flatness. Needs re-extraction. |
| — | LIBRARY_VERSION manual bump | Pinned | Must update when `feature_vectors.json` changes. Forgetting causes stale cache. |

## Key decisions

| Topic | Decision |
|---|---|
| Feature schema | Locked: 7 features, 90 values, p25/p50/p75 snapshots |
| Similarity method | Cosine similarity on z-score normalized feature vectors with dimension weighting |
| Data loading | `public/data/feature_vectors.json`, fetched at runtime, cached in IndexedDB |
| LLM provider | DeepSeek default, swappable via config |
| Prompt framing | Positive framing over negative constraints |
| Explanation signal | More perceptually honest than percentage for cross-source comparisons |
| App.tsx role | Composition only — hook calls and prop wiring |
| TrackExplanation | Pure display component — no caching or API calls |