import { FeatureVector } from "../workers/featureExtraction.types";

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
  referenceExplanation?: string;
  matchExplanations?: Record<string, string>;
}