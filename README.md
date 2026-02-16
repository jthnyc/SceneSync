# SceneSync 🎬

An AI-powered film music scene classifier that runs entirely in the browser. Upload an audio track and SceneSync analyzes its acoustic features to classify which type of film scene it best suits — no server, no data leaving your device.

## What it does

SceneSync extracts audio features from a track and classifies it into one of four scene types:

- **Drama & Emotional** — character development, revelations, poignant moments
- **Action & Intensity** — high-energy sequences, conflict, tension
- **Montage & Narrative** — transitions, storytelling, moderate-paced sequences
- **Ambiance & Texture** — atmospheric, environmental, background scoring

When the model finds two scene types equally likely, the UI surfaces both candidates rather than forcing a single answer — useful when a track genuinely bridges categories.

## How it works

All processing happens client-side:

1. Audio is decoded via the Web Audio API
2. Feature extraction runs in a **Web Worker** (off the main thread) using [Meyda](https://meyda.js.org/) — extracts RMS, ZCR, spectral centroid, spectral rolloff, MFCCs, spectral contrast, and chroma across ~15,000 frames per feature pass
3. The extracted feature vector is passed to a **TensorFlow.js** model for classification
4. Results, audio, and track history are stored locally in **IndexedDB** — nothing leaves the device

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Tailwind CSS |
| Audio analysis | Web Audio API + Meyda |
| ML inference | TensorFlow.js |
| Local storage | IndexedDB (via custom service) |
| Build | Create React App + Webpack |

## Features

- Drag-and-drop or click-to-browse audio upload (MP3, WAV, M4A, etc.)
- Real-time progress bar across 8 feature extraction passes
- Three visualizations: spectral brightness, dynamic range, tempo analysis
- Track history with playback — persisted across sessions
- Graceful low-confidence display when results are split
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
  components/       # React components
  hooks/            # useScenePrediction — orchestrates the full analysis pipeline
  workers/          # Web Worker for off-thread feature extraction
  utils/            # featureExtraction.ts (worker wrapper), formatUtils, fileValidation
  services/         # audioStorageService (IndexedDB), mlModelService (TF.js)
  constants/        # Shared prediction thresholds
  types/            # TypeScript definitions
public/
  models/           # TF.js model weights + scaler/scene type configs
  scene_descriptions.json
```