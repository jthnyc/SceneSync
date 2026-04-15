#!/usr/bin/env python
"""
analyze_percentile_spreads.py

Analyzes the distribution of within-track percentile spreads (p75 - p25)
across the library, per feature and per source.

Context: The feature vector stores p25/p50/p75 per scalar dimension. The
spread (p75 - p25) indicates how variable that feature is across frames
within a track. Tight spread = consistent track character; wide spread =
variable track character.

This script surfaces:
  1. Overall spread distribution per feature (all 373 tracks)
  2. Per-source breakdown (FMA / Musopen / YouTube)
  3. Track 130993 specifically (29s FMA entry point)
  4. Where natural "tight vs wide" breakpoints appear

Informs the feat/causal-explanations decision about whether to send raw
percentile values to the LLM and how to frame spread in the prompt.

Usage:
    python scripts/investigation/analyze_percentile_spreads.py
"""

import json
from pathlib import Path
from collections import defaultdict

import numpy as np


# --- paths ---
PROJECT_ROOT = Path(__file__).resolve().parents[2]
FEATURE_VECTORS_PATH = PROJECT_ROOT / "public" / "data" / "feature_vectors.json"

# --- feature definitions ---
# Scalar features have a single value per frame, stored as [p25, p50, p75].
SCALAR_FEATURES = ["rms", "zcr", "centroid", "spread", "flatness"]

# MFCCs: 13 coefficients, each with [p25, p50, p75]. Analyze 2-13 (MFCC 1 is dropped).
MFCC_COUNT = 13
# Chroma: 12 pitch classes, each with [p25, p50, p75].
CHROMA_COUNT = 12


# --- source classification ---
def classify_source(path: str) -> str:
    """Classify a track's source from its file path."""
    if "fma_small" in path:
        return "FMA"
    if "musopen" in path:
        return "Musopen"
    if "youtube" in path:
        return "YouTube"
    return "Unknown"


# --- spread extraction ---
def get_spread(percentile_triple: list[float]) -> float | None:
    """Return p75 - p25, or None if any percentile is null/missing."""
    if percentile_triple is None or len(percentile_triple) != 3:
        return None
    if any(v is None for v in percentile_triple):
        return None
    return percentile_triple[2] - percentile_triple[0]


def extract_spreads(track: dict) -> dict[str, float]:
    """Extract the spread for every scalar dimension of a track.

    Returns a dict keyed by dimension name:
      - 'rms', 'zcr', 'spectralCentroid', 'spectralSpread', 'spectralFlatness'
      - 'mfcc_1' ... 'mfcc_13'
      - 'chroma_1' ... 'chroma_12'
    """
    features = track.get("features", {})
    spreads = {}

    for name in SCALAR_FEATURES:
        spread = get_spread(features.get(name))
        if spread is not None:
            spreads[name] = spread

    # MFCCs: stored as individual keys mfcc_1 through mfcc_13, each a [p25, p50, p75] triple
    for i in range(1, MFCC_COUNT + 1):
        key = f"mfcc_{i}"
        spread = get_spread(features.get(key))
        if spread is not None:
            spreads[key] = spread

    # Chroma: stored as individual keys chroma_1 through chroma_12, each a [p25, p50, p75] triple
    for i in range(1, CHROMA_COUNT + 1):
        key = f"chroma_{i}"
        spread = get_spread(features.get(key))
        if spread is not None:
            spreads[key] = spread

    return spreads


# --- summary helpers ---
def summarize(values: list[float]) -> dict:
    """Return min/p25/median/p75/max/mean/count for a list of values."""
    if not values:
        return {"count": 0}
    arr = np.array(values)
    return {
        "count": len(arr),
        "min": float(arr.min()),
        "p25": float(np.percentile(arr, 25)),
        "median": float(np.median(arr)),
        "p75": float(np.percentile(arr, 75)),
        "max": float(arr.max()),
        "mean": float(arr.mean()),
    }


def format_row(label: str, stats: dict, width: int = 28) -> str:
    """Format a single row of summary statistics."""
    if stats.get("count", 0) == 0:
        return f"  {label.ljust(width)} (no data)"
    return (
        f"  {label.ljust(width)}"
        f"n={stats['count']:>3}  "
        f"min={stats['min']:>8.3f}  "
        f"p25={stats['p25']:>8.3f}  "
        f"med={stats['median']:>8.3f}  "
        f"p75={stats['p75']:>8.3f}  "
        f"max={stats['max']:>8.3f}"
    )


