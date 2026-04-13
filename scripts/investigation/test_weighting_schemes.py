"""
Cross-Source Similarity Gap Investigation — Step 2
===================================================
Dimension weighting experiments

Tests how different weighting strategies affect cross-source rankings.

Method:
  1. Pick a set of "test reference" tracks from FMA across genres
  2. For each reference, run similarity search under several weighting schemes:
     a. BASELINE — current behavior (all 90 dims, z-scored, equal weight)
     b. DROP_RMS — zero out RMS dimensions (3 dims)
     c. DROP_MFCC1 — zero out MFCC 1 (3 dims) — it's basically loudness in cepstral domain
     d. DROP_LOUDNESS — zero out RMS + MFCC 1 (6 dims)
     e. DOWNWEIGHT_CHROMA — halve chroma weights (36 dims)
     f. DROP_LOUDNESS + DOWNWEIGHT_CHROMA combined
     g. KEEP_CORE — only keep mid-MFCCs (4-10) + spectral features + chroma at half weight
  3. For each scheme, measure:
     - Average rank of the top Musopen track
     - Average score of the top Musopen track
     - Whether the top-5 results include any Musopen tracks
     - Whether within-FMA ranking quality is preserved (top match still makes sense)

Usage:
    python test_weighting_schemes.py <feature_vectors.json>
"""

import json
import sys
import numpy as np
from collections import defaultdict

# ── Load data ──────────────────────────────────────────────────────────────

if len(sys.argv) < 2:
    print("Usage: python test_weighting_schemes.py <feature_vectors.json>")
    sys.exit(1)

with open(sys.argv[1], "r") as f:
    library = json.load(f)

print(f"Loaded {len(library)} tracks")

# ── Feature vector handling ───────────────────────────────────────────────

FEATURE_ORDER = [
    "rms", "zcr", "centroid", "spread", "flatness",
    "mfcc_1", "mfcc_2", "mfcc_3", "mfcc_4", "mfcc_5",
    "mfcc_6", "mfcc_7", "mfcc_8", "mfcc_9", "mfcc_10",
    "mfcc_11", "mfcc_12", "mfcc_13",
    "chroma_1", "chroma_2", "chroma_3", "chroma_4",
    "chroma_5", "chroma_6", "chroma_7", "chroma_8",
    "chroma_9", "chroma_10", "chroma_11", "chroma_12",
]

PERCENTILE_LABELS = ["p25", "p50", "p75"]

def make_dim_labels():
    labels = []
    for key in FEATURE_ORDER:
        for p in PERCENTILE_LABELS:
            labels.append(f"{key}_{p}")
    return labels

DIM_LABELS = make_dim_labels()

def flatten(features):
    values = []
    for key in FEATURE_ORDER:
        for v in features[key]:
            values.append(float(v) if v is not None else 0.0)  # Replace null with 0
    return values

def get_source(track):
    path = track.get("file", "")
    if "fma_small" in path:
        return "FMA"
    elif "musopen" in path:
        return "Musopen"
    return "Unknown"

def get_dim_indices(feature_name):
    """Get the 3 indices (p25, p50, p75) for a named feature."""
    indices = []
    for i, label in enumerate(DIM_LABELS):
        if label.startswith(feature_name + "_p"):
            indices.append(i)
    return indices

def get_group_indices(feature_names):
    """Get all indices for a list of feature names."""
    indices = []
    for name in feature_names:
        indices.extend(get_dim_indices(name))
    return indices

# ── Build matrices ────────────────────────────────────────────────────────

sources = [get_source(t) for t in library]
raw_matrix = np.array([flatten(t["features"]) for t in library])

# Compute z-score normalization (matching what similarityService does)
means = np.nanmean(raw_matrix, axis=0)
stds = np.nanstd(raw_matrix, axis=0)
EPS = 1e-8
norm_matrix = np.where(stds < EPS, 0, (raw_matrix - means) / (stds + EPS))

print(f"  FMA:     {sources.count('FMA')} tracks")
print(f"  Musopen: {sources.count('Musopen')} tracks")

