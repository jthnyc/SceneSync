import { useState, useCallback } from 'react';
import { mlModelService } from '../services/mlModelService';
import { extractBrowserCompatibleFeatures, FeatureTimeSeries } from '../utils/featureExtraction';

export interface PredictionResult {
  sceneType: string;
  confidence: number;
  probabilities: { [key: string]: number };
  features: number[];
  timeSeries: FeatureTimeSeries;  // Add this
  processingTime: number;
}

export const useScenePrediction = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isPredicting, setIsPredicting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);

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
    const startTime = performance.now();

    try {
      // Decode audio file
      const arrayBuffer = await audioFile.arrayBuffer();
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Extract features and time-series
      const { features, timeSeries } = await extractBrowserCompatibleFeatures(audioBuffer);

      // Get prediction
      const prediction = await mlModelService.predict(features);

      const processingTime = performance.now() - startTime;

      setResult({
        ...prediction,
        features,
        timeSeries,  // Add this
        processingTime,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prediction failed');
    } finally {
      setIsPredicting(false);
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
  };
};