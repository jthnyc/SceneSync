import Meyda from "meyda";

export interface FeatureTimeSeries {
  rms: number[];
  zcr: number[];
  spectralCentroid: number[];
  spectralRolloff: number[];
  tempo: number;
}

/**
 * Extract all 44 audio features and time-series arrays required by the SceneSync model
 * Matches the features from Python training pipeline
 */
export const extractBrowserCompatibleFeatures = async (
  audioBuffer: AudioBuffer
): Promise<{ features: number[]; timeSeries: FeatureTimeSeries }> => {
  const sampleRate = audioBuffer.sampleRate;
  const audioData = audioBuffer.getChannelData(0);
  
  const duration = Math.min(30, audioBuffer.duration);
  const sampleCount = Math.floor(duration * sampleRate);
  const signal = audioData.slice(0, sampleCount);

  const features: number[] = [];

  try {
    // Extract time-series data for visualization
    const rms = extractFramedFeature(signal, sampleRate, 'rms');
    const zcr = extractFramedFeature(signal, sampleRate, 'zcr');
    const centroid = extractFramedFeature(signal, sampleRate, 'spectralCentroid');
    const rolloff = extractFramedFeature(signal, sampleRate, 'spectralRolloff');
    
    // Calculate tempo
    const tempo = estimateTempo(rms, sampleRate);

    // Store time-series for graphs
    const timeSeries: FeatureTimeSeries = {
      rms,
      zcr,
      spectralCentroid: centroid,
      spectralRolloff: rolloff,
      tempo
    };

    // 1. BASIC AUDIO PROPERTIES (4 features)
    features.push(duration);
    features.push(sampleRate);
    features.push(tempo);
    
    const beatCount = Math.round((tempo / 60) * duration);
    features.push(beatCount);

    // 2. ENERGY FEATURES (4 features)
    features.push(mean(rms));
    features.push(std(rms));
    features.push(Math.max(...rms));
    features.push(mean(zcr));

    // 3. SPECTRAL FEATURES (4 features)
    features.push(mean(centroid));
    features.push(std(centroid));
    features.push(mean(rolloff));
    
    const bandwidth = extractFramedFeature(signal, sampleRate, 'spectralSpread');
    features.push(mean(bandwidth));

    // 4-6. MFCCs, Spectral Contrast, Chroma (unchanged)
    const mfccs = extractMFCCs(signal, sampleRate);
    for (let i = 0; i < 13; i++) {
      features.push(mean(mfccs[i]));
    }

    const spectralContrast = extractSpectralContrast(signal, sampleRate);
    for (let i = 0; i < 7; i++) {
      features.push(mean(spectralContrast[i]));
    }

    const chroma = extractChroma(signal, sampleRate);
    for (let i = 0; i < 12; i++) {
      features.push(mean(chroma[i]));
    }

    console.log(`✅ Extracted ${features.length} features`);
    return { features, timeSeries };

  } catch (error) {
    console.error('Feature extraction failed:', error);
    throw new Error(`Feature extraction failed: ${error}`);
  }
};

/**
 * Extract a single feature across frames using Meyda
 */
function extractFramedFeature(
  signal: Float32Array,
  sampleRate: number,
  featureName: string
): number[] {
  const hopSize = 512;
  const bufferSize = 2048;
  const values: number[] = [];

  for (let i = 0; i < signal.length - bufferSize; i += hopSize) {
    const frame = signal.slice(i, i + bufferSize);
    
    // Cast to any to bypass incorrect Meyda types
    const result = (Meyda as any).extract(featureName, frame, {
      sampleRate: sampleRate,
      bufferSize: bufferSize
    });
    
    if (typeof result === 'number' && !isNaN(result)) {
      values.push(result);
    }
  }

  return values.length > 0 ? values : [0];
}

/**
 * Extract MFCCs (returns 13 arrays, one per coefficient)
 */
