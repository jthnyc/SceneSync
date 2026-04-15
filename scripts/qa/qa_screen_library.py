"""
qa_screen_library.py — Flag tracks that look like speech, noise, or non-music.

Reads public/data/feature_vectors.json and scores each track on signals
that distinguish music from speech/noise.

Approach: z-score 6 metrics across the library, then combine them into a
composite "non-music suspiciousness" score. This catches tracks that are
moderately suspicious on multiple dimensions (e.g. spoken word that's a
little flat on chroma, a little narrow on centroid, a little monotone on
MFCCs) even if no single metric is extreme.

Metrics (all z-scored, then flipped so positive = more suspicious):
  1. Centroid IQR (low = suspicious): narrow spectral band
  2. Spread IQR (low = suspicious): narrow frequency width
  3. MFCC avg IQR (low = suspicious): flat timbral contour
  4. Spectral flatness (high = suspicious): noise-like energy
  5. Chroma activation (low = suspicious): weak pitched content
  6. Chroma variance (low = suspicious): flat pitch-class profile

Flagging:
  - Primary: composite score (sum of suspiciousness z-values) in top N
  - Secondary: any single metric with |z| > threshold gets a marker
  - Output ranks ALL tracks by composite score, highlights the top tier

The key insight: a rock track might have high spectral flatness but strong
chroma — composite score stays low. Spoken word or noise will score high
on chroma weakness AND spectral narrowness AND MFCC flatness together.

Usage:
    python scripts/qa_screen_library.py
"""

import json
import sys
import statistics
from pathlib import Path


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

LIBRARY_PATH = Path("public/data/feature_vectors.json")

# How many tracks to show in the "review by ear" list
TOP_N = 20

# Single-metric threshold for additional flag annotation
SINGLE_Z_THRESHOLD = 2.0

# Composite score threshold — tracks above this are flagged.
# Set to None to auto-flag top N instead.
COMPOSITE_THRESHOLD = None

MFCC_KEYS = [f"mfcc_{i}" for i in range(2, 14)]  # skip mfcc_1 (loudness)
CHROMA_KEYS = [f"chroma_{i}" for i in range(1, 13)]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def iqr(values: list[float]) -> float:
    """Interquartile range from [p25, p50, p75] triplet."""
    return values[2] - values[0]


def safe_median(values: list[float | None]) -> float | None:
    """p50 value, skipping nulls."""
    val = values[1]
    return val if val is not None else None


def z_scores(values: list[float]) -> list[float]:
    """Z-score a list. Returns list of same length."""
    mean = statistics.mean(values)
    stdev = statistics.pstdev(values)
    if stdev == 0:
        return [0.0] * len(values)
    return [(v - mean) / stdev for v in values]


def track_label(track: dict) -> str:
    """Human-readable label for a track."""
    if "track_id" in track:
        return f"{track['track_id']} ({track.get('genre', '?')})"
    composer = track.get("composer", "?")
    movement = track.get("movement", track.get("work", "?"))
    if len(movement) > 50:
        movement = movement[:47] + "..."
    return f"{composer} — {movement}"


# ---------------------------------------------------------------------------
# Metric extraction
# ---------------------------------------------------------------------------

