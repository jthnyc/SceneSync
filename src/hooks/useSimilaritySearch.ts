// Drives the Phase 2 core loop:
//   File drop → decode → extract → similarity search → results
//
// Kept separate from useScenePrediction so the classifier flow stays intact.
// Both hooks share the same extraction pipeline — useScenePrediction then
// hands off to the TF.js classifier; this one hands off to similarityService.

import { useState, useCallback } from 'react';
import { extractBrowserCompatibleFeatures } from '../utils/featureExtraction';
import { similarityService, SimilarityResult } from '../services/similarityService';
import { getErrorMessage } from '../utils/fileValidation';

export interface SimilarityProgressState {
  progress: number;
  stage: string;
}

export interface SimilarityErrorState {
  message: string;
  canRetry: boolean;
}

export const useSimilaritySearch = () => {
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SimilarityResult[] | null>(null);
  const [error, setError] = useState<SimilarityErrorState | null>(null);
  const [progressState, setProgressState] = useState<SimilarityProgressState>({
    progress: 0,
    stage: '',
  });

  const findSimilar = useCallback(async (audioFile: File) => {
    setIsSearching(true);
    setError(null);
    setResults(null);
    setProgressState({ progress: 0, stage: 'Loading audio...' });

    try {
      // Stage 1 — Read
      setProgressState({ progress: 5, stage: 'Loading audio...' });
      const arrayBuffer = await audioFile.arrayBuffer();

      // Stage 2 — Decode
      setProgressState({ progress: 15, stage: 'Decoding audio...' });
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      await audioContext.close();

      // Stage 3 — Extract (worker; progress mapped into 20–80% band)
      setProgressState({ progress: 20, stage: 'Analyzing audio...' });
      const { featureVector } = await extractBrowserCompatibleFeatures(
        audioBuffer,
        (workerPercent: number, workerStage: string) => {
          const mapped = 20 + Math.round(workerPercent * 0.6); // 20..80
          setProgressState({ progress: mapped, stage: workerStage });
        }
      );

      // Stage 4 — Search
      setProgressState({ progress: 85, stage: 'Searching library...' });
      const matches = await similarityService.findSimilar(featureVector, 5);

      // Temporary diagnostic — remove before commit
      console.log('[similarity] query vector sample:', {
        rms: featureVector.rms,
        mfcc_1: featureVector.mfcc_1,
        chroma_1: featureVector.chroma_1,
      });
      console.log('[similarity] top match vector sample:', {
        file: matches[0].file,
        score: matches[0].score,
        rms: matches[0].features.rms,
        mfcc_1: matches[0].features.mfcc_1,
        chroma_1: matches[0].features.chroma_1,
      });

      setProgressState({ progress: 100, stage: 'Done!' });
      setResults(matches);
      setError(null);

    } catch (err) {
      setError({
        message: getErrorMessage(err instanceof Error ? err : String(err)),
        canRetry: true,
      });
    } finally {
      setIsSearching(false);
      setTimeout(() => setProgressState({ progress: 0, stage: '' }), 300);
    }
  }, []);

  const clearResults = useCallback(() => {
    setResults(null);
    setError(null);
  }, []);

  return {
    isSearching,
    results,
    error,
    progressState,
    findSimilar,
    clearResults,
  };
};