# ── Define weighting schemes ──────────────────────────────────────────────

def make_weights(scheme_name):
    """Return a 90-element weight vector for the given scheme."""
    w = np.ones(90)
    
    rms_idx = get_group_indices(["rms"])
    mfcc1_idx = get_group_indices(["mfcc_1"])
    loudness_idx = rms_idx + mfcc1_idx
    chroma_idx = get_group_indices([f"chroma_{i}" for i in range(1, 13)])
    mfcc_coarse_idx = get_group_indices(["mfcc_1", "mfcc_2", "mfcc_3"])
    mfcc_mid_idx = get_group_indices(["mfcc_4", "mfcc_5", "mfcc_6", "mfcc_7"])
    mfcc_fine_idx = get_group_indices(["mfcc_8", "mfcc_9", "mfcc_10"])
    mfcc_finest_idx = get_group_indices(["mfcc_11", "mfcc_12", "mfcc_13"])
    spectral_idx = get_group_indices(["zcr", "centroid", "spread", "flatness"])
    
    if scheme_name == "BASELINE":
        pass  # all ones
    
    elif scheme_name == "DROP_RMS":
        w[rms_idx] = 0
    
    elif scheme_name == "DROP_MFCC1":
        w[mfcc1_idx] = 0
    
    elif scheme_name == "DROP_LOUDNESS":
        w[loudness_idx] = 0
    
    elif scheme_name == "DOWNWEIGHT_CHROMA":
        w[chroma_idx] = 0.5
    
    elif scheme_name == "DROP_LOUD_DW_CHROMA":
        w[loudness_idx] = 0
        w[chroma_idx] = 0.5
    
    elif scheme_name == "KEEP_CORE":
        # Zero everything, then selectively enable
        w[:] = 0
        w[spectral_idx] = 1.0        # ZCR, centroid, spread, flatness
        w[mfcc_mid_idx] = 1.0        # MFCCs 4-7
        w[mfcc_fine_idx] = 1.0       # MFCCs 8-10
        w[mfcc_finest_idx] = 0.5     # MFCCs 11-13 at half weight
        w[chroma_idx] = 0.5          # Chroma at half weight
    
    elif scheme_name == "DROP_LOUD_DW_COARSE":
        w[loudness_idx] = 0
        w[get_group_indices(["mfcc_2", "mfcc_3"])] = 0.5
        w[chroma_idx] = 0.5

    return w

SCHEMES = [
    "BASELINE",
    "DROP_RMS",
    "DROP_MFCC1",
    "DROP_LOUDNESS",
    "DOWNWEIGHT_CHROMA",
    "DROP_LOUD_DW_CHROMA",
    "DROP_LOUD_DW_COARSE",
    "KEEP_CORE",
]

# ── Weighted cosine similarity ────────────────────────────────────────────

def weighted_cosine(a, b, weights):
    """Cosine similarity with per-dimension weights applied."""
    wa = a * weights
    wb = b * weights
    dot = np.dot(wa, wb)
    mag = np.sqrt(np.dot(wa, wa)) * np.sqrt(np.dot(wb, wb))
    return dot / mag if mag > 0 else 0

# ── Select test references ────────────────────────────────────────────────
# Pick FMA tracks from different genres for a representative test set

fma_by_genre = defaultdict(list)
for i, track in enumerate(library):
    if sources[i] == "FMA":
        genre = track.get("genre", "Unknown")
        fma_by_genre[genre].append(i)

print(f"\nFMA genres: {dict((g, len(v)) for g, v in fma_by_genre.items())}")

# Pick 2-3 tracks per genre for testing
np.random.seed(42)
test_indices = []
for genre, indices in sorted(fma_by_genre.items()):
    n_pick = min(3, len(indices))
    picked = np.random.choice(indices, n_pick, replace=False)
    test_indices.extend(picked)

print(f"Selected {len(test_indices)} test reference tracks across {len(fma_by_genre)} genres")

