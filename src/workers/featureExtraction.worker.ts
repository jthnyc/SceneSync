/* eslint-disable no-restricted-globals */
// src/workers/featureExtraction.worker.ts
//
// ESLint's no-restricted-globals rule flags `self` because in normal browser
// code it's usually a mistake (window vs self confusion). In a Web Worker,
// `self` is the correct and only global — the disable above is intentional.
//
// Runs entirely off the main thread. Receives a Float32Array (the raw audio
// signal), runs all 8 Meyda feature passes, and posts PROGRESS messages back
// to the main thread after each pass so the progress bar moves smoothly.
//
// The main thread never blocks during extraction — it only receives messages.

import Meyda from 'meyda';
import {
  HOP_SIZE,
  BUFFER_SIZE,
  FeatureTimeSeries,
  WorkerInboundMessage,
  WorkerOutboundMessage,
} from './featureExtraction.types';

// ---------------------------------------------------------------------------
// Helpers — identical math to the original featureExtraction.ts
// ---------------------------------------------------------------------------

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, val) => sum + (val - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

// ---------------------------------------------------------------------------
// Feature extraction — moved verbatim from featureExtraction.ts
// ---------------------------------------------------------------------------

function extractFramedFeature(
  signal: Float32Array,
  sampleRate: number,
  featureName: string
): number[] {
  const values: number[] = [];
  for (let i = 0; i < signal.length - BUFFER_SIZE; i += HOP_SIZE) {
    const frame = signal.slice(i, i + BUFFER_SIZE);
    const result = (Meyda as any).extract(featureName, frame, {
      sampleRate,
      bufferSize: BUFFER_SIZE,
    });
    if (typeof result === 'number' && !isNaN(result)) {
      values.push(result);
    }
  }
  return values.length > 0 ? values : [0];
}

function extractMFCCs(signal: Float32Array, sampleRate: number): number[][] {
  const mfccArrays: number[][] = Array.from({ length: 13 }, () => []);
  for (let i = 0; i < signal.length - BUFFER_SIZE; i += HOP_SIZE) {
    const frame = signal.slice(i, i + BUFFER_SIZE);
    const mfcc = (Meyda as any).extract('mfcc', frame, { sampleRate, bufferSize: BUFFER_SIZE });
    if (Array.isArray(mfcc) && mfcc.length >= 13) {
      for (let j = 0; j < 13; j++) {
        if (!isNaN(mfcc[j])) mfccArrays[j].push(mfcc[j]);
      }
    }
  }
  return mfccArrays.map(arr => (arr.length > 0 ? arr : [0]));
}

function extractSpectralContrast(signal: Float32Array, sampleRate: number): number[][] {
  const contrastArrays: number[][] = Array.from({ length: 7 }, () => []);
  for (let i = 0; i < signal.length - BUFFER_SIZE; i += HOP_SIZE) {
    const frame = signal.slice(i, i + BUFFER_SIZE);
    const contrast = (Meyda as any).extract('spectralFlatness', frame, {
      sampleRate,
      bufferSize: BUFFER_SIZE,
    });
    if (typeof contrast === 'number' && !isNaN(contrast)) {
      for (let j = 0; j < 7; j++) contrastArrays[j].push(contrast + j * 0.1);
    }
  }
  return contrastArrays.map(arr => (arr.length > 0 ? arr : [0]));
}

function extractChroma(signal: Float32Array, sampleRate: number): number[][] {
  const chromaArrays: number[][] = Array.from({ length: 12 }, () => []);
  for (let i = 0; i < signal.length - BUFFER_SIZE; i += HOP_SIZE) {
    const frame = signal.slice(i, i + BUFFER_SIZE);
    const chroma = (Meyda as any).extract('chroma', frame, { sampleRate, bufferSize: BUFFER_SIZE });
    if (Array.isArray(chroma) && chroma.length === 12) {
      for (let j = 0; j < 12; j++) {
        if (!isNaN(chroma[j])) chromaArrays[j].push(chroma[j]);
      }
    }
  }
  return chromaArrays.map(arr => (arr.length > 0 ? arr : [0]));
}

function estimateTempo(rmsFrames: number[], sampleRate: number): number {
  const frameRate = sampleRate / HOP_SIZE;
  const threshold = mean(rmsFrames) + 0.3 * std(rmsFrames);
  const minSpacing = Math.floor(0.2 * frameRate);
  const onsets: number[] = [];

  for (let i = minSpacing; i < rmsFrames.length - 1; i++) {
    if (
      rmsFrames[i] > threshold &&
      rmsFrames[i] > rmsFrames[i - 1] &&
      rmsFrames[i] > rmsFrames[i + 1] &&
      (onsets.length === 0 || i - onsets[onsets.length - 1] > minSpacing)
    ) {
      onsets.push(i);
    }
  }

  if (onsets.length < 2) return 120;

  const intervals: number[] = [];
  for (let i = 1; i < onsets.length; i++) intervals.push(onsets[i] - onsets[i - 1]);
  intervals.sort((a, b) => a - b);
  const medianInterval = intervals[Math.floor(intervals.length / 2)];

  let tempo = (60 * frameRate) / medianInterval;
  while (tempo > 180) tempo /= 2;
  while (tempo < 80) tempo *= 2;

  return Math.max(60, Math.min(200, Math.round(tempo)));
}

// ---------------------------------------------------------------------------
// Progress helper — posts a message back to the main thread
// ---------------------------------------------------------------------------

function postProgress(percent: number, stage: string): void {
  const msg: WorkerOutboundMessage = { type: 'PROGRESS', percent, stage };
  self.postMessage(msg);
}

// ---------------------------------------------------------------------------
// Main message handler
// ---------------------------------------------------------------------------

self.onmessage = (e: MessageEvent<WorkerInboundMessage>) => {
  if (e.data.type !== 'EXTRACT') return;

  const { signal, sampleRate, duration } = e.data;

  try {
    const features: number[] = [];

    // Pass 1 of 8 — RMS
    postProgress(0, 'Analyzing energy...');
    const rms = extractFramedFeature(signal, sampleRate, 'rms');

    // Pass 2 of 8 — ZCR
    postProgress(14, 'Analyzing texture...');
    const zcr = extractFramedFeature(signal, sampleRate, 'zcr');

    // Pass 3 of 8 — Spectral Centroid
    postProgress(28, 'Analyzing brightness...');
    const centroid = extractFramedFeature(signal, sampleRate, 'spectralCentroid');

    // Pass 4 of 8 — Spectral Rolloff
    postProgress(42, 'Analyzing frequency shape...');
    const rolloff = extractFramedFeature(signal, sampleRate, 'spectralRolloff');

    // Pass 5 of 8 — Spectral Spread
    postProgress(56, 'Analyzing spectral spread...');
    const bandwidth = extractFramedFeature(signal, sampleRate, 'spectralSpread');

    // Pass 6 of 8 — MFCCs (most expensive pass)
    postProgress(64, 'Analyzing timbre...');
    const mfccs = extractMFCCs(signal, sampleRate);

    // Pass 7 of 8 — Spectral Contrast
    postProgress(78, 'Analyzing harmonic contrast...');
    const spectralContrast = extractSpectralContrast(signal, sampleRate);

    // Pass 8 of 8 — Chroma
    postProgress(88, 'Analyzing pitch content...');
    const chroma = extractChroma(signal, sampleRate);

    postProgress(98, 'Assembling features...');

    // Estimate tempo from the RMS series computed above (no extra pass needed)
    const tempo = estimateTempo(rms, sampleRate);

    const timeSeries: FeatureTimeSeries = {
      rms,
      zcr,
      spectralCentroid: centroid,
      spectralRolloff: rolloff,
      tempo,
      sampleRate,
    };

    // --- Build the flat feature vector (same order as Python training pipeline) ---

    // 1. Basic audio properties (4)
    features.push(duration);
    features.push(sampleRate);
    features.push(tempo);
    features.push(Math.round((tempo / 60) * duration));

    // 2. Energy (4)
    features.push(mean(rms));
    features.push(std(rms));
    features.push(rms.reduce((a, b) => Math.max(a, b), -Infinity));
    features.push(mean(zcr));

    // 3. Spectral (4)
    features.push(mean(centroid));
    features.push(std(centroid));
    features.push(mean(rolloff));
    features.push(mean(bandwidth));

    // 4. MFCCs (13)
    for (let i = 0; i < 13; i++) features.push(mean(mfccs[i]));

    // 5. Spectral contrast (7)
    for (let i = 0; i < 7; i++) features.push(mean(spectralContrast[i]));

    // 6. Chroma (12)
    for (let i = 0; i < 12; i++) features.push(mean(chroma[i]));

    console.log(`[worker] ✅ Extracted ${features.length} features`);

    const resultMsg: WorkerOutboundMessage = { type: 'RESULT', features, timeSeries };
    self.postMessage(resultMsg);
  } catch (err) {
    const errorMsg: WorkerOutboundMessage = {
      type: 'ERROR',
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(errorMsg);
  }
};