def compute_metrics(track: dict) -> dict:
    """Compute the 6 screening metrics for a single track."""
    f = track["features"]

    # 1. Centroid IQR — low = narrow spectral band
    centroid_iqr = iqr(f["centroid"]) if None not in f["centroid"] else None

    # 2. Spread IQR — low = narrow frequency width
    spread_iqr = iqr(f["spread"]) if None not in f["spread"] else None

    # 3. MFCC flatness — average IQR across MFCCs 2-13
    mfcc_iqrs = []
    for key in MFCC_KEYS:
        vals = f[key]
        if None not in vals:
            mfcc_iqrs.append(iqr(vals))
    mfcc_avg_iqr = statistics.mean(mfcc_iqrs) if mfcc_iqrs else None

    # 4. Spectral flatness p50 — high = noise-like
    flatness_p50 = safe_median(f["flatness"])

    # 5. Chroma activation — mean of all 12 chroma p50 values
    chroma_p50s = []
    for key in CHROMA_KEYS:
        val = safe_median(f[key])
        if val is not None:
            chroma_p50s.append(val)
    chroma_mean_p50 = statistics.mean(chroma_p50s) if chroma_p50s else None

    # 6. Chroma variance — stdev of the 12 chroma p50 values
    chroma_stdev_p50 = (
        statistics.pstdev(chroma_p50s) if len(chroma_p50s) == 12 else None
    )

    return {
        "centroid_iqr": centroid_iqr,
        "spread_iqr": spread_iqr,
        "mfcc_avg_iqr": mfcc_avg_iqr,
        "flatness_p50": flatness_p50,
        "chroma_mean_p50": chroma_mean_p50,
        "chroma_stdev_p50": chroma_stdev_p50,
    }


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

# For each metric: direction where "more suspicious" lies.
# "low" = low values are suspicious -> negate z so positive = suspicious.
# "high" = high values are suspicious -> z stays as-is.
METRIC_DEFS = {
    "centroid_iqr":     ("low",  "Narrow spectral band"),
    "spread_iqr":       ("low",  "Narrow frequency width"),
    "mfcc_avg_iqr":     ("low",  "Flat MFCC contour"),
    "flatness_p50":     ("high", "High spectral flatness"),
    "chroma_mean_p50":  ("low",  "Low chroma activation"),
    "chroma_stdev_p50": ("low",  "Flat chroma profile"),
}


def score_tracks(tracks: list[dict]) -> list[dict]:
    """
    Compute suspiciousness scores for all tracks.
    Returns list sorted by composite score descending.
    """
    all_metrics = [compute_metrics(t) for t in tracks]

    # Z-score each metric across the library
    z_scored = [{} for _ in tracks]
    for metric_name in METRIC_DEFS:
        raw_values = [m[metric_name] for m in all_metrics]
        valid = [v for v in raw_values if v is not None]
        if not valid:
            continue
        fill_val = statistics.mean(valid)
        filled = [v if v is not None else fill_val for v in raw_values]
        zs = z_scores(filled)
        for i, z in enumerate(zs):
            z_scored[i][metric_name] = z

    # Compute composite suspiciousness score per track.
    # Flip z-scores so positive always = more suspicious, then sum.
    # Only add positive contributions — don't let strong musicality
    # on one metric cancel out suspicion on another.
    results = []
    for i, track in enumerate(tracks):
        suspicious_zs = {}
        composite = 0.0
        for metric_name, (direction, _label) in METRIC_DEFS.items():
            z = z_scored[i].get(metric_name, 0.0)
            sz = -z if direction == "low" else z
            suspicious_zs[metric_name] = sz
            if sz > 0:
                composite += sz

        results.append({
            "track": track,
            "metrics": all_metrics[i],
            "z_scores": z_scored[i],
            "suspicious_zs": suspicious_zs,
            "composite": composite,
        })

    results.sort(key=lambda r: -r["composite"])
    return results


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def print_results(results: list[dict], total: int):
    """Print ranked tracks with composite scores and flag details."""

    if COMPOSITE_THRESHOLD is not None:
        flagged = [r for r in results if r["composite"] >= COMPOSITE_THRESHOLD]
        cutoff_label = f"composite >= {COMPOSITE_THRESHOLD}"
    else:
        flagged = results[:TOP_N]
        cutoff_label = f"top {TOP_N} by composite score"

    print(f"\n{'='*72}")
    print(f"  QA Library Screen — showing {len(flagged)} of {total} tracks")
    print(f"  Ranked by composite suspiciousness score ({cutoff_label})")
    print(f"{'='*72}\n")

    # Score distribution for calibration
    all_composites = [r["composite"] for r in results]
    s = sorted(all_composites)
    print(f"  Score distribution across all {total} tracks:")
    print(f"    min={s[0]:.2f}  "
          f"p25={s[total // 4]:.2f}  "
          f"median={s[total // 2]:.2f}  "
          f"p75={s[3 * total // 4]:.2f}  "
          f"max={s[-1]:.2f}")
    print()

    for rank, r in enumerate(flagged, 1):
        label = track_label(r["track"])
        file_path = r["track"].get("file", "")
        composite = r["composite"]

        print(f"  #{rank}  {label}    composite: {composite:.2f}")
        print(f"       {file_path}")

        # Per-metric breakdown sorted by suspiciousness
        metric_details = []
        for metric_name, (_direction, short_label) in METRIC_DEFS.items():
            sz = r["suspicious_zs"][metric_name]
            raw = r["metrics"][metric_name]
            raw_str = f"{raw:.4f}" if raw is not None else "null"
            marker = " !!" if sz > SINGLE_Z_THRESHOLD else ""
            metric_details.append((sz, short_label, raw_str, marker))

        metric_details.sort(key=lambda x: -x[0])
        print(f"       Metric breakdown (positive = more suspicious):")
        for sz, short_label, raw_str, marker in metric_details:
            print(f"         {sz:+5.2f}  {short_label:<26s} raw={raw_str}{marker}")
        print()

    # Compact summary
    print(f"{'─'*72}")
    print(f"  Tracks to review by ear (ranked by suspiciousness):\n")
    for rank, r in enumerate(flagged, 1):
        label = track_label(r["track"])
        single_flags = sum(
            1 for mn in METRIC_DEFS
            if r["suspicious_zs"][mn] > SINGLE_Z_THRESHOLD
        )
        flag_note = f"  ({single_flags} strong)" if single_flags else ""
        print(
            f"    {rank:>2}. {label:<45s} "
            f"score={r['composite']:.2f}{flag_note}"
        )
    print()


