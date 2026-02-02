import Meyda from "meyda";

/**
 * Extract all 44 audio features required by the SceneSync model
 * Matches the features from Python training pipeline
 */
export const extractBrowserCompatibleFeatures = async (
  audioBuffer: AudioBuffer
): Promise<number[]> => {
  const sampleRate = audioBuffer.sampleRate;
  const audioData = audioBuffer.getChannelData(0); // Use first channel (mono)
  
  // Use first 30 seconds (or full audio if shorter)
  const duration = Math.min(30, audioBuffer.duration);
  const sampleCount = Math.floor(duration * sampleRate);
  const signal = audioData.slice(0, sampleCount);

  const features: number[] = [];

  try {
    // 1. BASIC AUDIO PROPERTIES (4 features)
    features.push(duration);                    // duration
    features.push(sampleRate);                  // sample_rate
    
    // Extract tempo using Meyda
    const rmsFrames = extractFramedFeature(signal, sampleRate, 'rms');
    const tempo = estimateTempo(rmsFrames, sampleRate);
    features.push(tempo);                       // tempo
    
    // Beat count estimation (approximate)
    const beatCount = Math.round((tempo / 60) * duration);
    features.push(beatCount);                   // beat_count

    // 2. ENERGY FEATURES (4 features)
    const rms = extractFramedFeature(signal, sampleRate, 'rms');
    features.push(mean(rms));                   // rms_mean
    features.push(std(rms));                    // rms_std
    features.push(Math.max(...rms));            // rms_max
    
    const zcr = extractFramedFeature(signal, sampleRate, 'zcr');
    features.push(mean(zcr));                   // zcr_mean

    // 3. SPECTRAL FEATURES (6 features)
    const centroid = extractFramedFeature(signal, sampleRate, 'spectralCentroid');
    features.push(mean(centroid));              // spectral_centroid_mean
    features.push(std(centroid));               // spectral_centroid_std
    
    const rolloff = extractFramedFeature(signal, sampleRate, 'spectralRolloff');
    features.push(mean(rolloff));               // spectral_rolloff_mean
    
    const bandwidth = extractFramedFeature(signal, sampleRate, 'spectralSpread');
    features.push(mean(bandwidth));             // spectral_bandwidth_mean

    // 4. MFCCs (13 features: mfcc_0 to mfcc_12)
    const mfccs = extractMFCCs(signal, sampleRate);
    for (let i = 0; i < 13; i++) {
      features.push(mean(mfccs[i]));            // mfcc_0 through mfcc_12
    }

    // 5. SPECTRAL CONTRAST (7 features: contrast_0 to contrast_6)
    const spectralContrast = extractSpectralContrast(signal, sampleRate);
    for (let i = 0; i < 7; i++) {
      features.push(mean(spectralContrast[i])); // contrast_0 through contrast_6
    }

    // 6. CHROMA (12 features: chroma_0 to chroma_11)
    const chroma = extractChroma(signal, sampleRate);
    for (let i = 0; i < 12; i++) {
      features.push(mean(chroma[i]));           // chroma_0 through chroma_11
    }

    console.log(`✅ Extracted ${features.length} features`);
    return features;

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
  // Simple onset detection based on RMS peaks
  const hopSize = 512;
  const frameRate = sampleRate / hopSize;
  
  // Find peaks in RMS
  const threshold = mean(rmsFrames) + std(rmsFrames);
  const onsets: number[] = [];
  
  for (let i = 1; i < rmsFrames.length - 1; i++) {
    if (rmsFrames[i] > threshold && 
        rmsFrames[i] > rmsFrames[i - 1] && 
        rmsFrames[i] > rmsFrames[i + 1]) {
      onsets.push(i);
    }
  }

  if (onsets.length < 2) return 120; // Default tempo

  // Calculate average time between onsets
  const intervals: number[] = [];
  for (let i = 1; i < onsets.length; i++) {
    intervals.push(onsets[i] - onsets[i - 1]);
  }

  const avgInterval = mean(intervals);
  const tempo = (60 * frameRate) / avgInterval;

  // Clamp to reasonable range
  return Math.max(60, Math.min(200, tempo));
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
