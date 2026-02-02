import * as tf from '@tensorflow/tfjs';

export interface ScalerParams {
  mean: number[];
  scale: number[];
}

export interface ModelAssets {
  model: tf.LayersModel;
  scaler: ScalerParams;
  featureNames: string[];
  sceneTypes: string[];
}

class MLModelService {
  private model: tf.LayersModel | null = null;
  private scaler: ScalerParams | null = null;
  private featureNames: string[] = [];
  private sceneTypes: string[] = [];
  private isLoaded = false;

  /**
   * Load the TensorFlow.js model and associated metadata
   * Model files in /public/models/
   */
  async loadModel(modelPath = '/models'): Promise<void> {
    if (this.isLoaded) {
      console.log('Model already loaded');
      return;
    }

    try {
      console.log('Loading model from:', modelPath);

      // Load TensorFlow.js model with strict=false to handle Keras 3 format
      this.model = await tf.loadLayersModel(`${modelPath}/tfjs_model/model.json`, {
        strict: false
      });
      console.log('✅ Model loaded');

      // Load scaler parameters
      const scalerResponse = await fetch(`${modelPath}/scaler_params.json`);
      this.scaler = await scalerResponse.json();
      console.log('✅ Scaler parameters loaded');

      // Load feature names
      const featuresResponse = await fetch(`${modelPath}/feature_names.json`);
      this.featureNames = await featuresResponse.json();
      console.log('✅ Feature names loaded:', this.featureNames.length);

      // Load scene types
      const sceneTypesResponse = await fetch(`${modelPath}/scene_types.json`);
      const sceneTypesData = await sceneTypesResponse.json();
      this.sceneTypes = sceneTypesData.classes;
      console.log('✅ Scene types loaded:', this.sceneTypes);

      this.isLoaded = true;
    } catch (error) {
      console.error('Failed to load model:', error);
      throw new Error(`Model loading failed: ${error}`);
    }
  }

  /**
   * Normalize features using scaler parameters from training
   */
  private normalizeFeatures(features: number[]): number[] {
  if (!this.scaler) {
    throw new Error('Scaler not loaded');
  }

  if (features.length !== this.scaler.mean.length) {
    throw new Error(
      `Feature length mismatch: got ${features.length}, expected ${this.scaler.mean.length}`
    );
  }

  // Apply standardization: (x - mean) / scale
  return features.map((value, idx) => {
    const mean = this.scaler!.mean[idx];
    const scale = this.scaler!.scale[idx];  // Changed from std to scale
    return (value - mean) / scale;
  });
}

  /**
   * Predict scene type from extracted features
   */
  /**
 * Rule-based prediction (MVP fallback)
 * Uses tempo, energy, and spectral features to classify
 */
 async predict(features: number[]): Promise<{
    sceneType: string;
    confidence: number;
    probabilities: { [key: string]: number };
 }> {
  if (features.length !== 44) {
    throw new Error(`Expected 44 features, got ${features.length}`);
  }

  // Extract key features for classification
  const tempo = features[2];           // tempo
  const rms_mean = features[4];        // energy/loudness
  const rms_std = features[5];         // energy variation
  const spectral_centroid = features[8]; // brightness

  // Simple rule-based classification
  let sceneType: string;
  let scores: { [key: string]: number } = {
    "Action & Intensity": 0,
    "Ambiance & Texture": 0,
    "Drama & Emotional": 0,
    "Montage & Narrative": 0
  };

  // Action & Intensity: Fast tempo + high energy
  scores["Action & Intensity"] = 
    (tempo > 130 ? 40 : 0) +
    (rms_mean > 0.12 ? 30 : 0) +
    (spectral_centroid > 2000 ? 30 : 0);

  // Ambiance & Texture: Low energy + low variation
  scores["Ambiance & Texture"] = 
    (rms_mean < 0.08 ? 40 : 0) +
    (rms_std < 0.04 ? 30 : 0) +
    (tempo < 100 ? 30 : 0);

  // Drama & Emotional: Medium tempo + high variation
  scores["Drama & Emotional"] = 
    (tempo >= 80 && tempo <= 120 ? 30 : 0) +
    (rms_std > 0.05 ? 40 : 0) +
    (spectral_centroid < 1800 ? 30 : 0);

  // Montage & Narrative: Moderate everything
  scores["Montage & Narrative"] = 
    (tempo >= 100 && tempo <= 140 ? 40 : 0) +
    (rms_mean >= 0.08 && rms_mean <= 0.12 ? 30 : 0) +
    (rms_std >= 0.03 && rms_std <= 0.06 ? 30 : 0);

  // Find winner
  const maxScore = Math.max(...Object.values(scores));
  sceneType = Object.keys(scores).find(key => scores[key] === maxScore) || "Montage & Narrative";

  // Convert scores to probabilities (normalize to sum to 1)
  const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
  const probabilities: { [key: string]: number } = {};
  Object.keys(scores).forEach(key => {
    probabilities[key] = scores[key] / total;
  });

  return {
    sceneType,
    confidence: maxScore / 100,
    probabilities
  };
}

  /**
   * Get the list of expected feature names
   */
  getFeatureNames(): string[] {
    return [...this.featureNames];
  }

  /**
   * Get the list of scene types
   */
  getSceneTypes(): string[] {
    return [...this.sceneTypes];
  }

  /**
   * Check if model is loaded
   */
  isModelLoaded(): boolean {
    return this.isLoaded;
  }
}

// Singleton instance
export const mlModelService = new MLModelService();