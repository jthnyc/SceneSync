/**
 * Branch: feat/cross-source-weighting
 * 
 * Changes from current:
 *   1. Add DIMENSION_WEIGHTS array (DROP_LOUD_DW_COARSE scheme)
 *   2. Apply weights in cosineSimilarity before dot product
 *   3. Apply weights in z-score normalization (zero-weighted dims get zeroed)
 * 
 * What this does:
 *   - Drops RMS (3 dims) and MFCC 1 (3 dims) — these encode loudness/production level
 *   - Half-weights MFCC 2-3 (6 dims) — coarse spectral shape, partially production-dependent
 *   - Half-weights all Chroma (36 dims) — harmonic saturation varies by production style
 *   - Full weight on everything else: ZCR, Centroid, Spread, Flatness, MFCCs 4-13
 * 
 * What this preserves:
 *   - FMA-to-FMA match quality (actually improves slightly)
 *   - Within-Musopen ranking coherence
 * 
 * What this improves:
 *   - Musopen tracks move from avg rank ~54 to ~33 when searched from FMA references
 *   - Musopen score improves from 0.31 to 0.44
 *   - Cross-source matches surface when musically warranted
 * 
 * ─────────────────────────────────────────────────────────────────────
 * 
 * IMPLEMENTATION NOTES:
 * 
 * The weight array follows the same flatten order as the existing code:
 *   [rms×3, zcr×3, centroid×3, spread×3, flatness×3,
 *    mfcc_1×3, mfcc_2×3, ..., mfcc_13×3,
 *    chroma_1×3, chroma_2×3, ..., chroma_12×3]
 * 
 * Only two functions change: cosineSimilarity and the normalization step.
 * The flatten() function stays exactly the same.
 */

import { FeatureVector } from '../workers/featureExtraction.types';
import { audioStorage } from './audioStorageService';

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

// ── Dimension Weights ─────────────────────────────────────────────────────
// 
// DROP_LOUD_DW_COARSE scheme from cross-source investigation.
// See scripts/INVESTIGATION_NOTES.md for methodology and results.

const DIMENSION_WEIGHTS: number[] = [
  // rms (3) — DROPPED: encodes production loudness, not musical character
  0, 0, 0,
  // zcr (3) — full weight: source-agnostic (d < 0.2)
  1, 1, 1,
  // centroid (3) — full weight: source-agnostic (d < 0.2)
  1, 1, 1,
  // spread (3) — full weight
  1, 1, 1,
  // flatness (3) — full weight
  1, 1, 1,
  // mfcc_1 (3) — DROPPED: correlates with loudness in cepstral domain
  0, 0, 0,
  // mfcc_2 (3) — half weight: coarse spectral shape, partially production-dependent
  0.5, 0.5, 0.5,
  // mfcc_3 (3) — half weight: coarse spectral shape
  0.5, 0.5, 0.5,
  // mfcc_4 through mfcc_13 (30) — full weight: timbral character, least source-dependent
  1, 1, 1,  // mfcc_4
  1, 1, 1,  // mfcc_5
  1, 1, 1,  // mfcc_6
  1, 1, 1,  // mfcc_7
  1, 1, 1,  // mfcc_8
  1, 1, 1,  // mfcc_9
  1, 1, 1,  // mfcc_10
  1, 1, 1,  // mfcc_11
  1, 1, 1,  // mfcc_12
  1, 1, 1,  // mfcc_13
  // chroma_1 through chroma_12 (36) — 0.75 weight: reduces production-density bias
  // while preserving harmonic/instrument character (0.5 was too aggressive per ear test)
  0.75, 0.75, 0.75,  // chroma_1
  0.75, 0.75, 0.75,  // chroma_2
  0.75, 0.75, 0.75,  // chroma_3
  0.75, 0.75, 0.75,  // chroma_4
  0.75, 0.75, 0.75,  // chroma_5
  0.75, 0.75, 0.75,  // chroma_6
  0.75, 0.75, 0.75,  // chroma_7
  0.75, 0.75, 0.75,  // chroma_8
  0.75, 0.75, 0.75,  // chroma_9
  0.75, 0.75, 0.75,  // chroma_10
  0.75, 0.75, 0.75,  // chroma_11
  0.75, 0.75, 0.75,  // chroma_12
];

