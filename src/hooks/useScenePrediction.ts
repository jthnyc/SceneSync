import { useState, useCallback } from 'react';
import { mlModelService } from '../services/mlModelService';
import { extractBrowserCompatibleFeatures, FeatureTimeSeries } from '../utils/featureExtraction';

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

// Helper to add small delay for UI updates
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const useScenePrediction = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isPredicting, setIsPredicting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      setError(err instanceof Error ? err.message : 'Failed to load model');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const predictSceneType = useCallback(async (audioFile: File) => {
    if (!isModelLoaded) {
      setError('Model not loaded');
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
      const arrayBuffer = await audioFile.arrayBuffer();
      
      // Stage 2: Decode audio
      setProgressState({ progress: 20, stage: 'Decoding audio...' });
      await delay(150);
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const audioDuration = audioBuffer.duration;

      // Stage 3: Extract features
      setProgressState({ progress: 40, stage: 'Extracting features...' });
      await delay(200);
      const { features, timeSeries } = await extractBrowserCompatibleFeatures(audioBuffer);

      // Stage 4: Classify scene
      setProgressState({ progress: 80, stage: 'Classifying scene...' });
      await delay(150);
      const prediction = await mlModelService.predict(features);

      // Complete
      setProgressState({ progress: 100, stage: 'Complete!' });
      await delay(200);

      const processingTime = performance.now() - startTime;

      setResult({
        ...prediction,
        features,
        timeSeries,
        processingTime,
        audioDuration
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prediction failed');
    } finally {
      setIsPredicting(false);
      // Reset progress after a brief delay
      setTimeout(() => {
        setProgressState({ progress: 0, stage: '' });
      }, 300);
    }
  }, [isModelLoaded]);

  return {
    isLoading,
    isPredicting,
    error,
    result,
    initializeModel,
    predictSceneType,
    isModelLoaded,
    progressState,
  };
};