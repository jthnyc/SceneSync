# NaN Extraction Bug — Investigation Notes

**Date:** April 14, 2026
**Status:** Root cause identified, fix scoped as `fix/extraction-nan`
**Scripts:** `scripts/investigation/analyze_percentile_spreads.py`, `scripts/investigation/diagnose_extraction.js`

---

## Summary

The library contained two tracks with mathematically-impossible percentile values — p25 greater than p75 — for spectral shape features (centroid, spread, flatness). Investigation traced the root cause to a `NaN != null` JavaScript footgun in `scripts/pipeline/extract_features.js`. The `!= null` guard used to filter invalid feature values does not catch `NaN`, which Meyda produces for silent or near-silent frames. The NaN values enter the percentile accumulator, corrupt the subsequent sort (JavaScript's `Array.sort` cannot order NaN deterministically), and land unpredictably in the sorted array — producing percentile outputs that violate `p25 ≤ p50 ≤ p75`.

Only 2 tracks were flagged by strict ordering validation, but the bug affects any track with silent frames. The percentile values for those tracks are subtly wrong even when they don't cross the ordering threshold.

---

## How the bug was surfaced

The investigation began as a library spread analysis for the `feat/causal-explanations` work. The question was whether within-track percentile spread (`p75 - p25`) could serve as a reliability signal when sending raw values to the LLM.

The analysis script (`analyze_percentile_spreads.py`) reported negative minimum spreads for centroid (-2.542), spread (-1.714), and flatness (-0.010) in Section 1. Spread is computed as `p75 - p25`; a negative spread is only possible if p25 > p75, which is mathematically impossible for a correct percentile computation.

Follow-up Section 5 (data quality check) identified two tracks:

- **Schubert D.784** (`musopen/Musopen DVD/Schubert - The Piano Sonatas/Sonata in A Minor, D. 784 - I. Allegro giusto.mp3`)
  - centroid: `[29.9943, 28.7235, 27.4526]` — strictly decreasing
  - spread: `[27.8489, 26.9918, 26.1347]` — strictly decreasing
  - flatness: `[0.0690, 0.0639, 0.0588]` — strictly decreasing
  - MFCCs and chroma clean.

- **The Reins — "Blue Deer"** (`youtube/batch2/The Reins - Blue Deer.mp3`)
  - centroid: `[69.9506, 89.9603, 74.5489]` — p50 higher than both p25 and p75
  - Other features clean.

The two different breakage patterns suggested either two unrelated bugs, or one bug expressing differently depending on where NaN values landed in the sorted array.

---

## Root cause

### The guard
`extract_features.js` uses a null check when pushing per-frame feature values to percentile accumulators:

```javascript
if (feats.spectralCentroid != null) acc.spectralCentroid.push(feats.spectralCentroid);
```

In JavaScript, `NaN != null` evaluates to `true`. The guard does not reject NaN values.

### The sort
`percentileSnapshot()` sorts values ascending before computing percentiles:

```javascript
const sorted = [...frames].sort((a, b) => a - b);
```

JavaScript's `Array.sort` with a comparator that returns NaN (which `a - b` does when either operand is NaN) does not produce a well-defined order. NaN values stay approximately where they started in the input array, which means they can end up at the p25, p50, or p75 index depending on where the NaN-producing frames occurred in the track.

### The interaction
For tracks with a large number of NaN frames all clustered in time (e.g. a long silent intro), the NaN values tend to cluster in the sorted output and can end up at p50 or later, producing out-of-order results. For tracks with a few scattered NaN frames, the NaN values may or may not cross a percentile boundary — often they land harmlessly in positions that don't affect p25/p50/p75 but still represent incorrect values.

### Why only spectral shape features
NaN values are produced by Meyda when a frame has insufficient spectral energy to compute shape features. For a completely silent frame or a frame with all-zero magnitude spectrum:

- **Centroid** — weighted mean of bin frequencies, weighted by magnitude. Sum-of-magnitudes is zero → divide by zero → NaN.
- **Spread** — weighted variance around the centroid. Same divide-by-zero.
- **Flatness** — geometric mean divided by arithmetic mean of the spectrum. Division by zero when arithmetic mean is zero.

Time-domain features (RMS, ZCR) work directly on the signal, not the spectrum, and produce 0 (not NaN) for silent frames. MFCCs and chroma involve enough smoothing that silent frames typically don't propagate NaN either.

---

## Measurement

`diagnose_extraction.js` re-extracts the target tracks using Meyda config identical to `extract_features.js`, counts NaN values in each per-frame accumulator before percentile computation, and compares re-extracted values to library values.

### Schubert D.784
- Total frames: 45,573
- Centroid NaN frames: 336 (0.74% of frames)
- Spread NaN frames: 336
- Flatness NaN frames: 336
- MFCC / chroma NaN: 0
- Re-extracted centroid: `[29.9943, NaN, 27.4526]` — NaN landed at p50
- Library centroid: `[29.9943, 28.7235, 27.4526]` — p50 replaced with midpoint interpolation (Schubert patch from v2-373-patch1)

The Schubert patch correctly identified the NaN p50 and interpolated, but did not detect that p25 > p75 was already wrong.

### The Reins — "Blue Deer"
- Total frames: 17,014
- Centroid NaN frames: 25 (0.15% of frames)
- Spread NaN frames: 25
- Flatness NaN frames: 25
- MFCC / chroma NaN: 0
- Re-extracted centroid: `[69.9506, 89.9603, 74.5489]` — NaN landed between p25 and p75, in the p50 slot
- Library centroid: `[69.9506, 89.9603, 74.5489]` — exact match with re-extraction

Blue Deer was not patched because its p50 is a number, not `null`. However, the number is 89.9603 (a NaN that got treated as a numerically large value by the sort in this case, or a misplaced p75 value — the exact mechanism depends on V8's implementation of the sort). The library value is reproducibly wrong.

### Determinism
Re-extraction produced values identical to the library for Blue Deer (and would for Schubert without the patch). The bug is deterministic — same input produces same broken output. Not a race condition, not an environment issue.

---

## Scope beyond the two flagged tracks

Strict ordering validation (p25 > p50 or p50 > p75) caught only these two tracks. This is a detection threshold, not a scope measurement. The actual scope of affected tracks is larger:

- Every track with silent frames has NaN values pushed into centroid/spread/flatness accumulators.
- Most Musopen tracks have silent frames (rests, breath between movements, intro/outro silence).
- Many FMA and YouTube tracks have some silent frames (fade-ins, fade-outs, breakdowns).
- Only tracks where NaN lands at an exact percentile index (or adjacent to one, in a way that shifts it) produce measurably wrong values.
- Tracks where NaN values cluster at one end of the sorted array may produce values that look valid (ordered) but are still subtly off.

The honest scope: **any track with silent frames has potentially inaccurate percentile values for centroid, spread, and flatness.** The two flagged tracks are the worst-case expression of a widespread subtle issue.

---

## What was ruled out

- **Anomalous audio in Schubert D.784** — original diagnosis (April 3, 2026) attributed the null p50 to unusual audio content. Re-investigation showed the audio is fine; the extraction is broken. Any track with silent passages would produce the same pattern.
- **Non-determinism in extraction** — re-extraction produces byte-identical values for Blue Deer. The bug is reproducible.
- **Meyda bug** — NaN output from Meyda for silent frames is expected behavior (division-by-zero in the feature definitions). The bug is in how `extract_features.js` handles Meyda's output.
- **Audio file corruption** — both files decode cleanly via ffmpeg and produce reasonable RMS/ZCR/MFCC/chroma values. Only spectral shape features show NaN.

---

## The fix

### Pipeline script
One-line change in `scripts/pipeline/extract_features.js` — add NaN filtering to the scalar feature guards:

```javascript
// Before
if (feats.spectralCentroid != null) acc.spectralCentroid.push(feats.spectralCentroid);

// After
if (feats.spectralCentroid != null && !Number.isNaN(feats.spectralCentroid)) {
  acc.spectralCentroid.push(feats.spectralCentroid);
}
```

Applied to all five scalar features (rms, zcr, spectralCentroid, spectralSpread, spectralFlatness) for defense in depth, even though only the three spectral shape features are known to produce NaN in practice. MFCC and chroma use `forEach` with their own `!= null` check — same fix applies to each coefficient, though NaN has not been observed there.

### QA validation
Add percentile ordering validation to `scripts/qa/qa_screen_library.py` as a library quality gate. Any track where any feature triple violates `p25 ≤ p50 ≤ p75` should be flagged before merge into `public/data/feature_vectors.json`. This catches the class of bug, not just the specific instance.

### Library re-extraction
Full library re-extraction required. 373 tracks, ~20-40 minutes end to end. Output replaces `public/data/feature_vectors.json`. LIBRARY_VERSION bumped from `v2-373-patch1` to `v3-373`.

### Schubert patch retirement
The midpoint interpolation patch in the extraction or merge pipeline becomes obsolete — with clean extraction, Schubert D.784 produces valid percentile values without intervention. Remove the patch logic when `fix/extraction-nan` ships.

---

## What this does not fix

### 29-second short-track unreliability
Separate issue, surfaced by FMA 130993. Short tracks produce a stable distribution of frame values, but with few enough frames (~1300 for a 30-second track) that the p50 is sensitive to individual frames. This is a sample-size problem, not a NaN problem. The `fix/extraction-nan` branch does not address it. Mitigation approach: duration-based hedging in the LLM prompt (`feat/causal-explanations`, option B).

### Browser/Node PCM gap (issue #18)
Separate issue. The NaN bug and the PCM gap are unrelated. NaN is about how Node handles Meyda's silent-frame output. The PCM gap is about ffmpeg vs Web Audio API amplitude normalization. Both are pipeline issues, but their mechanisms and fixes are independent.

---

## Reproduction

### Detect affected tracks
```bash
conda activate scenesync
python scripts/investigation/analyze_percentile_spreads.py
```

Section 5 reports percentile ordering violations.

### Diagnose per-track NaN scope
```bash
node scripts/investigation/diagnose_extraction.js
```

Reports per-feature NaN frame counts, compares re-extraction against library, confirms determinism.

### Validate the fix (once fix/extraction-nan lands)
Re-run both scripts after the pipeline fix and full library re-extraction. Expected:
- `analyze_percentile_spreads.py` — Section 5 reports no ordering violations
- `diagnose_extraction.js` — Schubert and Blue Deer produce ordered percentile values, library values match re-extraction

---

## Lessons

1. **`!= null` is not NaN-safe in JavaScript.** Any production code filtering numeric values for validity should use `Number.isFinite(value)` or explicit NaN checks, not loose equality against null.

2. **JavaScript's `Array.sort` with a numeric comparator is not NaN-safe.** NaN inputs produce undefined ordering. If NaN can enter the array, filter it before sorting.

3. **Algorithmic checks catch obvious instances but miss subtle ones.** The strict ordering check caught 2 tracks. The actual scope is much wider — any track with silent frames has potentially inaccurate values. Detection thresholds should not be confused with scope measurements.

4. **Patches should validate invariants, not just fill nulls.** The Schubert patch filled a null p50 without checking whether the surrounding p25 and p75 were ordered correctly. A correctness-preserving patch would have detected the ordering violation and either refused to patch or flagged the track.

5. **The original April 3 diagnosis was wrong.** Attributing nulls to anomalous audio content was plausible but incorrect. "The track is weird" is a tempting explanation that deserves skepticism when the pattern is isolated to specific feature families (spectral shape only, never time-domain).