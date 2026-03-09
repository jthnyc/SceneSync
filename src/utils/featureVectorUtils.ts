import type { FeatureVector } from '../workers/featureExtraction.types';

const conversionCache = new Map<string, FeatureVector | undefined>();

export function flattenToFeatureVector(flattened: number[]): FeatureVector | undefined {
  if (!flattened) {
    console.error('❌ No features provided');
    return undefined;
  }

  // Create a cache key from the array
  const cacheKey = flattened.join(',');
  if (conversionCache.has(cacheKey)) {
    return conversionCache.get(cacheKey);
  }

  console.log('🔄 Converting flattened features, length:', flattened.length);

  // Handle 44-dimension features (legacy classifier)
  if (flattened.length === 44) {
    console.log('📊 Using legacy 44-dimension features');
    const result = {
      rms: [flattened[0] ?? 0, flattened[1] ?? 0, flattened[2] ?? 0] as [number, number, number],
      zcr: [flattened[3] ?? 0, flattened[4] ?? 0, flattened[5] ?? 0] as [number, number, number],
      centroid: [flattened[6] ?? 0, flattened[7] ?? 0, flattened[8] ?? 0] as [number, number, number],
      spread: [flattened[9] ?? 0, flattened[10] ?? 0, flattened[11] ?? 0] as [number, number, number],
      flatness: [flattened[12] ?? 0, flattened[13] ?? 0, flattened[14] ?? 0] as [number, number, number],
      mfcc_1: [0,0,0] as [number, number, number],
      mfcc_2: [0,0,0] as [number, number, number],
      mfcc_3: [0,0,0] as [number, number, number],
      mfcc_4: [0,0,0] as [number, number, number],
      mfcc_5: [0,0,0] as [number, number, number],
      mfcc_6: [0,0,0] as [number, number, number],
      mfcc_7: [0,0,0] as [number, number, number],
      mfcc_8: [0,0,0] as [number, number, number],
      mfcc_9: [0,0,0] as [number, number, number],
      mfcc_10: [0,0,0] as [number, number, number],
      mfcc_11: [0,0,0] as [number, number, number],
      mfcc_12: [0,0,0] as [number, number, number],
      mfcc_13: [0,0,0] as [number, number, number],
      chroma_1: [0,0,0] as [number, number, number],
      chroma_2: [0,0,0] as [number, number, number],
      chroma_3: [0,0,0] as [number, number, number],
      chroma_4: [0,0,0] as [number, number, number],
      chroma_5: [0,0,0] as [number, number, number],
      chroma_6: [0,0,0] as [number, number, number],
      chroma_7: [0,0,0] as [number, number, number],
      chroma_8: [0,0,0] as [number, number, number],
      chroma_9: [0,0,0] as [number, number, number],
      chroma_10: [0,0,0] as [number, number, number],
      chroma_11: [0,0,0] as [number, number, number],
      chroma_12: [0,0,0] as [number, number, number],
    };
    conversionCache.set(cacheKey, result);
    return result;
  }

  // Handle 90-dimension features (new similarity search)
  if (flattened.length === 90) {
    try {
      const slice = (start: number): [number, number, number] => [
        flattened[start],
        flattened[start + 1],
        flattened[start + 2]
      ];

      const result = {
        rms: slice(0),
        zcr: slice(3),
        centroid: slice(6),
        spread: slice(9),
        flatness: slice(12),
        mfcc_1: slice(15),
        mfcc_2: slice(18),
        mfcc_3: slice(21),
        mfcc_4: slice(24),
        mfcc_5: slice(27),
        mfcc_6: slice(30),
        mfcc_7: slice(33),
        mfcc_8: slice(36),
        mfcc_9: slice(39),
        mfcc_10: slice(42),
        mfcc_11: slice(45),
        mfcc_12: slice(48),
        mfcc_13: slice(51),
        chroma_1: slice(54),
        chroma_2: slice(57),
        chroma_3: slice(60),
        chroma_4: slice(63),
        chroma_5: slice(66),
        chroma_6: slice(69),
        chroma_7: slice(72),
        chroma_8: slice(75),
        chroma_9: slice(78),
        chroma_10: slice(81),
        chroma_11: slice(84),
        chroma_12: slice(87),
      };
      conversionCache.set(cacheKey, result);
      return result;
    } catch (e) {
      console.error('❌ Failed to convert 90-dim features:', e);
      conversionCache.set(cacheKey, undefined);
      return undefined;
    }
  }

  console.error(`❌ Unexpected feature dimension: ${flattened.length}`);
  conversionCache.set(cacheKey, undefined);
  return undefined;
}

// Optional: reverse conversion if needed
export function featureVectorToFlattened(vector: FeatureVector): number[] {
  return [
    ...vector.rms,
    ...vector.zcr,
    ...vector.centroid,
    ...vector.spread,
    ...vector.flatness,
    ...vector.mfcc_1,
    ...vector.mfcc_2,
    ...vector.mfcc_3,
    ...vector.mfcc_4,
    ...vector.mfcc_5,
    ...vector.mfcc_6,
    ...vector.mfcc_7,
    ...vector.mfcc_8,
    ...vector.mfcc_9,
    ...vector.mfcc_10,
    ...vector.mfcc_11,
    ...vector.mfcc_12,
    ...vector.mfcc_13,
    ...vector.chroma_1,
    ...vector.chroma_2,
    ...vector.chroma_3,
    ...vector.chroma_4,
    ...vector.chroma_5,
    ...vector.chroma_6,
    ...vector.chroma_7,
    ...vector.chroma_8,
    ...vector.chroma_9,
    ...vector.chroma_10,
    ...vector.chroma_11,
    ...vector.chroma_12,
  ];
}