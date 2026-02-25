export interface FeatureTimeSeries {
  rms: number[];
  zcr: number[];
  spectralCentroid: number[];
  spectralRolloff: number[];
  tempo: number;
  sampleRate: number;
}

export const HOP_SIZE = 512;
export const BUFFER_SIZE = 2048;

// ── Feature vector schema (locked Feb 23, 2026) ───────────────────────────
// 7 features × 3 percentile snapshots (p25/p50/p75) = 90 values per track.
// Moving this here so the worker can construct it and similarityService
// can import it — neither owns it exclusively.

export interface FeatureVector {
  rms:      [number, number, number];
  zcr:      [number, number, number];
  centroid: [number, number, number];
  spread:   [number, number, number];
  flatness: [number, number, number];
  mfcc_1:  [number, number, number];
  mfcc_2:  [number, number, number];
  mfcc_3:  [number, number, number];
  mfcc_4:  [number, number, number];
  mfcc_5:  [number, number, number];
  mfcc_6:  [number, number, number];
  mfcc_7:  [number, number, number];
  mfcc_8:  [number, number, number];
  mfcc_9:  [number, number, number];
  mfcc_10: [number, number, number];
  mfcc_11: [number, number, number];
  mfcc_12: [number, number, number];
  mfcc_13: [number, number, number];
  chroma_1:  [number, number, number];
  chroma_2:  [number, number, number];
  chroma_3:  [number, number, number];
  chroma_4:  [number, number, number];
  chroma_5:  [number, number, number];
  chroma_6:  [number, number, number];
  chroma_7:  [number, number, number];
  chroma_8:  [number, number, number];
  chroma_9:  [number, number, number];
  chroma_10: [number, number, number];
  chroma_11: [number, number, number];
  chroma_12: [number, number, number];
}

// ── Worker message protocol ───────────────────────────────────────────────

export interface ExtractMessage {
  type: 'EXTRACT';
  signal: Float32Array;
  sampleRate: number;
  duration: number;
}

export interface ProgressMessage {
  type: 'PROGRESS';
  percent: number;
  stage: string;
}

export interface ResultMessage {
  type: 'RESULT';
  features: number[];        // flat 44-value vector — kept for classifier
  featureVector: FeatureVector; // percentile snapshot — for similarity search
  timeSeries: FeatureTimeSeries;
}

export interface ErrorMessage {
  type: 'ERROR';
  message: string;
}

export type WorkerInboundMessage = ExtractMessage;
export type WorkerOutboundMessage = ProgressMessage | ResultMessage | ErrorMessage;