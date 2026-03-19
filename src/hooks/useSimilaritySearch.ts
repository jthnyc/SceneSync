// Drives the core loop:
//   File drop → decode → extract → similarity search → results
//
// featureVector is stored in state and exposed in the return value
// so useExplanationCache can pass it to the LLM explanation layer.

import { useState, useCallback } from 'react';
import { extractBrowserCompatibleFeatures } from '../utils/featureExtraction';
import { similarityService, SimilarityResult } from '../services/similarityService';
import { getErrorMessage } from '../utils/fileValidation';
import { FeatureVector } from '../workers/featureExtraction.types';

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
  const [featureVector, setFeatureVector] = useState<FeatureVector | null>(null); // Phase 3b
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState<SimilarityErrorState | null>(null);
  const [progressState, setProgressState] = useState<SimilarityProgressState>({
    progress: 0,
    stage: '',
  });

  const findSimilar = useCallback(async (audioFile: File) => {
    setIsSearching(true);
    setError(null);
    setResults(null);
    setFeatureVector(null); // clear previous explanation data on new upload
    setDuration(null);
    setProgressState({ progress: 0, stage: 'Loading audio...' });

    try {
      setProgressState({ progress: 5, stage: 'Loading audio...' });
      const arrayBuffer = await audioFile.arrayBuffer();

      setProgressState({ progress: 15, stage: 'Decoding audio...' });
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      await audioContext.close();
      setDuration(audioBuffer.duration);

      setProgressState({ progress: 20, stage: 'Analyzing audio...' });
      const { featureVector: extractedVector } = await extractBrowserCompatibleFeatures(
        audioBuffer,
        (workerPercent: number, workerStage: string) => {
          const mapped = 20 + Math.round(workerPercent * 0.6);
          setProgressState({ progress: mapped, stage: workerStage });
        }
      );

      setFeatureVector(extractedVector); // Phase 3b: store for explanation layer

      setProgressState({ progress: 85, stage: 'Searching library...' });
      const matches = await similarityService.findSimilar(extractedVector, 5);

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

  const findSimilarFromVector = useCallback(async (vector: FeatureVector) => {
    setIsSearching(true);
    setError(null);
    setResults(null);
    setFeatureVector(vector); // use cached vector directly
    try {
      const matches = await similarityService.findSimilar(vector, 5);
      setResults(matches);
    } catch (err) {
      setError({ message: getErrorMessage(err instanceof Error ? err : String(err)), canRetry: true });
    } finally {
      setIsSearching(false);
      setTimeout(() => setProgressState({ progress: 0, stage: '' }), 300);
    }
  }, []);

  const clearResults = useCallback(() => {
    setResults(null);
    setFeatureVector(null); // clear explanation data alongside results
    setDuration(null);
    setError(null);
  }, []);

  return {
    isSearching,
    results,
    featureVector,  // consumed by TrackExplanation via parent component
    duration,
    error,
    progressState,
    findSimilar,
    findSimilarFromVector,
    clearResults,
  };
};