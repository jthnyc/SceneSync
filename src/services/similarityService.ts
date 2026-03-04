/**
 * Similarity Service
 * Loads the pre-analyzed royalty-free track library and finds the closest
 * matches to a query feature vector using cosine similarity.
 */
import { FeatureVector } from '../workers/featureExtraction.types';

export type { FeatureVector };

export interface LibraryTrack {
  file: string;
  features: FeatureVector;
}

export interface SimilarityResult {
  file: string;
  score: number;
  features: FeatureVector;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function flatten(features: FeatureVector): number[] {
  return [
    ...features.rms,
    ...features.zcr,
    ...features.centroid,
    ...features.spread,
    ...features.flatness,
    ...features.mfcc_1,  ...features.mfcc_2,  ...features.mfcc_3,
    ...features.mfcc_4,  ...features.mfcc_5,  ...features.mfcc_6,
    ...features.mfcc_7,  ...features.mfcc_8,  ...features.mfcc_9,
    ...features.mfcc_10, ...features.mfcc_11, ...features.mfcc_12,
    ...features.mfcc_13,
    ...features.chroma_1,  ...features.chroma_2,  ...features.chroma_3,
    ...features.chroma_4,  ...features.chroma_5,  ...features.chroma_6,
    ...features.chroma_7,  ...features.chroma_8,  ...features.chroma_9,
    ...features.chroma_10, ...features.chroma_11, ...features.chroma_12,
  ];
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
  return magnitude === 0 ? 0 : dot / magnitude;
}

/**
 * Compute per-dimension mean and standard deviation across all library vectors.
 * Used to z-score normalize before cosine comparison.
 */
function computeNormStats(
  vectors: number[][]
): { means: number[]; stds: number[] } {
  const dim = vectors[0].length;
  const means = new Array(dim).fill(0);
  const stds  = new Array(dim).fill(0);

  // Pass 1 — means
  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) means[i] += vec[i];
  }
  for (let i = 0; i < dim; i++) means[i] /= vectors.length;

  // Pass 2 — standard deviations
  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) {
      stds[i] += (vec[i] - means[i]) ** 2;
    }
  }
  for (let i = 0; i < dim; i++) {
    stds[i] = Math.sqrt(stds[i] / vectors.length);
  }

  return { means, stds };
}

/**
 * Apply z-score normalization to a vector.
 * Dimensions with std ≈ 0 (constant across library) are zeroed out —
 * they carry no discriminative information anyway.
 */
function zScore(
  vec: number[],
  means: number[],
  stds: number[],
  EPS = 1e-8
): number[] {
  return vec.map((v, i) =>
    stds[i] < EPS ? 0 : (v - means[i]) / stds[i]
  );
}

// ── Service ───────────────────────────────────────────────────────────────

class SimilarityService {
  private library: LibraryTrack[]    | null = null;
  private normalizedVecs: number[][] | null = null;
  private normMeans: number[]        | null = null;
  private normStds:  number[]        | null = null;
  private isLoaded = false;

  async loadLibrary(libraryPath = '/data/feature_vectors.json'): Promise<void> {
    if (this.isLoaded) return;

    console.log('Loading similarity library from:', libraryPath);
    const response = await fetch(libraryPath);
    if (!response.ok) throw new Error(`Failed to fetch library: ${response.status}`);

    this.library = await response.json();
    console.log(`✅ Similarity library loaded: ${this.library!.length} tracks`);

    const rawVecs = this.library!.map(t => flatten(t.features));
    const { means, stds } = computeNormStats(rawVecs);

    this.normMeans      = means;
    this.normStds       = stds;
    this.normalizedVecs = rawVecs.map(v => zScore(v, means, stds));

    console.log('✅ Normalization stats computed across 90 active dimensions (MFCCs included)');
    this.isLoaded = true;
  }

  async findSimilar(
    queryFeatures: FeatureVector,
    topN = 5
  ): Promise<SimilarityResult[]> {
    if (!this.isLoaded) await this.loadLibrary();
    if (!this.library || !this.normalizedVecs || !this.normMeans || !this.normStds) {
      throw new Error('Library not loaded');
    }

    // Normalize the query vector with the same stats as the library
    const queryVec        = flatten(queryFeatures);
    const queryNormalized = zScore(queryVec, this.normMeans, this.normStds);

    const results: SimilarityResult[] = this.library.map((track, i) => ({
      file:     track.file,
      score:    cosineSimilarity(queryNormalized, this.normalizedVecs![i]),
      features: track.features,
    }));

    return results.sort((a, b) => b.score - a.score).slice(0, topN);
  }

  isLibraryLoaded(): boolean { return this.isLoaded; }
  getLibrarySize():  number  { return this.library?.length ?? 0; }
}

export const similarityService = new SimilarityService();