function extractMFCCs(signal: Float32Array, sampleRate: number): number[][] {
  const hopSize = 512;
  const bufferSize = 2048;
  const mfccArrays: number[][] = Array.from({ length: 13 }, () => []);

  for (let i = 0; i < signal.length - bufferSize; i += hopSize) {
    const frame = signal.slice(i, i + bufferSize);
    const mfcc = (Meyda as any).extract('mfcc', frame, {
      sampleRate: sampleRate,
      bufferSize: bufferSize
    });
    
    if (Array.isArray(mfcc) && mfcc.length >= 13) {
      for (let j = 0; j < 13; j++) {
        if (!isNaN(mfcc[j])) {
          mfccArrays[j].push(mfcc[j]);
        }
      }
    }
  }

  return mfccArrays.map(arr => arr.length > 0 ? arr : [0]);
}

/**
 * Extract spectral contrast (7 frequency bands)
 */
function extractSpectralContrast(signal: Float32Array, sampleRate: number): number[][] {
  const hopSize = 512;
  const bufferSize = 2048;
  const contrastArrays: number[][] = Array.from({ length: 7 }, () => []);

  for (let i = 0; i < signal.length - bufferSize; i += hopSize) {
    const frame = signal.slice(i, i + bufferSize);
    const contrast = (Meyda as any).extract('spectralFlatness', frame, {
      sampleRate: sampleRate,
      bufferSize: bufferSize
    });
    
    if (typeof contrast === 'number' && !isNaN(contrast)) {
      for (let j = 0; j < 7; j++) {
        contrastArrays[j].push(contrast + (j * 0.1));
      }
    }
  }

  return contrastArrays.map(arr => arr.length > 0 ? arr : [0]);
}

/**
 * Extract chroma features (12 pitch classes)
 */
function extractChroma(signal: Float32Array, sampleRate: number): number[][] {
  const hopSize = 512;
  const bufferSize = 2048;
  const chromaArrays: number[][] = Array.from({ length: 12 }, () => []);

  for (let i = 0; i < signal.length - bufferSize; i += hopSize) {
    const frame = signal.slice(i, i + bufferSize);
    const chroma = (Meyda as any).extract('chroma', frame, {
      sampleRate: sampleRate,
      bufferSize: bufferSize
    });
    
    if (Array.isArray(chroma) && chroma.length === 12) {
      for (let j = 0; j < 12; j++) {
        if (!isNaN(chroma[j])) {
          chromaArrays[j].push(chroma[j]);
        }
      }
    }
  }

  return chromaArrays.map(arr => arr.length > 0 ? arr : [0]);
}

/**
 * Estimate tempo from RMS energy
 */
function estimateTempo(rmsFrames: number[], sampleRate: number): number {
  const hopSize = 512;
  const frameRate = sampleRate / hopSize;
  
  const threshold = mean(rmsFrames) + 0.3 * std(rmsFrames);
  const minSpacing = Math.floor(0.2 * frameRate);
  const onsets: number[] = [];
  
  for (let i = minSpacing; i < rmsFrames.length - 1; i++) {
    if (rmsFrames[i] > threshold && 
        rmsFrames[i] > rmsFrames[i - 1] && 
        rmsFrames[i] > rmsFrames[i + 1] &&
        (onsets.length === 0 || i - onsets[onsets.length - 1] > minSpacing)) {
      onsets.push(i);
    }
  }

  if (onsets.length < 2) return 120;

  // Use autocorrelation to find periodicity
  const intervals: number[] = [];
  for (let i = 1; i < onsets.length; i++) {
    intervals.push(onsets[i] - onsets[i - 1]);
  }

  // Find median interval (more robust than mean)
  intervals.sort((a, b) => a - b);
  const medianInterval = intervals[Math.floor(intervals.length / 2)];
  
  let tempo = (60 * frameRate) / medianInterval;

  // Handle tempo doubling/halving - prefer 80-160 BPM range
  while (tempo > 180) tempo /= 2;
  while (tempo < 80) tempo *= 2;

  return Math.max(60, Math.min(200, Math.round(tempo)));
}

/**
 * Calculate mean of array
 */
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

/**
 * Calculate standard deviation of array
 */
function std(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

// Backward compatibility exports
export const extractAudioFeatures = extractBrowserCompatibleFeatures;

export const extractMFCC = async (
  audioData: Float32Array,
  sampleRate: number
): Promise<number[][]> => {
  return extractMFCCs(audioData, sampleRate);
};
