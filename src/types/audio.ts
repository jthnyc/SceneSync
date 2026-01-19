export interface AudioFile {
  id: string;
  name: string;
  size: number;
  type: string;
  duration?: number;
  url: string;
  uploadedAt: Date;
}

export interface AudioFeatures {
  bpm?: number;
  key?: string;
  energy?: number;
  danceability?: number;
  sceneType?: 'action' | 'romantic' | 'suspense' | 'dramatic' | 'comedy';
  confidence?: number;
}

export interface ScenePrediction {
  type: string;
  confidence: number;
  timestamps?: Array<{start: number; end: number; type: string}>;
}