# Cross-Source Similarity Gap Investigation

## Overview

Musopen (classical) tracks consistently score lower in similarity against FMA references.
Hypothesis: MFCCs capture recording environment (room acoustics, mic character, mastering)
alongside timbral content, inflating distance between sources.

## Step 1: Per-Dimension Distribution Analysis

**Dataset:** 180 FMA tracks, 63 Musopen tracks (243 total)

**Method:** Cohen's d effect size for each of 90 dimensions — measures how many pooled
standard deviations apart the FMA and Musopen populations are on that dimension.

### Divergence Summary

| Threshold | Count | Interpretation |
|-----------|-------|----------------|
| d > 0.8 (large) | 47 | Recording environment likely dominates |
| 0.5 < d ≤ 0.8 (medium) | 12 | Mixed signal — music + environment |
| 0.2 < d ≤ 0.5 (small) | 15 | Mostly musical differences |
| d ≤ 0.2 (negligible) | 16 | Sources look the same |

### Top 15 Most Divergent Dimensions

| Rank | Dimension | FMA Mean | Musopen Mean | Cohen's d | Direction |
|------|-----------|----------|--------------|-----------|----------|
| 1 | mfcc_1_p25 | 222.956 | 95.819 | 1.979 | FMA higher |
| 2 | rms_p50 | 0.141 | 0.032 | 1.819 | FMA higher |
| 3 | mfcc_1_p50 | 255.879 | 142.144 | 1.796 | FMA higher |
| 4 | rms_p75 | 0.183 | 0.058 | 1.763 | FMA higher |
| 5 | rms_p25 | 0.106 | 0.018 | 1.715 | FMA higher |
| 6 | chroma_4_p25 | 0.444 | 0.270 | 1.402 | FMA higher |
| 7 | chroma_4_p50 | 0.590 | 0.417 | 1.382 | FMA higher |
| 8 | chroma_3_p25 | 0.478 | 0.304 | 1.350 | FMA higher |
| 9 | chroma_2_p25 | 0.447 | 0.289 | 1.314 | FMA higher |
| 10 | chroma_5_p25 | 0.466 | 0.299 | 1.290 | FMA higher |
| 11 | chroma_4_p75 | 0.747 | 0.596 | 1.271 | FMA higher |
| 12 | chroma_2_p50 | 0.593 | 0.440 | 1.254 | FMA higher |
| 13 | mfcc_1_p75 | 285.607 | 203.628 | 1.243 | FMA higher |
| 14 | chroma_1_p25 | 0.450 | 0.297 | 1.210 | FMA higher |
| 15 | chroma_3_p50 | 0.638 | 0.478 | 1.207 | FMA higher |

### Average Effect Size by Feature Group

| Feature Group | Avg d | Max d | Assessment |
|---------------|-------|-------|------------|
| RMS (energy) | 1.766 | 1.819 | Problem |
| ZCR (activity) | 0.131 | 0.205 | Clean |
| Spectral Centroid (brightness) | 0.145 | 0.176 | Clean |
| Spectral Spread (width) | 0.439 | 0.516 | OK |
| Spectral Flatness (texture) | 0.393 | 0.464 | OK |
| MFCCs 1-3 (coarse timbre) | 1.206 | 1.979 | Problem |
| MFCCs 4-7 (mid timbre) | 0.551 | 1.016 | Watch |
| MFCCs 8-10 (fine timbre) | 0.200 | 0.531 | Clean |
| MFCCs 11-13 (finest timbre) | 0.722 | 0.994 | Watch |
| Chroma (harmony) | 0.938 | 1.402 | Problem |

### Data Quality Note

Found 3 NaN values in Musopen data (null in JSON).
- `data/musopen/Musopen DVD/Schubert - The Piano Sonatas/Sonata in A Minor, D. 784 - I. Allegro giusto.mp3` → `centroid_p50`
- `data/musopen/Musopen DVD/Schubert - The Piano Sonatas/Sonata in A Minor, D. 784 - I. Allegro giusto.mp3` → `spread_p50`
- `data/musopen/Musopen DVD/Schubert - The Piano Sonatas/Sonata in A Minor, D. 784 - I. Allegro giusto.mp3` → `flatness_p50`

