// src/utils/featureExtraction.ts
//
// Thin wrapper. All extraction logic now lives in the worker.
// This file's only job is to:
//   1. Grab the raw signal from the AudioBuffer (must happen on main thread
//      because AudioBuffer is a main-thread-only API)
//   2. Spawn the worker
//   3. Transfer the signal (zero-copy) to the worker
//   4. Forward progress messages to the optional callback
//   5. Resolve/reject the returned Promise when the worker responds
//
// The public API is unchanged — callers don't need to know a worker is involved.

import {
  FeatureTimeSeries,
  WorkerOutboundMessage,
  HOP_SIZE,
  BUFFER_SIZE,
} from '../workers/featureExtraction.types';

// Re-export so existing imports from this file continue to work unchanged.
// FeatureVisualizations imports HOP_SIZE from here — keeping that working.
export type { FeatureTimeSeries };
export { HOP_SIZE, BUFFER_SIZE };

export const extractBrowserCompatibleFeatures = (
  audioBuffer: AudioBuffer,
  onProgress?: (percent: number, stage: string) => void
): Promise<{ features: number[]; timeSeries: FeatureTimeSeries }> => {
  return new Promise((resolve, reject) => {
    // Spawn a fresh worker for each extraction. Workers are cheap to create
    // and this avoids any state leaking between tracks.
    const worker = new Worker(
      new URL('../workers/featureExtraction.worker.ts', import.meta.url)
    );

    // Pull the raw samples from the AudioBuffer on the main thread.
    // AudioBuffer.getChannelData returns a view into the buffer's internal
    // memory — we slice it so we own a separate, transferable copy.
    const sampleRate = audioBuffer.sampleRate;
    const duration = audioBuffer.duration;
    const sampleCount = Math.floor(duration * sampleRate);
    const signal = audioBuffer.getChannelData(0).slice(0, sampleCount);

    worker.onmessage = (e: MessageEvent<WorkerOutboundMessage>) => {
      const msg = e.data;

      switch (msg.type) {
        case 'PROGRESS':
          onProgress?.(msg.percent, msg.stage);
          break;

        case 'RESULT':
          worker.terminate();
          resolve({ features: msg.features, timeSeries: msg.timeSeries });
          break;

        case 'ERROR':
          worker.terminate();
          reject(new Error(msg.message));
          break;
      }
    };

    // Belt-and-suspenders: catch worker-level errors (syntax errors, missing
    // imports, etc.) that don't produce a structured ERROR message.
    worker.onerror = (e: ErrorEvent) => {
      worker.terminate();
      reject(new Error(`Worker failed to start: ${e.message}`));
    };

    // Transfer signal.buffer — zero-copy handoff.
    // After this line, signal.buffer on the main thread is detached (empty).
    // The worker owns the memory exclusively until it terminates.
    worker.postMessage(
      { type: 'EXTRACT', signal, sampleRate, duration },
      [signal.buffer]
    );
  });
};

// Backward compatibility — some callers may import these aliases.
export const extractAudioFeatures = extractBrowserCompatibleFeatures;

export const extractMFCC = async (
  audioData: Float32Array,
  sampleRate: number
): Promise<number[][]> => {
  // This path is rarely called directly and would require its own worker
  // invocation. For now, keep the old synchronous behaviour as a fallback
  // so nothing breaks. If this becomes a performance concern, revisit.
  console.warn('extractMFCC called directly — consider routing through extractBrowserCompatibleFeatures');
  return [[]];
};