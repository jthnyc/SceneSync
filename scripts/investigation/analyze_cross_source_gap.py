"""
Cross-Source Similarity Gap Investigation — Step 1
===================================================
Per-dimension distribution analysis: FMA vs Musopen

For each of the 90 feature dimensions, computes:
  - Mean and standard deviation for FMA tracks
  - Mean and standard deviation for Musopen tracks
  - Gap score: absolute difference in means, normalized by pooled std
    (essentially a Cohen's d effect size — how many standard deviations apart are the two populations?)

Outputs:
  1. Console summary of the top divergent dimensions
  2. CSV with full per-dimension stats → scripts/cross_source_stats.csv
  3. Markdown summary → scripts/INVESTIGATION_NOTES.md (Step 1 section)

Usage:
    python analyze_cross_source_gap.py <path_to_feature_vectors.json>
"""

import json
import sys
import numpy as np
import csv
from pathlib import Path

# ── Load data ──────────────────────────────────────────────────────────────

if len(sys.argv) < 2:
    print("Usage: python analyze_cross_source_gap.py <feature_vectors.json>")
    sys.exit(1)

with open(sys.argv[1], "r") as f:
    library = json.load(f)

print(f"Loaded {len(library)} tracks total")

# ── Classify source by file path ──────────────────────────────────────────

fma_tracks = []
musopen_tracks = []

for track in library:
    path = track.get("file", "")
    if "fma_small" in path:
        fma_tracks.append(track)
    elif "musopen" in path:
        musopen_tracks.append(track)
    else:
        print(f"  ⚠ Unknown source: {path}")

print(f"  FMA:     {len(fma_tracks)} tracks")
print(f"  Musopen: {len(musopen_tracks)} tracks")

# ── Flatten feature vectors ───────────────────────────────────────────────

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

def flatten(features):
    """Flatten feature dict into a list of 90 values, matching similarityService order."""
    values = []
    for key in FEATURE_ORDER:
        vals = features[key]
        for v in vals:
            # Handle null values (seen in one Schubert track)
            values.append(float(v) if v is not None else np.nan)
    return values

def make_dimension_labels():
    """Generate human-readable labels for all 90 dimensions."""
    labels = []
    for key in FEATURE_ORDER:
        for p in PERCENTILE_LABELS:
            labels.append(f"{key}_{p}")
    return labels

dim_labels = make_dimension_labels()

# ── Build matrices ────────────────────────────────────────────────────────

fma_matrix = np.array([flatten(t["features"]) for t in fma_tracks])
mus_matrix = np.array([flatten(t["features"]) for t in musopen_tracks])

print(f"\nFMA matrix shape:     {fma_matrix.shape}")
print(f"Musopen matrix shape: {mus_matrix.shape}")

# Check for NaN
fma_nans = np.isnan(fma_matrix).sum()
mus_nans = np.isnan(mus_matrix).sum()
if fma_nans > 0:
    print(f"  ⚠ FMA has {fma_nans} NaN values")
if mus_nans > 0:
    print(f"  ⚠ Musopen has {mus_nans} NaN values")
    # Identify which tracks/dimensions have NaN
    nan_locs = np.argwhere(np.isnan(mus_matrix))
    for row, col in nan_locs:
        track_file = musopen_tracks[row].get("file", "unknown")
        print(f"    NaN at track: {track_file}, dimension: {dim_labels[col]}")

# ── Per-dimension statistics ──────────────────────────────────────────────

# Use nanmean/nanstd to handle the null values gracefully
fma_means = np.nanmean(fma_matrix, axis=0)
fma_stds  = np.nanstd(fma_matrix, axis=0)
mus_means = np.nanmean(mus_matrix, axis=0)
mus_stds  = np.nanstd(mus_matrix, axis=0)

# Cohen's d effect size: |mean_fma - mean_mus| / pooled_std
# Pooled std = sqrt((std_fma^2 + std_mus^2) / 2)
EPS = 1e-8
pooled_stds = np.sqrt((fma_stds**2 + mus_stds**2) / 2 + EPS)
effect_sizes = np.abs(fma_means - mus_means) / pooled_stds

# Direction: positive = FMA higher, negative = Musopen higher
direction = fma_means - mus_means

