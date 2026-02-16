// src/workers/featureExtraction.types.ts
//
// Single source of truth for types and constants shared between
// the main thread (featureExtraction.ts) and the worker
// (featureExtraction.worker.ts). Neither file defines these
// independently anymore.

export interface FeatureTimeSeries {
  rms: number[];
  zcr: number[];
  spectralCentroid: number[];
  spectralRolloff: number[];
  tempo: number;
  sampleRate: number;
}

// HOP_SIZE is also imported by FeatureVisualizations to convert
// frame indices → seconds. Keep it here so both the worker and
// the visualizer read from the same value.
export const HOP_SIZE = 512;
export const BUFFER_SIZE = 2048;

// ---------------------------------------------------------------------------
// Worker message protocol
// ---------------------------------------------------------------------------
// Main → Worker: one message type to kick off extraction.
// The signal buffer is transferred (zero-copy) not copied.

export interface ExtractMessage {
  type: 'EXTRACT';
  signal: Float32Array; // transferred, not copied
  sampleRate: number;
  duration: number;
}

// Worker → Main: three possible message types.

export interface ProgressMessage {
  type: 'PROGRESS';
  // 0–100, representing progress through the 8 feature passes
  percent: number;
  // Human-readable label shown in the UI progress bar
  stage: string;
}

export interface ResultMessage {
  type: 'RESULT';
  features: number[];
  timeSeries: FeatureTimeSeries;
}

export interface ErrorMessage {
  type: 'ERROR';
  message: string;
}

export type WorkerInboundMessage = ExtractMessage;
export type WorkerOutboundMessage = ProgressMessage | ResultMessage | ErrorMessage;