def percentile_rank(value: float, distribution: list[float]) -> float:
    """Return the percentile rank of `value` within `distribution` (0-100)."""
    if not distribution:
        return float("nan")
    arr = np.array(distribution)
    return float((arr < value).sum() / len(arr) * 100)


# --- main ---
def main():
    print(f"Loading {FEATURE_VECTORS_PATH.relative_to(PROJECT_ROOT)}...")
    with open(FEATURE_VECTORS_PATH) as f:
        library = json.load(f)
    print(f"Loaded {len(library)} tracks.\n")

    # Group tracks by source and collect spreads
    # Structure: spreads_by_source[source][dimension] = [spread values]
    spreads_by_source: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    spreads_overall: dict[str, list[float]] = defaultdict(list)

    # Track 130993 specifically
    track_130993_spreads: dict[str, float] | None = None

    source_counts: dict[str, int] = defaultdict(int)

    for track in library:
        path = track.get("file", "")
        source = classify_source(path)
        source_counts[source] += 1

        spreads = extract_spreads(track)

        for dim, value in spreads.items():
            spreads_by_source[source][dim].append(value)
            spreads_overall[dim].append(value)

        if "130993" in path:
            track_130993_spreads = spreads

    # Header
    print("=" * 100)
    print("LIBRARY COMPOSITION")
    print("=" * 100)
    for source, count in sorted(source_counts.items()):
        print(f"  {source:<12} {count:>4} tracks")
    print()

    # Section 1: Overall spread distribution per feature
    print("=" * 100)
    print("SECTION 1: OVERALL SPREAD DISTRIBUTION (all 373 tracks)")
    print("=" * 100)
    print("For each dimension, the distribution of (p75 - p25) across all tracks.")
    print("Wide distribution of spreads = tracks vary a lot in how variable they are.")
    print("Tight distribution of spreads = all tracks have similar within-track variability.\n")

    print("--- Scalar features ---")
    for name in SCALAR_FEATURES:
        print(format_row(name, summarize(spreads_overall[name])))

    print("\n--- MFCCs 2-13 (MFCC 1 dropped in weighting) ---")
    for i in range(2, MFCC_COUNT + 1):
        dim = f"mfcc_{i}"
        print(format_row(dim, summarize(spreads_overall[dim])))

    print("\n--- Chroma aggregate (mean spread across all 12 pitch classes per track) ---")
    # Per-track: average spread across chroma_1..chroma_12
    chroma_aggregate_per_track: list[float] = []
    for track in library:
        spreads = extract_spreads(track)
        chroma_values = [spreads[f"chroma_{i}"] for i in range(1, CHROMA_COUNT + 1) if f"chroma_{i}" in spreads]
        if len(chroma_values) == CHROMA_COUNT:
            chroma_aggregate_per_track.append(float(np.mean(chroma_values)))
    print(format_row("chroma (mean per-track)", summarize(chroma_aggregate_per_track)))
    print()

    # Section 2: Per-source breakdown
    print("=" * 100)
    print("SECTION 2: PER-SOURCE SPREAD COMPARISON")
    print("=" * 100)
    print("Hypothesis: FMA tracks (30s) have wider relative spread than Musopen/YouTube (full-length/90s).")
    print("If that's true, short-duration is driving spread unreliability.")
    print("If not, spread is a track-character property independent of duration.\n")

    # Compare median spread per source for each scalar feature
    sources = ["FMA", "Musopen", "YouTube"]
    print(f"Median spread by source (lower = more consistent within-track):\n")
    print(f"  {'dimension':<28} {'FMA':>10} {'Musopen':>10} {'YouTube':>10}")
    print(f"  {'-' * 28} {'-' * 10} {'-' * 10} {'-' * 10}")

    for name in SCALAR_FEATURES:
        row = f"  {name:<28}"
        for source in sources:
            vals = spreads_by_source[source].get(name, [])
            med = np.median(vals) if vals else float("nan")
            row += f" {med:>10.3f}"
        print(row)

    # MFCC aggregate per source
    print(f"\n  {'MFCC 2-13 mean spread':<28}", end="")
    for source in sources:
        per_track_means = []
        for track in library:
            if classify_source(track.get("file", "")) != source:
                continue
            spreads = extract_spreads(track)
            mfcc_vals = [spreads[f"mfcc_{i}"] for i in range(2, MFCC_COUNT + 1) if f"mfcc_{i}" in spreads]
            if mfcc_vals:
                per_track_means.append(np.mean(mfcc_vals))
        med = np.median(per_track_means) if per_track_means else float("nan")
        print(f" {med:>10.3f}", end="")
    print()

    # Chroma aggregate per source
    print(f"  {'Chroma 1-12 mean spread':<28}", end="")
    for source in sources:
        per_track_means = []
        for track in library:
            if classify_source(track.get("file", "")) != source:
                continue
            spreads = extract_spreads(track)
            chroma_vals = [spreads[f"chroma_{i}"] for i in range(1, CHROMA_COUNT + 1) if f"chroma_{i}" in spreads]
            if chroma_vals:
                per_track_means.append(np.mean(chroma_vals))
        med = np.median(per_track_means) if per_track_means else float("nan")
        print(f" {med:>10.3f}", end="")
    print("\n")

    # Section 3: 130993 specifically
    print("=" * 100)
    print("SECTION 3: FMA TRACK 130993 (29s entry point, flagged for replacement)")
    print("=" * 100)

    if track_130993_spreads is None:
        print("  Track 130993 not found in library.\n")
    else:
        print("For each dimension, 130993's spread and its rank within the overall library distribution.")
        print("Rank near 100 = this track is unusually variable for this feature.")
        print("Rank near 0 = this track is unusually consistent for this feature.\n")

        print(f"  {'dimension':<28} {'spread':>10} {'library rank':>14}")
        print(f"  {'-' * 28} {'-' * 10} {'-' * 14}")

        for name in SCALAR_FEATURES:
            if name in track_130993_spreads:
                spread = track_130993_spreads[name]
                rank = percentile_rank(spread, spreads_overall[name])
                print(f"  {name:<28} {spread:>10.3f} {rank:>12.0f}%")

        # MFCC aggregate for 130993
        mfcc_vals = [track_130993_spreads[f"mfcc_{i}"] for i in range(2, MFCC_COUNT + 1) if f"mfcc_{i}" in track_130993_spreads]
        if mfcc_vals:
            mean_spread = float(np.mean(mfcc_vals))
            # Compute all tracks' mean MFCC 2-13 spread for ranking
            all_mfcc_means = []
            for track in library:
                spreads = extract_spreads(track)
                vals = [spreads[f"mfcc_{i}"] for i in range(2, MFCC_COUNT + 1) if f"mfcc_{i}" in spreads]
                if vals:
                    all_mfcc_means.append(np.mean(vals))
            rank = percentile_rank(mean_spread, all_mfcc_means)
            print(f"  {'mfcc 2-13 mean':<28} {mean_spread:>10.3f} {rank:>12.0f}%")

        chroma_vals = [track_130993_spreads[f"chroma_{i}"] for i in range(1, CHROMA_COUNT + 1) if f"chroma_{i}" in track_130993_spreads]
        if chroma_vals:
            mean_spread = float(np.mean(chroma_vals))
            all_chroma_means = []
            for track in library:
                spreads = extract_spreads(track)
                vals = [spreads[f"chroma_{i}"] for i in range(1, CHROMA_COUNT + 1) if f"chroma_{i}" in spreads]
                if vals:
                    all_chroma_means.append(np.mean(vals))
            rank = percentile_rank(mean_spread, all_chroma_means)
            print(f"  {'chroma 1-12 mean':<28} {mean_spread:>10.3f} {rank:>12.0f}%")
        print()

    # Section 4: Breakpoint detection
    print("=" * 100)
    print("SECTION 4: NATURAL BREAKPOINTS FOR 'TIGHT VS WIDE'")
    print("=" * 100)
    print("For each scalar feature, the spread distribution's own quartiles.")
    print("These are candidate thresholds if we want to gate raw-value exposure to the LLM.")
    print("A track falls below p25 of the spread distribution = tight spread for this feature.\n")

    print(f"  {'dimension':<28} {'spread p25':>12} {'spread p75':>12}  {'interpretation':<40}")
    print(f"  {'-' * 28} {'-' * 12} {'-' * 12}  {'-' * 40}")

    for name in SCALAR_FEATURES:
        vals = spreads_overall[name]
        if not vals:
            continue
        p25 = np.percentile(vals, 25)
        p75 = np.percentile(vals, 75)
        # Compute ratio of p75/p25 — how spread out the spread distribution itself is
        ratio = p75 / p25 if p25 > 0 else float("inf")
        if ratio < 2:
            interp = "tight distribution (spread is consistent)"
        elif ratio < 4:
            interp = "moderate variation in spread"
        else:
            interp = "wide variation (spread itself varies a lot)"
        print(f"  {name:<28} {p25:>12.3f} {p75:>12.3f}  {interp:<40}")

    print()
    print("=" * 100)
    print("SECTION 5: DATA QUALITY — NEGATIVE VALUES + PERCENTILE ORDERING")
    print("=" * 100)
    print("Checks two things:")
    print("  (a) Negative values in features that should be non-negative")
    print("      (centroid, spread, flatness are bins/ratios; chroma is normalized 0-1)")
    print("  (b) Percentile ordering: p25 <= p50 <= p75 must hold by definition.")
    print("      If p25 > p75, the spread computation produces a negative number — indicates")
    print("      a patch, extraction bug, or data corruption.\n")

    # Features that should never be negative
    non_negative_features = ["rms", "zcr", "centroid", "spread", "flatness"]
    # MFCCs can legitimately be negative, skip them for non-negative check
    # But ordering check applies to ALL features

    all_features_for_ordering = non_negative_features + [f"mfcc_{i}" for i in range(1, MFCC_COUNT + 1)] + [f"chroma_{i}" for i in range(1, CHROMA_COUNT + 1)]

    negative_issues: dict[str, list[tuple[str, list[float]]]] = defaultdict(list)
    ordering_issues: dict[str, list[tuple[str, list[float]]]] = defaultdict(list)
    chroma_range_issues: dict[str, list[tuple[str, list[float]]]] = defaultdict(list)

    for track in library:
        path = track.get("file", "")
        features = track.get("features", {})

        # Check non-negative features
        for feat in non_negative_features:
            triple = features.get(feat)
            if triple is None or len(triple) != 3:
                continue
            if any(v is None for v in triple):
                continue
            if any(v < 0 for v in triple):
                negative_issues[feat].append((path, list(triple)))

        # Check chroma range [0, 1]
        for i in range(1, CHROMA_COUNT + 1):
            key = f"chroma_{i}"
            triple = features.get(key)
            if triple is None or len(triple) != 3:
                continue
            if any(v is None for v in triple):
                continue
            if any(v < 0 or v > 1.01 for v in triple):
                chroma_range_issues[key].append((path, list(triple)))

        # Check percentile ordering for ALL features
        for feat in all_features_for_ordering:
            triple = features.get(feat)
            if triple is None or len(triple) != 3:
                continue
            if any(v is None for v in triple):
                continue
            p25, p50, p75 = triple
            if not (p25 <= p50 <= p75):
                ordering_issues[feat].append((path, list(triple)))

    # Report
    def print_issues(title: str, issues: dict):
        if not issues:
            print(f"  [{title}] none found\n")
            return
        total = sum(len(v) for v in issues.values())
        affected = set()
        for v in issues.values():
            for path, _ in v:
                affected.add(path)
        print(f"  [{title}] {total} issue(s) across {len(affected)} track(s):")
        for feat in sorted(issues.keys()):
            for path, values in issues[feat]:
                short_path = path.replace("./data/", "").replace("data/", "")
                values_str = "[" + ", ".join(f"{v:.4f}" for v in values) + "]"
                print(f"    {feat:<14} {short_path:<48} {values_str}")
        print()

    print_issues("negative values in non-negative features", negative_issues)
    print_issues("chroma out of [0,1] range", chroma_range_issues)
    print_issues("percentile ordering violations (p25 > p50 or p50 > p75)", ordering_issues)

    print("=" * 100)
    print("DONE")
    print("=" * 100)


if __name__ == "__main__":
    main()