# ── Results ───────────────────────────────────────────────────────────────

print("\n" + "=" * 80)
print("PER-DIMENSION DIVERGENCE (Cohen's d effect size)")
print("=" * 80)
print(f"{'Dim':>4}  {'Label':<22}  {'FMA Mean':>10}  {'MUS Mean':>10}  {'Effect d':>9}  {'Direction':>10}")
print("-" * 80)

# Sort by effect size descending
ranked = sorted(range(90), key=lambda i: effect_sizes[i], reverse=True)

for rank, i in enumerate(ranked):
    dir_label = "FMA higher" if direction[i] > 0 else "MUS higher"
    marker = " ◀◀" if effect_sizes[i] > 0.8 else " ◀" if effect_sizes[i] > 0.5 else ""
    print(f"{i:>4}  {dim_labels[i]:<22}  {fma_means[i]:>10.3f}  {mus_means[i]:>10.3f}  {effect_sizes[i]:>9.3f}  {dir_label:>10}{marker}")

# ── Summary by feature group ─────────────────────────────────────────────

print("\n" + "=" * 80)
print("AVERAGE EFFECT SIZE BY FEATURE GROUP")
print("=" * 80)

feature_groups = {}
for i, label in enumerate(dim_labels):
    # Extract feature name (everything before the last _pXX)
    parts = label.rsplit("_", 1)
    group = parts[0]
    if group not in feature_groups:
        feature_groups[group] = []
    feature_groups[group].append(effect_sizes[i])

# Group into categories
categories = {
    "RMS (energy)": ["rms"],
    "ZCR (activity)": ["zcr"],
    "Spectral Centroid (brightness)": ["centroid"],
    "Spectral Spread (width)": ["spread"],
    "Spectral Flatness (texture)": ["flatness"],
    "MFCCs 1-3 (coarse timbre)": ["mfcc_1", "mfcc_2", "mfcc_3"],
    "MFCCs 4-7 (mid timbre)": ["mfcc_4", "mfcc_5", "mfcc_6", "mfcc_7"],
    "MFCCs 8-10 (fine timbre)": ["mfcc_8", "mfcc_9", "mfcc_10"],
    "MFCCs 11-13 (finest timbre)": ["mfcc_11", "mfcc_12", "mfcc_13"],
    "Chroma (harmony)": [f"chroma_{i}" for i in range(1, 13)],
}

for cat_name, groups in categories.items():
    all_d = []
    for g in groups:
        if g in feature_groups:
            all_d.extend(feature_groups[g])
    avg_d = np.mean(all_d) if all_d else 0
    max_d = np.max(all_d) if all_d else 0
    marker = " ◀◀" if avg_d > 0.8 else " ◀" if avg_d > 0.5 else ""
    print(f"  {cat_name:<40}  avg d={avg_d:.3f}  max d={max_d:.3f}{marker}")

# ── Threshold summary ─────────────────────────────────────────────────────

print("\n" + "=" * 80)
print("DIVERGENCE THRESHOLDS")
print("=" * 80)

large = sum(1 for d in effect_sizes if d > 0.8)
medium = sum(1 for d in effect_sizes if 0.5 < d <= 0.8)
small = sum(1 for d in effect_sizes if 0.2 < d <= 0.5)
negligible = sum(1 for d in effect_sizes if d <= 0.2)

print(f"  Large (d > 0.8):      {large:>3} dimensions  ◀◀ These are the problem")
print(f"  Medium (0.5 < d ≤ 0.8): {medium:>3} dimensions  ◀  Worth watching")
print(f"  Small (0.2 < d ≤ 0.5):  {small:>3} dimensions")
print(f"  Negligible (d ≤ 0.2):   {negligible:>3} dimensions")

# ── Write CSV ─────────────────────────────────────────────────────────────

csv_path = "/home/claude/cross_source_stats.csv"
with open(csv_path, "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow([
        "dimension", "label", "fma_mean", "fma_std", 
        "musopen_mean", "musopen_std", "effect_size_d", "direction"
    ])
    for i in range(90):
        dir_label = "FMA higher" if direction[i] > 0 else "Musopen higher"
        writer.writerow([
            i, dim_labels[i],
            f"{fma_means[i]:.6f}", f"{fma_stds[i]:.6f}",
            f"{mus_means[i]:.6f}", f"{mus_stds[i]:.6f}",
            f"{effect_sizes[i]:.6f}", dir_label
        ])

