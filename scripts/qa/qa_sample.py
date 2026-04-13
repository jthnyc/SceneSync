"""
qa_sample.py
Randomly samples N tracks from a feature library and prints acoustic
summaries for manual listening review.

Usage:
    python scripts/qa_sample.py
    python scripts/qa_sample.py --n 20
    python scripts/qa_sample.py --seed 42
    python scripts/qa_sample.py --source scripts/curated_fma.json
    python scripts/qa_sample.py --source scripts/curated_fma.json --genre Instrumental
    python scripts/qa_sample.py --source scripts/curated_fma.json --genre Electronic --n 5
"""

import json
import random
import argparse
import os

DEFAULT_VECTORS_PATH = "./scripts/feature_vectors.json"
DEFAULT_SAMPLE_SIZE  = 10


def load_library(path: str):
    if not os.path.exists(path):
        raise FileNotFoundError(f"Could not find {path}. Has extraction run yet?")
    with open(path, "r") as f:
        return json.load(f)


def sample_tracks(library, n: int, seed: int | None):
    if seed is not None:
        random.seed(seed)
    return random.sample(library, min(n, len(library)))


def print_summary(track):
    """Print a brief acoustic summary of a track's feature vector."""
    f = track["features"]

    rms_mid      = f["rms"][1]
    centroid_mid = f["centroid"][1]
    flatness_mid = f["flatness"][1]
    zcr_mid      = f["zcr"][1]

    # Thresholds derived from actual p25/p75 distribution across 7990 tracks
    energy     = "high"   if rms_mid > 0.2268      else "low"   if rms_mid < 0.0945      else "medium"
    brightness = "bright" if centroid_mid > 2456    else "dark"  if centroid_mid < 1255    else "mid-range"
    texture    = "noisy"  if flatness_mid > 0.000301 else "tonal" if flatness_mid < 0.000015 else "mixed"
    activity   = "high"   if zcr_mid > 0.0527       else "low"   if zcr_mid < 0.0234       else "medium"

    print(f"  energy={energy}, brightness={brightness}, texture={texture}, activity={activity}")


def run(n: int, seed: int | None, source: str, genre: str | None):
    library = load_library(source)

    # Genre filter — only available when source has a "genre" field (e.g. curated_fma.json)
    if genre:
        filtered = [t for t in library if t.get("genre", "").lower() == genre.lower()]
        if not filtered:
            available = sorted(set(t.get("genre", "Unknown") for t in library))
            print(f"No tracks found for genre '{genre}'.")
            print(f"Available genres in this file: {', '.join(available)}")
            return
        print(f"Library size: {len(library)} tracks (filtered to {len(filtered)} '{genre}' tracks)")
        library = filtered
    else:
        print(f"Library size: {len(library)} tracks")

    print(f"Sampling {n} tracks for QA review...\n")

    sample = sample_tracks(library, n, seed)

    for i, track in enumerate(sample, 1):
        genre_label = f"[{track['genre']}] " if "genre" in track else ""
        print(f"[{i}/{n}] {genre_label}{track['file']}")
        print_summary(track)
        print()

    print("─" * 60)
    print("Open each file and listen. Ask yourself:")
    print("  • Is the audio clean and complete?")
    print("  • Does the acoustic summary above match what you hear?")
    print("  • Would this belong in a cinematic royalty-free library?")
    if genre:
        print(f"  • Do the {genre} tracks feel acoustically diverse (not all the same)?")
    print("\nIf the summary consistently matches what you hear, the")
    print("feature extraction pipeline is working correctly.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="QA sample tracks from feature library")
    parser.add_argument("--n",      type=int,  default=DEFAULT_SAMPLE_SIZE, help="Number of tracks to sample")
    parser.add_argument("--seed",   type=int,  default=None,                help="Random seed for reproducibility")
    parser.add_argument("--source", type=str,  default=DEFAULT_VECTORS_PATH, help="Path to feature vectors JSON (default: feature_vectors.json)")
    parser.add_argument("--genre",  type=str,  default=None,                help="Filter to a specific genre (only works with curated_fma.json)")
    args = parser.parse_args()

    run(args.n, args.seed, args.source, args.genre)