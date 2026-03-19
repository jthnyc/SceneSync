# SceneSync 🎬

A browser-based tool for film and TV editors working with temp music. Drop in a reference track — SceneSync extracts its acoustic fingerprint, finds royalty-free tracks that work the same way acoustically, and explains in plain language why each match fits.

All audio processing happens client-side. Raw audio never leaves your browser.

## What it does

SceneSync extracts an acoustic fingerprint from a reference track — energy, brightness, timbral texture, harmonic content — and finds the closest matches in a curated library of 243 royalty-free tracks using cosine similarity.

The goal isn't a black box "here are similar tracks." It's **"here's the acoustic DNA of your reference, and here's why these suggestions share it."**

The explanation layer is what makes it meaningful — not just a similarity score, but a plain-language description of what the track is doing acoustically and why each match serves the same scene need.

## How it works

1. Audio is decoded via the Web Audio API
2. Feature extraction runs in a **Web Worker** (off the main thread) using [Meyda](https://meyda.js.org/) — extracts RMS, ZCR, spectral centroid, spectral spread, spectral flatness, MFCCs (×13), and chroma (×12)
3. Each feature is stored as percentile snapshots [p25, p50, p75] across frames — capturing the arc of the track, not just a mean
4. The 90-value feature vector is compared against a pre-analyzed library using cosine similarity after z-score normalization
5. Top matches are returned with similarity scores and plain-language acoustic explanations via a provider-agnostic LLM layer (serverless proxy — API keys never reach the browser)
6. Feature vectors, explanations, and track history are stored locally in **IndexedDB**

## Royalty-free library

243 tracks from two sources:

| Source | Content | Count |
|---|---|---|
| [FMA small](https://github.com/mdeff/fma) | Instrumental, Electronic, Folk, International, Rock, Hip-Hop, Pop | 180 |
| [Musopen](https://musopen.org) (CC0) | Orchestral, Chamber, Solo Piano | 63 |

FMA small has no classical music — Musopen fills that gap for cinematic reference use.
The library is actively expanding — next additions will prioritize sparse/intimate textures (solo piano, small chamber ensemble) currently underrepresented in the 243-track set.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Tailwind CSS |
| Audio analysis | Web Audio API + Meyda (in Web Worker) |
| Similarity search | Cosine similarity on z-score normalized feature vectors |
| Explanation layer | Provider-agnostic LLM via Vercel serverless proxy (DeepSeek default, swappable to Claude/OpenAI) |
| Local storage | IndexedDB (feature vectors, explanations, track history) |
| Audio streaming | Cloudflare R2 |
| Deployment | Vercel |
| Build | Create React App + Webpack |
| Data pipeline | Node.js (Meyda-aligned extraction) + Python (curation, merging, QA) |

## Features

- Drag-and-drop audio upload (MP3, WAV, M4A, etc.)
- Acoustic fingerprint extraction — 90-value feature vector via Meyda
- Royalty-free similarity search — top 5 matches with rank-relative match quality labels
- Plain-language acoustic explanation for reference track and each match — auto-fires, no button press needed
- Explanations and feature vectors cached in IndexedDB — history tracks load instantly without re-extraction or re-fetching explanations
- Five acoustic visualizations: harmonic content (chroma), energy/RMS, brightness, texture, frequency width
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
src/
  components/    # AudioPlayer, FeatureVisualizations, SimilarityResults,
                 # TrackExplanation, TrackHistory, Sidebar, MainContent, etc.
  hooks/         # useSimilaritySearch, useTrackExplanation,
                 # useExplanationCache, useTrackHistory, useFileHandler
  workers/       # Web Worker for off-thread feature extraction
  utils/         # featureExtraction.ts, parseTrackDisplay.ts
  services/      # audioStorageService, similarityService, explanationService
  config/        # rankConfig.ts — match card color tiers
public/
  data/          # feature_vectors.json — 243-track library loaded at runtime
scripts/
  extract_features.js           # Node.js Meyda-aligned batch extractor
  extract_features.py           # Python extraction — curation, QA
  extract_musopen_features.py   # Musopen extraction
  curate_library.py             # FMA diversity curation
  merge_library.py              # Merge → public/data/feature_vectors.json
  prepare_previews.sh           # Generate trimmed previews for R2 upload
  sync_previews.js              # Sync audio previews to Cloudflare R2
  qa_sample.py                  # Random sample + acoustic summary for QA
```

## Data pipeline

The royalty-free library is pre-analyzed offline and shipped as a JSON file. To reproduce or extend it:
```bash
node scripts/extract_features.js fma        # FMA extraction (Meyda-aligned)
node scripts/extract_features.js musopen    # Musopen extraction
conda activate scenesync
python scripts/curate_library.py            # FMA diversity curation
python scripts/merge_library.py             # merge → public/data/feature_vectors.json
```

Extraction parameters match the browser exactly: `SAMPLE_RATE=44100`, `BUFFER_SIZE=2048`, `HOP_SIZE=512`.

## Swapping LLM providers

The explanation layer is provider-agnostic. To switch from DeepSeek to Claude or OpenAI, set `LLM_PROVIDER` in the Vercel dashboard and add the corresponding API key. No code changes required.