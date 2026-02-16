// src/hooks/useScenePrediction.ts
//
// Changes from previous version:
//
//   1. extractBrowserCompatibleFeatures now receives an onProgress callback.
//      The worker emits 0–100 across the 8 feature passes; we map that into
//      the 40–80% band this stage already occupies, so the progress bar
//      moves smoothly instead of sitting frozen for several seconds.
//
//   2. audioContext.close() is called after decoding. AudioContext holds
//      system audio resources and browsers cap how many a page can open.
//      Without close(), every analysed track leaks one context permanently.

import { useState, useCallback } from 'react';
import { mlModelService } from '../services/mlModelService';
import { extractBrowserCompatibleFeatures, FeatureTimeSeries } from '../utils/featureExtraction';
import { getErrorMessage } from '../utils/fileValidation';

export interface PredictionResult {
  sceneType: string;
  confidence: number;
  probabilities: { [key: string]: number };
  features: number[];
  timeSeries: FeatureTimeSeries;
  processingTime: number;
  audioDuration: number;
}

export interface ProgressState {
  progress: number;
  stage: string;
}

export type ErrorType = 'model' | 'audio' | 'network' | 'validation' | 'unknown';

export interface ErrorState {
  message: string;
  type: ErrorType;
  canRetry: boolean;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const useScenePrediction = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isPredicting, setIsPredicting] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [progressState, setProgressState] = useState<ProgressState>({ progress: 0, stage: '' });

  const initializeModel = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await mlModelService.loadModel('/models');
      setIsModelLoaded(true);
    } catch (err) {
      const errorMessage = getErrorMessage(err instanceof Error ? err : String(err));
      setError({ message: errorMessage, type: 'model', canRetry: true });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const predictSceneType = useCallback(async (audioFile: File) => {
    if (!isModelLoaded) {
      setError({
        message: 'AI model not loaded. Please wait or refresh the page.',
        type: 'model',
        canRetry: false,
      });
      return;
    }

    setIsPredicting(true);
    setError(null);
    setProgressState({ progress: 0, stage: 'Loading audio...' });
    const startTime = performance.now();

    try {
      // Stage 1 — Read file
      setProgressState({ progress: 10, stage: 'Loading audio...' });
      await delay(100);

      let arrayBuffer: ArrayBuffer;
      try {
        arrayBuffer = await audioFile.arrayBuffer();
      } catch {
        throw new Error('Failed to read audio file. The file may be corrupted.');
      }

      // Stage 2 — Decode audio
      setProgressState({ progress: 20, stage: 'Decoding audio...' });
      await delay(150);

      let audioContext: AudioContext;
      let audioBuffer: AudioBuffer;
      try {
        audioContext = new AudioContext();
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // ✅ FIX: release system audio resources immediately after decoding.
        // We only needed the context to decode — we don't play anything through it.
        await audioContext.close();
      } catch {
        throw new Error('Failed to decode audio. Please ensure the file is a valid audio format.');
      }

      const audioDuration = audioBuffer.duration;

      if (audioDuration === 0 || !isFinite(audioDuration)) {
        throw new Error('Audio file appears to be empty or corrupted.');
      }

      // Stage 3 — Extract features (worker runs here; progress updates arrive
      // via the onProgress callback and are mapped into the 40–80% band)
      setProgressState({ progress: 40, stage: 'Analyzing audio...' });

      let features: number[];
      let timeSeries: FeatureTimeSeries;
      try {
        const extractionResult = await extractBrowserCompatibleFeatures(
          audioBuffer,
          // Worker emits 0–100 across the 8 passes.
          // We map that linearly into the 40–80% band so the bar advances
          // steadily throughout extraction rather than jumping at the end.
          (workerPercent: number, workerStage: string) => {
            const mapped = 40 + Math.round(workerPercent * 0.4); // 40 + (0..100)*0.4 = 40..80
            setProgressState({ progress: mapped, stage: workerStage });
          }
        );
        features = extractionResult.features;
        timeSeries = extractionResult.timeSeries;
      } catch {
        throw new Error('Failed to analyze audio features. The audio format may not be supported.');
      }

      // Stage 4 — Classify
      setProgressState({ progress: 80, stage: 'Classifying scene...' });
      await delay(150);

      let prediction: any;
      try {
        prediction = await mlModelService.predict(features);
      } catch {
        throw new Error('AI classification failed. Please try again.');
      }

      // Done
      setProgressState({ progress: 100, stage: 'Complete!' });
      await delay(200);

      const processingTime = performance.now() - startTime;

      setResult({ ...prediction, features, timeSeries, processingTime, audioDuration });
      setError(null);

    } catch (err) {
      const errorMessage = getErrorMessage(err instanceof Error ? err : String(err));

      let errorType: ErrorType = 'unknown';
      const errStr = String(err);
      if (errStr.includes('decode') || errStr.includes('format')) errorType = 'audio';
      else if (errStr.includes('network') || errStr.includes('fetch')) errorType = 'network';
      else if (errStr.includes('feature') || errStr.includes('extract')) errorType = 'audio';

      setError({ message: errorMessage, type: errorType, canRetry: true });
    } finally {
      setIsPredicting(false);
      setTimeout(() => setProgressState({ progress: 0, stage: '' }), 300);
    }
  }, [isModelLoaded]);

  const clearError = useCallback(() => setError(null), []);

  const retryPrediction = useCallback(
    (audioFile: File) => {
      clearError();
      predictSceneType(audioFile);
    },
    [clearError, predictSceneType]
  );

  return {
    isLoading,
    isPredicting,
    error,
    result,
    initializeModel,
    predictSceneType,
    isModelLoaded,
    progressState,
    clearError,
    retryPrediction,
  };
};