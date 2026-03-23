/* eslint-disable no-restricted-globals */
// ESLint's no-restricted-globals rule flags `self` because in normal browser
// code it's usually a mistake (window vs self confusion). In a Web Worker,
// `self` is the correct and only global — the disable above is intentional.

import Meyda from 'meyda';
import {
  HOP_SIZE,
  BUFFER_SIZE,
  FeatureVector,
  WorkerInboundMessage,
  WorkerOutboundMessage,
} from './featureExtraction.types';

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
// Meyda operates on fixed-size buffers, so we slide a window across the
// decoded signal and collect one value per frame. The caller reduces these
// per-frame arrays to [p25, p50, p75] percentile snapshots.
function extractFramedFeature(
  signal: Float32Array,
  sampleRate: number,
  featureName: string
): number[] {
  const values: number[] = [];
  for (let i = 0; i < signal.length - BUFFER_SIZE; i += HOP_SIZE) {
    const frame = signal.slice(i, i + BUFFER_SIZE);
    // Cast: Meyda's TS types don't export the static extract() method.
    // The runtime API is stable — this is a typings gap, not a workaround.
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

// ── Progress helper ───────────────────────────────────────────────────────

function postProgress(percent: number, stage: string): void {
  const msg: WorkerOutboundMessage = { type: 'PROGRESS', percent, stage };
  self.postMessage(msg);
}

// ── Main message handler ──────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<WorkerInboundMessage>) => {
  if (e.data.type !== 'EXTRACT') return;

  const { signal, sampleRate } = e.data;

  try {
    // Pass 1 — RMS
    postProgress(0, 'Analyzing energy...');
    const rms = extractFramedFeature(signal, sampleRate, 'rms');

    // Pass 2 — ZCR
    postProgress(14, 'Analyzing texture...');
    const zcr = extractFramedFeature(signal, sampleRate, 'zcr');

    // Pass 3 — Spectral Centroid
    postProgress(28, 'Analyzing brightness...');
    const centroid = extractFramedFeature(signal, sampleRate, 'spectralCentroid');

    // Pass 4 — Spectral Spread
    postProgress(42, 'Analyzing spectral spread...');
    const spread = extractFramedFeature(signal, sampleRate, 'spectralSpread');

    // Pass 5 — Spectral Flatness
    postProgress(56, 'Analyzing tonal texture...');
    const flatness = extractFramedFeature(signal, sampleRate, 'spectralFlatness');

    // Pass 6 — MFCCs (most expensive)
    postProgress(68, 'Analyzing timbre...');
    const mfccs = extractMFCCs(signal, sampleRate);

    // Pass 7 — Chroma
    postProgress(88, 'Analyzing pitch content...');
    const chroma = extractChroma(signal, sampleRate);

    postProgress(98, 'Assembling features...');

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

    console.log('[worker] ✅ Extracted featureVector (90 values)');

    const resultMsg: WorkerOutboundMessage = {
      type: 'RESULT',
      featureVector,
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