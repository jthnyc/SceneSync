import { FeatureVector } from "../workers/featureExtraction.types";

export interface AudioFile {
  id: string;
  name: string;
  size: number;
  type: string;
  duration?: number;
  url: string;
  uploadedAt: Date;
}

// Track with IndexedDB support
export interface AnalyzedTrack {
  id: string;
  fileName: string;
  fileSize: number;
  duration?: number;
  timestamp: number;
  hasStoredAudio: boolean;
  analyzedAt: number;
  featureVector?: FeatureVector;
}

// UI state types
export interface ProgressStage {
  stage: 'loading' | 'extracting' | 'predicting' | 'complete';
  progress: number;
  message: string;
}

export type ErrorType = 'model' | 'audio' | 'network' | 'validation' | 'storage';

export interface AppError {
  type: ErrorType;
  message: string;
  detail?: string;
}

// Simple AudioFeatures for contexts (if needed)
export interface AudioFeatures {
  bpm?: number;
  key?: string;
  energy?: number;
  danceability?: number;
}