# ---------------------------------------------------------------------------
# Percentile ordering validation
# ---------------------------------------------------------------------------

TRIPLE_FEATURES = (
    ["centroid", "spread", "flatness", "rms", "zcr"]
    + [f"mfcc_{i}" for i in range(1, 14)]
    + [f"chroma_{i}" for i in range(1, 13)]
)


def check_percentile_ordering(tracks: list[dict]) -> list[dict]:
    """
    Flags any track where a feature triple violates p25 <= p50 <= p75.
    Returns a list of violation dicts — empty means the library is clean.
    """
    violations = []
    for track in tracks:
        f = track["features"]
        bad_features = []
        for key in TRIPLE_FEATURES:
            triple = f.get(key)
            if not triple or None in triple:
                continue
            p25, p50, p75 = triple
            if not (p25 <= p50 <= p75):
                bad_features.append((key, triple))
        if bad_features:
            violations.append({
                "label": track_label(track),
                "file": track.get("file", ""),
                "violations": bad_features,
            })
    return violations


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if not LIBRARY_PATH.exists():
        print(
            f"Error: {LIBRARY_PATH} not found. Run from project root.",
            file=sys.stderr,
        )
        sys.exit(1)

    with open(LIBRARY_PATH) as f:
        tracks = json.load(f)

    print(f"Loaded {len(tracks)} tracks from {LIBRARY_PATH}")

    results = score_tracks(tracks)
    # Percentile ordering validation — catches NaN corruption or broken extraction
    ordering_violations = check_percentile_ordering(tracks)
    if ordering_violations:
        print(f"\n{'!'*72}")
        print(f"  ORDERING VIOLATIONS — {len(ordering_violations)} track(s) have impossible percentile values")
        print(f"  These tracks have p25 > p50 or p50 > p75 for at least one feature.")
        print(f"  Do NOT deploy this library — re-extract affected tracks.")
        print(f"{'!'*72}\n")
        for v in ordering_violations:
            print(f"  {v['label']}")
            print(f"  {v['file']}")
            for feat, triple in v['violations']:
                print(f"    {feat}: {triple}")
            print()
    else:
        print(f"\n  ✅  Percentile ordering: all {len(tracks)} tracks clean.\n")
    print_results(results, len(tracks))


if __name__ == "__main__":
    main()