# ── Run experiments ───────────────────────────────────────────────────────

print("\n" + "=" * 100)
print("WEIGHTING SCHEME COMPARISON")
print("=" * 100)

scheme_results = {}

for scheme in SCHEMES:
    weights = make_weights(scheme)
    active_dims = int(np.sum(weights > 0))
    
    musopen_best_ranks = []
    musopen_best_scores = []
    musopen_in_top5 = 0
    fma_top1_scores = []
    total_tests = 0
    
    for ref_idx in test_indices:
        ref_vec = norm_matrix[ref_idx]
        
        # Compute similarity to all other tracks
        scores = []
        for j in range(len(library)):
            if j == ref_idx:
                continue
            sim = weighted_cosine(ref_vec, norm_matrix[j], weights)
            scores.append((j, sim, sources[j]))
        
        scores.sort(key=lambda x: x[1], reverse=True)
        
        # Find best Musopen track rank and score
        for rank, (idx, score, source) in enumerate(scores):
            if source == "Musopen":
                musopen_best_ranks.append(rank + 1)
                musopen_best_scores.append(score)
                break
        
        # Check if any Musopen in top 5
        top5_sources = [s[2] for s in scores[:5]]
        if "Musopen" in top5_sources:
            musopen_in_top5 += 1
        
        # Top FMA match score (for quality check)
        for idx, score, source in scores:
            if source == "FMA":
                fma_top1_scores.append(score)
                break
        
        total_tests += 1
    
    avg_mus_rank = np.mean(musopen_best_ranks)
    avg_mus_score = np.mean(musopen_best_scores)
    pct_mus_top5 = musopen_in_top5 / total_tests * 100
    avg_fma_top1 = np.mean(fma_top1_scores)
    
    scheme_results[scheme] = {
        "active_dims": active_dims,
        "avg_musopen_rank": avg_mus_rank,
        "avg_musopen_score": avg_mus_score,
        "pct_musopen_in_top5": pct_mus_top5,
        "avg_fma_top1_score": avg_fma_top1,
    }
    
    print(f"\n{'─' * 100}")
    print(f"  {scheme} ({active_dims} active dims)")
    print(f"  Avg best Musopen rank:   {avg_mus_rank:.1f}  (lower = Musopen surfaces more)")
    print(f"  Avg best Musopen score:  {avg_mus_score:.4f}")
    print(f"  % tests w/ Musopen in top 5:  {pct_mus_top5:.1f}%  (higher = more cross-source mixing)")
    print(f"  Avg top FMA match score: {avg_fma_top1:.4f}  (quality check — shouldn't drop much)")

# ── Comparison table ──────────────────────────────────────────────────────

print("\n\n" + "=" * 100)
print("SUMMARY COMPARISON TABLE")
print("=" * 100)
print(f"{'Scheme':<25} {'Dims':>4} {'Mus Rank':>9} {'Mus Score':>10} {'Top5 %':>7} {'FMA Top1':>9} {'Assessment'}")
print("─" * 100)

baseline = scheme_results["BASELINE"]

for scheme in SCHEMES:
    r = scheme_results[scheme]
    
    # Assessment logic
    rank_delta = baseline["avg_musopen_rank"] - r["avg_musopen_rank"]
    fma_delta = r["avg_fma_top1_score"] - baseline["avg_fma_top1_score"]
    
    if rank_delta > 10 and fma_delta > -0.02:
        assessment = "✅ Strong improvement"
    elif rank_delta > 5 and fma_delta > -0.02:
        assessment = "✅ Good improvement"
    elif rank_delta > 2 and fma_delta > -0.03:
        assessment = "→  Mild improvement"
    elif abs(rank_delta) <= 2:
        assessment = "—  No change"
    elif fma_delta < -0.03:
        assessment = "⚠  Hurts FMA quality"
    else:
        assessment = "→  Mixed"
    
    if scheme == "BASELINE":
        assessment = "(baseline)"
    
    print(f"{scheme:<25} {r['active_dims']:>4} {r['avg_musopen_rank']:>9.1f} {r['avg_musopen_score']:>10.4f} {r['pct_musopen_in_top5']:>6.1f}% {r['avg_fma_top1_score']:>9.4f} {assessment}")