// ── Helpers ───────────────────────────────────────────────────────────────

function flatten(features: FeatureVector): number[] {
  // UNCHANGED from current implementation
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

// CHANGED: accepts weights parameter
function cosineSimilarity(a: number[], b: number[], weights: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    const wa = a[i] * weights[i];
    const wb = b[i] * weights[i];
    dot  += wa * wb;
    magA += wa * wa;
    magB += wb * wb;
  }
  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
  return magnitude === 0 ? 0 : dot / magnitude;
}

function computeNormStats(
  vectors: number[][]
): { means: number[]; stds: number[] } {
  // UNCHANGED
  const dim = vectors[0].length;
  const means = new Array(dim).fill(0);
  const stds  = new Array(dim).fill(0);

  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) means[i] += vec[i];
  }
  for (let i = 0; i < dim; i++) means[i] /= vectors.length;

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

function zScore(
  vec: number[],
  means: number[],
  stds: number[],
  EPS = 1e-8
): number[] {
  // UNCHANGED — zero-weighted dims still get z-scored, but cosineSimilarity
  // will ignore them via the weight multiplication. This keeps the 
  // normalization stats stable regardless of weighting scheme.
  return vec.map((v, i) =>
    stds[i] < EPS ? 0 : (v - means[i]) / stds[i]
  );
}

// ── Service ───────────────────────────────────────────────────────────────

// Bump this when you update public/data/feature_vectors.json
const LIBRARY_VERSION = 'v1-243';
class SimilarityService {
  private library: LibraryTrack[]    | null = null;
  private normalizedVecs: number[][] | null = null;
  private normMeans: number[]        | null = null;
  private normStds:  number[]        | null = null;
  private isLoaded = false;

  async loadLibrary(libraryPath = '/data/feature_vectors.json'): Promise<void> {
    if (this.isLoaded) return;

    // Try IndexedDB cache first
    try {
      const cached = await audioStorage.getLibraryCache(LIBRARY_VERSION);
      if (cached) {
        this.library = cached;
        console.log(`✅ Similarity library loaded from cache: ${cached.length} tracks`);
      }
    } catch (err) {
      console.warn('Library cache read failed, falling back to network:', err);
    }

    // Fall back to network fetch
    if (!this.library) {
      console.log('Fetching similarity library from:', libraryPath);
      const response = await fetch(libraryPath);
      if (!response.ok) throw new Error(`Failed to fetch library: ${response.status}`);

      this.library = await response.json();
      console.log(`✅ Similarity library fetched: ${this.library!.length} tracks`);

      // Cache for next visit (fire-and-forget — don't block on this)
      audioStorage.setLibraryCache(LIBRARY_VERSION, this.library!).catch(err =>
        console.warn('Failed to cache library:', err)
      );
    }

    // Normalize (same as before, runs regardless of source)
    const rawVecs = this.library!.map(t => flatten(t.features));
    const { means, stds } = computeNormStats(rawVecs);

    this.normMeans      = means;
    this.normStds       = stds;
    this.normalizedVecs = rawVecs.map(v => zScore(v, means, stds));

    const activeDims = DIMENSION_WEIGHTS.filter(w => w > 0).length;
    const fullWeight = DIMENSION_WEIGHTS.filter(w => w === 1).length;
    const halfWeight = DIMENSION_WEIGHTS.filter(w => w === 0.5).length;
    const dropped    = DIMENSION_WEIGHTS.filter(w => w === 0).length;
    console.log(`✅ Normalization computed. Weights: ${fullWeight} full, ${halfWeight} half, ${dropped} dropped (${activeDims}/90 active)`);

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

    const queryVec        = flatten(queryFeatures);
    const queryNormalized = zScore(queryVec, this.normMeans, this.normStds);

    // CHANGED: pass DIMENSION_WEIGHTS to cosineSimilarity
    const results: SimilarityResult[] = this.library.map((track, i) => ({
      file:     track.file,
      score:    cosineSimilarity(queryNormalized, this.normalizedVecs![i], DIMENSION_WEIGHTS),
      features: track.features,
    }));

    return results.sort((a, b) => b.score - a.score).slice(0, topN);
  }

  isLibraryLoaded(): boolean { return this.isLoaded; }
  getLibrarySize():  number  { return this.library?.length ?? 0; }
}

export const similarityService = new SimilarityService();