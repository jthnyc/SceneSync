import { useState, useCallback } from 'react';
import { mlModelService } from '../services/mlModelService';
import { extractBrowserCompatibleFeatures } from '../utils/featureExtraction';

export interface PredictionResult {
  sceneType: string;
  confidence: number;
  probabilities: { [key: string]: number };
  features: number[];
  processingTime: number;
}

export interface PredictionState {
  isLoading: boolean;
  isPredicting: boolean;
  error: string | null;
  result: PredictionResult | null;
}

/**
 * Hook for scene type prediction
 * Handles: model loading → feature extraction → prediction
 */
export const useScenePrediction = () => {
  const [state, setState] = useState<PredictionState>({
    isLoading: false,
    isPredicting: false,
    error: null,
    result: null,
  });

  /**
   * Initialize the ML model (call once on app startup)
   */
  const initializeModel = useCallback(async () => {
    if (mlModelService.isModelLoaded()) {
      console.log('Model already initialized');
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      await mlModelService.loadModel('/models');
      console.log('✅ Model initialized successfully');
      setState(prev => ({ ...prev, isLoading: false }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load model';
      console.error('Model initialization failed:', errorMessage);
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: errorMessage 
      }));
    }
  }, []);

  /**
   * Predict scene type from an audio file
   */
  const predictSceneType = useCallback(async (file: File): Promise<PredictionResult | null> => {
    setState(prev => ({ ...prev, isPredicting: true, error: null, result: null }));

    const startTime = performance.now();

    try {
      // 1. Decode audio file
      console.log('📁 Loading audio file:', file.name);
      const arrayBuffer = await file.arrayBuffer();
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      console.log('✅ Audio decoded:', audioBuffer.duration.toFixed(2), 'seconds');

      // 2. Extract features
      console.log('🔍 Extracting features...');
      const features = await extractBrowserCompatibleFeatures(audioBuffer);
      console.log('✅ Features extracted:', features.length);

      // 3. Run prediction
      console.log('🤖 Running prediction...');
      const prediction = await mlModelService.predict(features);
      
      const processingTime = performance.now() - startTime;
      
      const result: PredictionResult = {
        ...prediction,
        features,
        processingTime,
      };

      console.log('✅ Prediction complete:', result.sceneType, `(${(result.confidence * 100).toFixed(1)}%)`);
      console.log(`⏱️  Processing time: ${processingTime.toFixed(0)}ms`);

      setState(prev => ({ 
        ...prev, 
        isPredicting: false, 
        result 
      }));

      // Clean up
      audioContext.close();

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Prediction failed';
      console.error('Prediction error:', errorMessage);
      
      setState(prev => ({ 
        ...prev, 
        isPredicting: false, 
        error: errorMessage,
        result: null
      }));

      return null;
    }
  }, []);

  /**
   * Reset prediction state
   */
  const reset = useCallback(() => {
    setState({
      isLoading: false,
      isPredicting: false,
      error: null,
      result: null,
    });
  }, []);

  return {
    ...state,
    initializeModel,
    predictSceneType,
    reset,
    isModelLoaded: mlModelService.isModelLoaded(),
  };
};