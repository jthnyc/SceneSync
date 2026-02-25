"""
curate_library.py

Selects ~150 FMA tracks from scripts/feature_vectors.json for the
SceneSync royalty-free library. Uses genre metadata from tracks.csv
and acoustic diversity sampling within each genre.

Output: scripts/curated_fma.json

Usage:
    python scripts/curate_library.py

Run from project root (SceneSync/).
"""

import json
import math
import random
import pandas as pd

# ── Config ────────────────────────────────────────────────────────────────────

FEATURE_VECTORS_PATH = "scripts/feature_vectors.json"
TRACKS_CSV_PATH      = "data/fma_metadata/tracks.csv"
OUTPUT_PATH          = "scripts/curated_fma.json"
RANDOM_SEED          = 42

# Target counts per genre (FMA portion only — Musopen adds 50 orchestral later)
GENRE_TARGETS = {
    "Instrumental":  60,
    "Electronic":    40,
    "Folk":          30,
    "International": 25,
    "Rock":           9,
    "Hip-Hop":        8,
    "Pop":            8,
}
# Total: 180 — gives a small buffer so if a few tracks are duds on listening,
# you can drop them and still hit 150 after Musopen is added.

# ── Load feature vectors ───────────────────────────────────────────────────────

print("Loading feature vectors...")
with open(FEATURE_VECTORS_PATH, "r") as f:
    raw = json.load(f)

# Build a dict: track_id (int) → feature entry
# File paths look like: "./data/fma_small/135/135054.mp3"
def track_id_from_path(filepath: str) -> int:
    filename = filepath.split("/")[-1]          # "135054.mp3"
    return int(filename.replace(".mp3", ""))    # 135054

feature_map = {}
for entry in raw:
    try:
        tid = track_id_from_path(entry["file"])
        feature_map[tid] = entry
    except Exception as e:
        print(f"  Skipping malformed entry: {entry.get('file')} — {e}")

print(f"  Loaded {len(feature_map)} extracted tracks")

# ── Load genre metadata ────────────────────────────────────────────────────────

print("Loading FMA metadata...")
tracks = pd.read_csv(TRACKS_CSV_PATH, index_col=0, header=[0, 1])

# Keep only tracks that exist in our extracted feature set
genre_col = ("track", "genre_top")
subset_col = ("set", "subset")

meta = tracks[tracks.index.isin(feature_map.keys())].copy()
print(f"  {len(meta)} metadata rows match extracted tracks")

# Filter to fma_small subset only (belt-and-suspenders — already extracted from there)
if subset_col in meta.columns:
    meta = meta[meta[subset_col] == "small"]
    print(f"  {len(meta)} rows after filtering to fma_small subset")

# ── Acoustic diversity sampling ────────────────────────────────────────────────

def get_acoustic_summary(entry: dict) -> tuple:
    """
    Returns (rms_median, centroid_median, flatness_median) — the p50 value
    for energy, brightness, and texture. Used to sort tracks for diversity sampling.
    """
    f = entry["features"]
    rms_med      = f["rms"][1]
    centroid_med = f["centroid"][1]
    flatness_med = f["flatness"][1]
    return (rms_med, centroid_med, flatness_med)


def diversity_sample(track_ids: list, feature_map: dict, n: int) -> list:
    """
    Sorts tracks by a composite acoustic score (normalised RMS + centroid + flatness)
    then picks every Kth track to spread across the acoustic range.

    Why not random? Random sampling risks clustering — e.g. 40 Electronic tracks
    that all sound like the same 130bpm kick-drum loop. Evenly spaced sampling
    across a sorted acoustic axis gives you quiet/loud, bright/dark, tonal/noisy coverage.
    """
    if len(track_ids) <= n:
        return track_ids

    # Build (track_id, composite_score) list
    scored = []
    for tid in track_ids:
        if tid not in feature_map:
            continue
        rms, centroid, flatness = get_acoustic_summary(feature_map[tid])
        # Normalise each feature to [0,1] range roughly before summing
        # These are rough scale factors based on real p25/p75 distribution
        norm_rms      = rms / 0.2          # typical max ~0.2
        norm_centroid = centroid / 5000    # typical max ~5000 Hz
        norm_flatness = flatness / 0.01    # typical max ~0.01
        composite = norm_rms + norm_centroid + norm_flatness
        scored.append((tid, composite))

    # Sort by composite score (quiet+dark+tonal → loud+bright+noisy)
    scored.sort(key=lambda x: x[1])

    # Pick every Kth — evenly spaced across the sorted range
    step = len(scored) / n
    selected = [scored[math.floor(i * step)][0] for i in range(n)]
    return selected


# ── Curate per genre ───────────────────────────────────────────────────────────

print("\nCurating tracks per genre...")
curated_ids = []

for genre, target in GENRE_TARGETS.items():
    genre_tracks = meta[meta[genre_col] == genre].index.tolist()
    available = [tid for tid in genre_tracks if tid in feature_map]
    print(f"  {genre}: {len(available)} available → targeting {target}")

    if len(available) == 0:
        print(f"    ⚠️  No tracks found for {genre} — skipping")
        continue

    selected = diversity_sample(available, feature_map, target)
    print(f"    → Selected {len(selected)}")
    curated_ids.extend(selected)

print(f"\nTotal selected: {len(curated_ids)} tracks")

# ── Build output ───────────────────────────────────────────────────────────────

output = []
for tid in curated_ids:
    entry = feature_map[tid]
    # Add track_id and genre label to the entry for traceability
    genre_val = meta.loc[tid, genre_col] if tid in meta.index else "Unknown"
    output.append({
        "track_id": tid,
        "genre":    genre_val,
        "file":     entry["file"],
        "features": entry["features"],
    })

with open(OUTPUT_PATH, "w") as f:
    json.dump(output, f, indent=2)

print(f"\n✅  Saved {len(output)} tracks to {OUTPUT_PATH}")
print("\nGenre breakdown in output:")
genre_counts = {}
for entry in output:
    g = entry["genre"]
    genre_counts[g] = genre_counts.get(g, 0) + 1
for g, c in sorted(genre_counts.items(), key=lambda x: -x[1]):
    print(f"  {g}: {c}")