# ── Per-scheme detail: show a specific example ───────────────────────────

print("\n\n" + "=" * 100)
print("EXAMPLE: Top 5 matches for an Instrumental FMA track under each scheme")
print("=" * 100)

# Pick an Instrumental track as reference (likely to have classical-adjacent character)
instrumental_indices = fma_by_genre.get("Instrumental", [])
if instrumental_indices:
    example_ref = instrumental_indices[0]
    ref_track = library[example_ref]
    print(f"\nReference: {ref_track.get('file', 'unknown')} (genre: {ref_track.get('genre', '?')})")
    
    for scheme in ["BASELINE", "DROP_LOUDNESS", "DROP_LOUD_DW_CHROMA", "KEEP_CORE"]:
        weights = make_weights(scheme)
        ref_vec = norm_matrix[example_ref]
        
        scores = []
        for j in range(len(library)):
            if j == example_ref:
                continue
            sim = weighted_cosine(ref_vec, norm_matrix[j], weights)
            scores.append((j, sim))
        
        scores.sort(key=lambda x: x[1], reverse=True)
        
        print(f"\n  {scheme}:")
        for rank, (idx, score) in enumerate(scores[:5]):
            source = sources[idx]
            file_path = library[idx].get("file", "unknown")
            # Shorten path for display
            short = file_path.split("/")[-1] if "/" in file_path else file_path
            marker = " ← Musopen" if source == "Musopen" else ""
            print(f"    {rank+1}. [{source}] {score:.4f}  {short}{marker}")

# ── Append to INVESTIGATION_NOTES.md ─────────────────────────────────────

notes_path = "/home/claude/INVESTIGATION_NOTES.md"
with open(notes_path, "r") as f:
    existing = f.read()

# Replace the Step 2 placeholder
step2_content = "\n## Step 2: Dimension Weighting Experiments\n\n"
step2_content += f"**Test set:** {len(test_indices)} FMA reference tracks across {len(fma_by_genre)} genres\n"
step2_content += f"**Method:** For each reference, run similarity search under different weighting schemes.\n"
step2_content += "Measure how well Musopen tracks surface in results.\n\n"

step2_content += "### Results Summary\n\n"
step2_content += f"| Scheme | Active Dims | Avg Musopen Rank | Musopen in Top 5 | FMA Top1 Score | Assessment |\n"
step2_content += f"|--------|-------------|-----------------|------------------|----------------|------------|\n"

for scheme in SCHEMES:
    r = scheme_results[scheme]
    rank_delta = baseline["avg_musopen_rank"] - r["avg_musopen_rank"]
    fma_delta = r["avg_fma_top1_score"] - baseline["avg_fma_top1_score"]
    
    if scheme == "BASELINE":
        assessment = "Baseline"
    elif rank_delta > 10 and fma_delta > -0.02:
        assessment = "Strong improvement"
    elif rank_delta > 5 and fma_delta > -0.02:
        assessment = "Good improvement"
    elif rank_delta > 2 and fma_delta > -0.03:
        assessment = "Mild improvement"
    elif abs(rank_delta) <= 2:
        assessment = "No change"
    else:
        assessment = "Mixed"
    
    step2_content += f"| {scheme} | {r['active_dims']} | {r['avg_musopen_rank']:.1f} | {r['pct_musopen_in_top5']:.1f}% | {r['avg_fma_top1_score']:.4f} | {assessment} |\n"

step2_content += "\n### Key Findings\n\n"
step2_content += "_To be filled after reviewing results._\n"

updated = existing.replace(
    "## Step 2: Identify Problem Dimensions\n\n_Pending — depends on Step 1 results._",
    step2_content
)

with open(notes_path, "w") as f:
    f.write(updated)

print(f"\n✅ INVESTIGATION_NOTES.md updated with Step 2 results")