# SceneSync 🎬

A browser-based tool for film and TV editors working with temp music. Drop in a reference track — SceneSync extracts its acoustic fingerprint, finds royalty-free tracks that work the same way acoustically, and explains in plain language why each match fits.

All audio processing happens client-side. Raw audio never leaves your browser.

## What it does

SceneSync extracts an acoustic fingerprint from a reference track — energy, brightness, timbral texture, harmonic content — and finds the closest matches in a curated library of 373 royalty-free tracks using cosine similarity.

The goal isn't a black box "here are similar tracks." It's **"here's the acoustic DNA of your reference, and here's why these suggestions share it."**

The explanation layer is what makes it meaningful — not just a similarity score, but a plain-language description of what the track is doing acoustically and why each match serves the same scene need. No commercial licensing platform has an equivalent.

## How it works

1. Audio is decoded via the Web Audio API
2. Feature extraction runs in a **Web Worker** (off the main thread) using [Meyda](https://meyda.js.org/) — extracts RMS, ZCR, spectral centroid, spectral spread, spectral flatness, MFCCs (×13), and chroma (×12)
3. Each feature is stored as percentile snapshots [p25, p50, p75] across frames — capturing the arc of the track, not just a mean
4. The 90-value feature vector is compared against a pre-analyzed library using weighted cosine similarity after z-score normalization
5. Top matches are returned with similarity scores and plain-language acoustic explanations via a provider-agnostic LLM layer (serverless proxy — API keys never reach the browser)
6. Feature vectors, explanations, and track history are stored locally in **IndexedDB**

## Royalty-free library

373 tracks from three sources:

| Source | Content | Count |
|---|---|---|
| [FMA small](https://github.com/mdeff/fma) | Instrumental, Electronic, Folk, International, Rock, Hip-Hop, Pop | 180 |
| [Musopen](https://musopen.org) (CC0) | Orchestral, Chamber, Solo Piano | 63 |
| [YouTube Audio Library](https://studio.youtube.com/channel/UCwiki/music) | Cinematic, Ambient, Dark, Intimate | 130 |

FMA covers contemporary genres; Musopen fills the classical gap; YouTube Audio Library tracks target cinematic and intimate textures underrepresented in the first two sources.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Tailwind CSS |
| Audio analysis | Web Audio API + Meyda (in Web Worker) |
| Similarity search | Weighted cosine similarity on z-score normalized feature vectors |
| Explanation layer | Provider-agnostic LLM via Vercel serverless proxy (DeepSeek default, swappable to Claude/OpenAI) |
| Local storage | IndexedDB (feature vectors, explanations, track history, library cache) |
| Audio streaming | Cloudflare R2 |
| Deployment | Vercel |
| Build | Create React App + Webpack |
| Data pipeline | Node.js (Meyda-aligned extraction) + Python (curation, QA, merging) |

## Features

- Drag-and-drop audio upload (MP3, WAV, M4A, etc.)
- Three curated entry points — no reference track required to get started
- Acoustic fingerprint extraction — 90-value feature vector via Meyda
- Royalty-free similarity search — top 5 matches with rank-relative match quality labels
- Plain-language acoustic explanation for reference track and each match — auto-fires, no button press needed. Explains the full timbral profile (spectral envelope shape via MFCCs 2-13), energy arc, harmonic character, and why each match works for the same scene need.
- Causal language — explanations connect acoustic properties to perceptual effect, not just label them
- Explanations and feature vectors cached in IndexedDB — history tracks load instantly without re-extraction or re-fetching explanations
- Three acoustic visualizations: timbral profile (MFCCs), harmonic content (chroma), acoustic properties comparison
- Track history with full playback — persisted across sessions via Cloudflare R2 streaming
- Fully responsive — mobile and desktop layouts
- Privacy-first: all audio analysis stays in the browser — only semantic labels are sent to the LLM

## Getting started
```bash
npm install
vercel dev       # local dev (runs serverless functions)
npm run build    # production build
```

Environment variables in `.env`:
```
REACT_APP_R2_PUBLIC_URL=...        # Cloudflare R2 public bucket URL
```

Environment variables in Vercel dashboard (Production + Preview):
```
DEEPSEEK_API_KEY=...               # required if LLM_PROVIDER=deepseek (default)
ANTHROPIC_API_KEY=...              # required if LLM_PROVIDER=anthropic
OPENAI_API_KEY=...                 # required if LLM_PROVIDER=openai
LLM_PROVIDER=deepseek             # optional — defaults to deepseek
```

For local development with serverless functions, run `vercel env pull` to sync env vars from Vercel, then use `vercel dev`.

## Project structure
```
api/
  explain.js            # Vercel serverless function — proxies LLM calls, rate-limited
  fetch-audio.js        # Vercel serverless function — proxies R2 audio fetches (CORS workaround)
src/
  components/    # AudioPlayer, FeatureVisualizations, SimilarityResults,
                 # TrackExplanation, TrackHistory, Sidebar, MainContent,
                 # EntryPoints, ExtractionProgress, etc.
  hooks/         # useSimilaritySearch, useTrackExplanation,
                 # useExplanationCache, useTrackHistory, useFileHandler
  workers/       # Web Worker for off-thread feature extraction
  utils/         # featureExtraction.ts, parseTrackDisplay.ts, formatUtils.ts
  services/      # audioStorageService, similarityService, explanationService
  config/        # rankConfig.ts, entryPoints.ts
public/
  data/          # feature_vectors.json — 373-track library loaded at runtime
scripts/
  pipeline/
    extract_features.js           # Node.js Meyda-aligned batch extractor (fma|musopen|youtube)
    curate_library.py             # FMA diversity curation across 7 genres
    merge_library.py              # Merge → public/data/feature_vectors.json
    prepare_previews.sh           # Generate trimmed previews for R2 upload
    sync_previews.js              # Sync audio previews to Cloudflare R2
  qa/
    qa_screen_library.py          # Composite suspiciousness scoring + percentile ordering validation
    qa_sample.py                  # Random sample + acoustic summary for QA listening
    check_licenses.py             # FMA license verification
  investigation/
    analyze_cross_source_gap.py   # Step 1: per-dimension distribution analysis
    test_weighting_schemes.py     # Step 2: weighting scheme experiments
    ear_test_comparison.py        # Step 3: side-by-side ranking for ear testing
    analyze_genre_gaps.py         # Step 4: acoustic space gap profiling
    test_mfcc_alignment.py        # Browser vs Node.js extraction divergence measurement
    analyze_percentile_spreads.py # Library spread distribution analysis
    diagnose_extraction.js        # Per-track NaN frame count + re-extraction comparison
```

## Data pipeline

The royalty-free library is pre-analyzed offline and shipped as a JSON file. To reproduce or extend it:
```bash
node scripts/pipeline/extract_features.js fma        # FMA extraction (Meyda-aligned)
node scripts/pipeline/extract_features.js musopen    # Musopen extraction
node scripts/pipeline/extract_features.js youtube    # YouTube Audio Library extraction
conda activate scenesync
python scripts/pipeline/curate_library.py            # FMA diversity curation
python scripts/pipeline/merge_library.py             # merge → public/data/feature_vectors.json
python scripts/qa/qa_screen_library.py               # QA check before deploy
```

Extraction parameters match the browser exactly: `SAMPLE_RATE=44100`, `BUFFER_SIZE=2048`, `HOP_SIZE=512`.

Always delete source output files before a full re-extract — the resumable logic will silently skip tracks if output already exists.

## Swapping LLM providers

The explanation layer is provider-agnostic. To switch from DeepSeek to Claude or OpenAI, set `LLM_PROVIDER` in the Vercel dashboard and add the corresponding API key. No code changes required.