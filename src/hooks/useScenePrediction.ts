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

// Helper to add small delay for UI updates
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
      setError({
        message: errorMessage,
        type: 'model',
        canRetry: true,
      });
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
      // Stage 1: Load audio file
      setProgressState({ progress: 10, stage: 'Loading audio...' });
      await delay(100);
      
      let arrayBuffer: ArrayBuffer;
      try {
        arrayBuffer = await audioFile.arrayBuffer();
      } catch (err) {
        throw new Error('Failed to read audio file. The file may be corrupted.');
      }
      
      // Stage 2: Decode audio
      setProgressState({ progress: 20, stage: 'Decoding audio...' });
      await delay(150);
      
      let audioContext: AudioContext;
      let audioBuffer: AudioBuffer;
      try {
        audioContext = new AudioContext();
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      } catch (err) {
        throw new Error('Failed to decode audio. Please ensure the file is a valid audio format.');
      }
      
      // Capture audio duration
      const audioDuration = audioBuffer.duration;

      // Validate audio duration
      if (audioDuration === 0 || !isFinite(audioDuration)) {
        throw new Error('Audio file appears to be empty or corrupted.');
      }

      // Stage 3: Extract features
      setProgressState({ progress: 40, stage: 'Extracting features...' });
      await delay(200);
      
      let features: number[];
      let timeSeries: FeatureTimeSeries;
      try {
        const result = await extractBrowserCompatibleFeatures(audioBuffer);
        features = result.features;
        timeSeries = result.timeSeries;
      } catch (err) {
        throw new Error('Failed to analyze audio features. The audio format may not be supported.');
      }

      // Stage 4: Classify scene
      setProgressState({ progress: 80, stage: 'Classifying scene...' });
      await delay(150);
      
      let prediction: any;
      try {
        prediction = await mlModelService.predict(features);
      } catch (err) {
        throw new Error('AI classification failed. Please try again.');
      }

      // Complete
      setProgressState({ progress: 100, stage: 'Complete!' });
      await delay(200);

      const processingTime = performance.now() - startTime;

      setResult({
        ...prediction,
        features,
        timeSeries,
        processingTime,
        audioDuration,
      });

      // Clear any previous errors
      setError(null);
    } catch (err) {
      const errorMessage = getErrorMessage(err instanceof Error ? err : String(err));
      
      // Determine error type
      let errorType: ErrorType = 'unknown';
      const errStr = String(err);
      if (errStr.includes('decode') || errStr.includes('format')) {
        errorType = 'audio';
      } else if (errStr.includes('network') || errStr.includes('fetch')) {
        errorType = 'network';
      } else if (errStr.includes('feature') || errStr.includes('extract')) {
        errorType = 'audio';
      }

      setError({
        message: errorMessage,
        type: errorType,
        canRetry: true,
      });
    } finally {
      setIsPredicting(false);
      // Reset progress after a brief delay
      setTimeout(() => {
        setProgressState({ progress: 0, stage: '' });
      }, 300);
    }
  }, [isModelLoaded]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const retryPrediction = useCallback((audioFile: File) => {
    clearError();
    predictSceneType(audioFile);
  }, [clearError, predictSceneType]);

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