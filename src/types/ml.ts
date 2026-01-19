export interface MLModelConfig {
  name: string;
  version: string;
  inputShape: number[];
  outputClasses: string[];
}

export interface PredictionResult {
  class: string;
  confidence: number;
  features: number[];
  timestamp: number;
}

export interface TrainingData {
  features: number[][];
  labels: number[];
  metadata?: Record<string, any>;
}

// Ensure it's a module
export { };