These were excluded from mean/std calculations via nanmean/nanstd.

---


## Step 2: Dimension Weighting Experiments

**Test set:** 21 FMA reference tracks across 7 genres
**Method:** For each reference, run similarity search under different weighting schemes.
Measure how well Musopen tracks surface in results.

### Results Summary

| Scheme | Active Dims | Avg Musopen Rank | Musopen in Top 5 | FMA Top1 Score | Assessment |
|--------|-------------|-----------------|------------------|----------------|------------|
| BASELINE | 90 | 53.7 | 23.8% | 0.7278 | Baseline |
| DROP_RMS | 87 | 47.3 | 23.8% | 0.7265 | Good improvement |
| DROP_MFCC1 | 87 | 48.3 | 23.8% | 0.7260 | Good improvement |
| DROP_LOUDNESS | 84 | 40.4 | 23.8% | 0.7278 | Strong improvement |
| DOWNWEIGHT_CHROMA | 90 | 49.0 | 14.3% | 0.7614 | Mild improvement |
| DROP_LOUD_DW_CHROMA | 84 | 34.5 | 19.0% | 0.7610 | Strong improvement |
| DROP_LOUD_DW_COARSE | 84 | 32.7 | 23.8% | 0.7641 | Strong improvement |
| KEEP_CORE | 78 | 32.2 | 14.3% | 0.7775 | Strong improvement |

### Key Findings

- Loudness (RMS + MFCC 1) and chroma saturation are the dominant sources of cross-source divergence — not higher-order MFCCs as originally hypothesized
- Dropping loudness dims alone moves avg Musopen rank from 53.7 → 40.4 with zero FMA quality loss
- Combined scheme (DROP_LOUD_DW_COARSE) reaches rank 32.7 with FMA quality *improving* from 0.7278 → 0.7641
- The scheme surfaces real structural similarity (sparse texture, contour) but can promote tracks with very different instrumentation

## Step 3: Ear-Test Ranking Comparison

**Proposed scheme:** DROP_LOUD_DW_COARSE
- Drop: RMS (3 dims), MFCC 1 (3 dims)
- Half-weight: MFCC 2-3 (6 dims), Chroma 1-12 (36 dims)
- Full weight: ZCR, Centroid, Spread, Flatness, MFCCs 4-13

**Test set:** 8 reference tracks (5 FMA, 3 Musopen)

### Ear-Test Results

**FMA 133576 (twangy electric guitar, droning bass) vs Goldberg Variations:**
- Structural similarity is real — sparse notes, simple bass + melody contour
- But instrumentation differs significantly (electric guitar vs quiet piano)
- Not a pairing that would serve the use case (scoring a scene)

**FMA 155066 (Hip-Hop, baseline #1 match) vs 133576:**
- Closer in instrumentation — percussive background, similar energy
- Baseline ranking is correct to prefer this over Goldberg

**Key observation:** The proposed scheme doesn't displace good matches — 155066 stays at rank 1 with a higher score (0.711 → 0.809). Goldberg moved from rank 5 to rank 4, sitting alongside correct matches rather than replacing them.

### Observations

- Chroma at 0.5 is too aggressive — it lets structurally similar but instrumentally different tracks rise too fast
- Chroma at 0.75 is the compromise: still reduces production-density bias but preserves more harmonic/instrument fingerprint
- The scheme is directionally correct but instrumentation similarity has limits that feature vectors alone can't fully solve

## Step 4: Decision

**Implement DROP_LOUD_DW_COARSE with chroma at 0.75.**

Rationale:
- Net positive across the library: FMA quality improves, cross-source ranking improves
- Ear test confirmed structural similarity is real, even when instrumentation differs
- 0.75 chroma weight preserves instrument character better than 0.5
- Change is minimal: one weight array + one parameter added to cosineSimilarity

Separate fix: Schubert Sonata in A Minor (D. 784) has 3 null values at p50 for centroid, spread, flatness. Needs re-extraction or interpolation.