/**
 * Similarity Service
 * Loads the pre-analyzed royalty-free track library and finds the closest
 * matches to a query feature vector using cosine similarity.
 */
import { FeatureVector } from '../workers/featureExtraction.types';

export type { FeatureVector }; // re-export so existing imports from here still work

export interface LibraryTrack {
  file: string;
  features: FeatureVector;
}

export interface SimilarityResult {
  file: string;
  score: number;          // cosine similarity, 0–1 (higher = closer match)
  features: FeatureVector; // full vector — needed for Phase 3 explanation layer
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Flatten a FeatureVector into a single array of 90 numbers.
 * Order must be consistent between query and library vectors.
 */
function flatten(features: FeatureVector): number[] {
  return [
    ...features.rms,
    ...features.zcr,
    ...features.centroid,
    ...features.spread,
    ...features.flatness,
    ...features.mfcc_1,
    ...features.mfcc_2,
    ...features.mfcc_3,
    ...features.mfcc_4,
    ...features.mfcc_5,
    ...features.mfcc_6,
    ...features.mfcc_7,
    ...features.mfcc_8,
    ...features.mfcc_9,
    ...features.mfcc_10,
    ...features.mfcc_11,
    ...features.mfcc_12,
    ...features.mfcc_13,
    ...features.chroma_1,
    ...features.chroma_2,
    ...features.chroma_3,
    ...features.chroma_4,
    ...features.chroma_5,
    ...features.chroma_6,
    ...features.chroma_7,
    ...features.chroma_8,
    ...features.chroma_9,
    ...features.chroma_10,
    ...features.chroma_11,
    ...features.chroma_12,
  ];
}

/**
 * Cosine similarity between two vectors.
 * Returns a value between 0 (completely different) and 1 (identical).
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
  if (magnitude === 0) return 0;

  return dot / magnitude;
}

// ── Service ───────────────────────────────────────────────────────────────────

class SimilarityService {
  private library: LibraryTrack[] | null = null;
  private isLoaded = false;

  /**
   * Load the curated track library from public/data/feature_vectors.json.
   * Lazy — only fetches on first call, then caches in memory.
   */
  async loadLibrary(libraryPath = '/data/feature_vectors.json'): Promise<void> {
    if (this.isLoaded) return;

    try {
      console.log('Loading similarity library from:', libraryPath);
      const response = await fetch(libraryPath);

      if (!response.ok) {
        throw new Error(`Failed to fetch library: ${response.status}`);
      }

      this.library = await response.json();
      this.isLoaded = true;
      console.log(`✅ Similarity library loaded: ${this.library!.length} tracks`);
    } catch (error) {
      console.error('Failed to load similarity library:', error);
      throw new Error(`Library loading failed: ${error}`);
    }
  }

  /**
   * Find the closest matching tracks in the library to a query feature vector.
   * Returns top N results sorted by similarity score (highest first).
   */
  async findSimilar(
    queryFeatures: FeatureVector,
    topN = 5
  ): Promise<SimilarityResult[]> {
    if (!this.isLoaded) await this.loadLibrary();
    if (!this.library || this.library.length === 0) {
      throw new Error('Library is empty or not loaded');
    }

    const queryVector = flatten(queryFeatures);

    const results: SimilarityResult[] = this.library.map((track) => ({
      file: track.file,
      score: cosineSimilarity(queryVector, flatten(track.features)),
      features: track.features,
    }));

    // Sort by score descending, return top N
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  }

  /**
   * Check if the library is loaded
   */
  isLibraryLoaded(): boolean {
    return this.isLoaded;
  }

  /**
   * Return the number of tracks in the library
   */
  getLibrarySize(): number {
    return this.library?.length ?? 0;
  }
}

// Singleton instance — matches pattern of mlModelService and audioStorage
export const similarityService = new SimilarityService();