print(f"\n✅ Full stats written to: {csv_path}")

# ── Write INVESTIGATION_NOTES.md (Step 1) ────────────────────────────────

notes_path = "/home/claude/INVESTIGATION_NOTES.md"
with open(notes_path, "w") as f:
    f.write("# Cross-Source Similarity Gap Investigation\n\n")
    f.write("## Overview\n\n")
    f.write("Musopen (classical) tracks consistently score lower in similarity against FMA references.\n")
    f.write("Hypothesis: MFCCs capture recording environment (room acoustics, mic character, mastering)\n")
    f.write("alongside timbral content, inflating distance between sources.\n\n")
    
    f.write("## Step 1: Per-Dimension Distribution Analysis\n\n")
    f.write(f"**Dataset:** {len(fma_tracks)} FMA tracks, {len(musopen_tracks)} Musopen tracks ({len(library)} total)\n\n")
    f.write("**Method:** Cohen's d effect size for each of 90 dimensions — measures how many pooled\n")
    f.write("standard deviations apart the FMA and Musopen populations are on that dimension.\n\n")
    f.write("### Divergence Summary\n\n")
    f.write(f"| Threshold | Count | Interpretation |\n")
    f.write(f"|-----------|-------|----------------|\n")
    f.write(f"| d > 0.8 (large) | {large} | Recording environment likely dominates |\n")
    f.write(f"| 0.5 < d ≤ 0.8 (medium) | {medium} | Mixed signal — music + environment |\n")
    f.write(f"| 0.2 < d ≤ 0.5 (small) | {small} | Mostly musical differences |\n")
    f.write(f"| d ≤ 0.2 (negligible) | {negligible} | Sources look the same |\n\n")
    
    f.write("### Top 15 Most Divergent Dimensions\n\n")
    f.write(f"| Rank | Dimension | FMA Mean | Musopen Mean | Cohen's d | Direction |\n")
    f.write(f"|------|-----------|----------|--------------|-----------|----------|\n")
    for rank, i in enumerate(ranked[:15]):
        dir_label = "FMA higher" if direction[i] > 0 else "Musopen higher"
        f.write(f"| {rank+1} | {dim_labels[i]} | {fma_means[i]:.3f} | {mus_means[i]:.3f} | {effect_sizes[i]:.3f} | {dir_label} |\n")
    
    f.write("\n### Average Effect Size by Feature Group\n\n")
    f.write(f"| Feature Group | Avg d | Max d | Assessment |\n")
    f.write(f"|---------------|-------|-------|------------|\n")
    for cat_name, groups in categories.items():
        all_d = []
        for g in groups:
            if g in feature_groups:
                all_d.extend(feature_groups[g])
        avg_d = np.mean(all_d) if all_d else 0
        max_d = np.max(all_d) if all_d else 0
        assessment = "Problem" if avg_d > 0.8 else "Watch" if avg_d > 0.5 else "OK" if avg_d > 0.2 else "Clean"
        f.write(f"| {cat_name} | {avg_d:.3f} | {max_d:.3f} | {assessment} |\n")
    
    f.write("\n### Data Quality Note\n\n")
    if mus_nans > 0:
        f.write(f"Found {mus_nans} NaN values in Musopen data (null in JSON).\n")
        nan_locs = np.argwhere(np.isnan(mus_matrix))
        for row, col in nan_locs:
            track_file = musopen_tracks[row].get("file", "unknown")
            f.write(f"- `{track_file}` → `{dim_labels[col]}`\n")
        f.write("\nThese were excluded from mean/std calculations via nanmean/nanstd.\n")
    else:
        f.write("No data quality issues found.\n")
    
    f.write("\n---\n\n")
    f.write("## Step 2: Identify Problem Dimensions\n\n")
    f.write("_Pending — depends on Step 1 results._\n\n")
    f.write("## Step 3: Test Modified Similarity\n\n")
    f.write("_Pending._\n\n")
    f.write("## Step 4: Decision\n\n")
    f.write("_Pending._\n")

print(f"✅ Investigation notes written to: {notes_path}")