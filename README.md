# SceneSync 🎬

A browser-based tool for directors and composers working with temp music. Drop in a reference track — SceneSync extracts its acoustic fingerprint and returns royalty-free tracks that work the same way acoustically, with an explanation of why each match fits.

No server. No data leaving your device.

## What it does

SceneSync extracts an acoustic fingerprint from a reference track — energy, brightness, timbral texture, harmonic content — and finds the closest matches in a curated library of 243 royalty-free tracks using cosine similarity.

The goal isn't a black box "here are similar tracks." It's **"here's the acoustic DNA of your reference, and here's why these suggestions share it."**

The scene classifier (Drama / Action / Montage / Ambiance) runs in parallel as a supporting signal — not the headline feature.

## How it works

All processing happens client-side:

1. Audio is decoded via the Web Audio API
2. Feature extraction runs in a **Web Worker** (off the main thread) using [Meyda](https://meyda.js.org/) — extracts RMS, ZCR, spectral centroid, spectral spread, spectral flatness, MFCCs (×13), and chroma (×12)
3. Each feature is stored as percentile snapshots [p25, p50, p75] across frames — capturing the arc of the track, not just a mean
4. The 90-value feature vector is compared against a pre-analyzed library using cosine similarity after z-score normalization
5. Top matches are returned with similarity scores
6. Results and track history are stored locally in **IndexedDB** — nothing leaves the device

## Royalty-free library

243 tracks from two sources:

| Source | Content | Count |
|---|---|---|
| [FMA small](https://github.com/mdeff/fma) | Instrumental, Electronic, Folk, International, Rock, Hip-Hop, Pop | 180 |
| [Musopen](https://musopen.org) (CC0) | Orchestral, Chamber, Solo Piano | 63 |

FMA small has no classical music — Musopen fills that gap for cinematic reference use.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Tailwind CSS |
| Audio analysis | Web Audio API + Meyda |
| Similarity search | Cosine similarity on z-score normalized feature vectors |
| ML inference | TensorFlow.js (scene classifier, supporting signal) |
| Local storage | IndexedDB |
| Build | Create React App + Webpack |
| Data pipeline | Python 3.12 + librosa + numpy + pandas |

## Features

- Drag-and-drop audio upload (MP3, WAV, M4A, etc.)
- Acoustic fingerprint extraction — 90-value feature vector via Meyda
- Royalty-free similarity search — top 5 matches with similarity scores
- Scene type classification as a secondary signal
- Real-time progress bar across feature extraction passes
- Three visualizations: spectral brightness, dynamic range, tempo analysis
- Track history with playback — persisted across sessions
- Fully responsive — mobile and desktop layouts
- Privacy-first: all audio stays in the browser

## Getting started

```bash
npm install
npm start        # development server
npm run build    # production build
```

## Project structure

```
src/
  components/    # AudioPlayer, FeatureVisualizations, SimilarityResults, etc.
  hooks/         # useScenePrediction (classifier), useSimilaritySearch (similarity)
  workers/       # Web Worker for off-thread feature extraction
  utils/         # featureExtraction.ts, parseTrackDisplay.ts
  services/      # audioStorageService, mlModelService, similarityService
  constants/     # Shared prediction thresholds
public/
  data/          # feature_vectors.json — 243-track library loaded at runtime
  models/        # TF.js model weights
scripts/
  extract_features.py           # FMA batch extraction
  extract_musopen_features.py   # Musopen extraction
  curate_library.py             # FMA diversity curation
  merge_library.py              # Merge → public/data/feature_vectors.json
```

## Data pipeline

The royalty-free library is pre-analyzed offline and shipped as a JSON file. To reproduce or extend it:

```bash
conda activate scenesync
python scripts/extract_features.py           # extract FMA features
python scripts/extract_musopen_features.py   # extract Musopen features
python scripts/curate_library.py             # diversity curation (180 FMA tracks)
python scripts/merge_library.py              # merge → public/data/feature_vectors.json
```

Extraction parameters match the browser exactly: `SAMPLE_RATE=44100`, `N_FFT=2048`, `HOP_LENGTH=256`.