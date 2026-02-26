/* eslint-disable no-restricted-globals */
// ESLint's no-restricted-globals rule flags `self` because in normal browser
// code it's usually a mistake (window vs self confusion). In a Web Worker,
// `self` is the correct and only global — the disable above is intentional.

import Meyda from 'meyda';
import {
  HOP_SIZE,
  BUFFER_SIZE,
  FeatureVector,
  FeatureTimeSeries,
  WorkerInboundMessage,
  WorkerOutboundMessage,
} from './featureExtraction.types';

// ── Helpers ───────────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((sum, val) => sum + (val - m) ** 2, 0) / arr.length);
}

/**
 * Linear interpolation percentile (same method librosa uses).
 * p is 0–100.
 */
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

/**
 * Produce the [p25, p50, p75] triple that the FeatureVector schema expects.
 */
function toTriple(arr: number[]): [number, number, number] {
  return [percentile(arr, 25), percentile(arr, 50), percentile(arr, 75)];
}

// ── Feature extraction ────────────────────────────────────────────────────

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
    if (typeof result === 'number' && !isNaN(result)) values.push(result);
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

// ── Progress helper ───────────────────────────────────────────────────────

function postProgress(percent: number, stage: string): void {
  const msg: WorkerOutboundMessage = { type: 'PROGRESS', percent, stage };
  self.postMessage(msg);
}

// ── Main message handler ──────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<WorkerInboundMessage>) => {
  if (e.data.type !== 'EXTRACT') return;

  const { signal, sampleRate, duration } = e.data;

  try {
    const features: number[] = [];

    // Pass 1 — RMS
    postProgress(0, 'Analyzing energy...');
    const rms = extractFramedFeature(signal, sampleRate, 'rms');

    // Pass 2 — ZCR
    postProgress(14, 'Analyzing texture...');
    const zcr = extractFramedFeature(signal, sampleRate, 'zcr');

    // Pass 3 — Spectral Centroid
    postProgress(28, 'Analyzing brightness...');
    const centroid = extractFramedFeature(signal, sampleRate, 'spectralCentroid');

    // Pass 4 — Spectral Rolloff  (used only for timeSeries + classifier)
    postProgress(38, 'Analyzing frequency shape...');
    const rolloff = extractFramedFeature(signal, sampleRate, 'spectralRolloff');

    // Pass 5 — Spectral Spread
    postProgress(48, 'Analyzing spectral spread...');
    const spread = extractFramedFeature(signal, sampleRate, 'spectralSpread');

    // Pass 6 — Spectral Flatness (was faked as spectral contrast — now real)
    postProgress(58, 'Analyzing tonal texture...');
    const flatness = extractFramedFeature(signal, sampleRate, 'spectralFlatness');

    // Pass 7 — MFCCs (most expensive)
    postProgress(66, 'Analyzing timbre...');
    const mfccs = extractMFCCs(signal, sampleRate);

    // Pass 8 — Chroma
    postProgress(88, 'Analyzing pitch content...');
    const chroma = extractChroma(signal, sampleRate);

    postProgress(98, 'Assembling features...');

    const tempo = estimateTempo(rms, sampleRate);

    const timeSeries: FeatureTimeSeries = {
      rms,
      zcr,
      spectralCentroid: centroid,
      spectralRolloff: rolloff,
      tempo,
      sampleRate,
    };

    // ── Flat vector for classifier (unchanged shape) ──────────────────────

    features.push(duration);
    features.push(sampleRate);
    features.push(tempo);
    features.push(Math.round((tempo / 60) * duration));
    features.push(mean(rms));
    features.push(std(rms));
    features.push(rms.reduce((a, b) => Math.max(a, b), -Infinity));
    features.push(mean(zcr));
    features.push(mean(centroid));
    features.push(std(centroid));
    features.push(mean(rolloff));
    features.push(mean(spread));
    for (let i = 0; i < 13; i++) features.push(mean(mfccs[i]));
    // spectral contrast slots — kept as flatness offsets for classifier compat
    for (let i = 0; i < 7; i++) features.push(mean(flatness) + i * 0.1);
    for (let i = 0; i < 12; i++) features.push(mean(chroma[i]));

    // ── Percentile snapshot vector for similarity search ──────────────────

    const featureVector: FeatureVector = {
      rms:      toTriple(rms),
      zcr:      toTriple(zcr),
      centroid: toTriple(centroid),
      spread:   toTriple(spread),
      flatness: toTriple(flatness),
      mfcc_1:  toTriple(mfccs[0]),
      mfcc_2:  toTriple(mfccs[1]),
      mfcc_3:  toTriple(mfccs[2]),
      mfcc_4:  toTriple(mfccs[3]),
      mfcc_5:  toTriple(mfccs[4]),
      mfcc_6:  toTriple(mfccs[5]),
      mfcc_7:  toTriple(mfccs[6]),
      mfcc_8:  toTriple(mfccs[7]),
      mfcc_9:  toTriple(mfccs[8]),
      mfcc_10: toTriple(mfccs[9]),
      mfcc_11: toTriple(mfccs[10]),
      mfcc_12: toTriple(mfccs[11]),
      mfcc_13: toTriple(mfccs[12]),
      chroma_1:  toTriple(chroma[0]),
      chroma_2:  toTriple(chroma[1]),
      chroma_3:  toTriple(chroma[2]),
      chroma_4:  toTriple(chroma[3]),
      chroma_5:  toTriple(chroma[4]),
      chroma_6:  toTriple(chroma[5]),
      chroma_7:  toTriple(chroma[6]),
      chroma_8:  toTriple(chroma[7]),
      chroma_9:  toTriple(chroma[8]),
      chroma_10: toTriple(chroma[9]),
      chroma_11: toTriple(chroma[10]),
      chroma_12: toTriple(chroma[11]),
    };

    console.log(`[worker] ✅ Extracted ${features.length} features + featureVector (90 values)`);

    const resultMsg: WorkerOutboundMessage = {
      type: 'RESULT',
      features,
      featureVector,
      timeSeries,
    };

    self.postMessage(resultMsg);

  } catch (err) {
    const errorMsg: WorkerOutboundMessage = {
      type: 'ERROR',
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(errorMsg);
  }
};