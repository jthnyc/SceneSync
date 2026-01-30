import * as tf from "@tensorflow/tfjs";

export interface ScalerParams {
  mean: number[];
  std: number[];
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

            // Load TensorFlow.js model
            this.model = await tf.loadLayersModel(`${modelPath}/tfjs_model/model.json`);
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
            this.sceneTypes = await sceneTypesResponse.json();
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

        // Apply standardization: (x - mean) / std
        return features.map((value, idx) => {
            const mean = this.scaler!.mean[idx];
            const std = this.scaler!.std[idx];
            return (value - mean) / std;
        });
    }

    /**
     * Predict scene type from extracted features
     */
    async predict(features: number[]): Promise<{
        sceneType: string;
        confidence: number;
        probabilities: { [key: string]: number };
    }> {
        if (!this.model || !this.isLoaded) {
            throw new Error('Model not loaded. Call loadModel() first.');
        }

        if (features.length !== 44) {
            throw new Error(`Expected 44 features, got ${features.length}`);
        }

        try {
            // Normalize features
            const normalizedFeatures = this.normalizeFeatures(features);

            // Create tensor and add batch dimension
            const inputTensor = tf.tensor2d([normalizedFeatures], [1, 44]);

            // Run prediction
            const prediction = this.model.predict(inputTensor) as tf.Tensor;
            const probabilities = await prediction.data();

            // Clean up tensors
            inputTensor.dispose();
            prediction.dispose();

            // Get the predicted class
            const maxProb = Math.max(...Array.from(probabilities));
            const predictedIndex = Array.from(probabilities).indexOf(maxProb);
            const sceneType = this.sceneTypes[predictedIndex];

            // Build probabilities object
            const probabilitiesObj: { [key: string]: number } = {};
            this.sceneTypes.forEach((type, idx) => {
                probabilitiesObj[type] = probabilities[idx];
            });

            return {
                sceneType,
                confidence: maxProb,
                probabilities: probabilitiesObj,
            };
        } catch (error) {
            console.error('Prediction failed:', error);
            throw new Error(`Prediction failed: ${error}`);
        }
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

export const mlModelService = new MLModelService();