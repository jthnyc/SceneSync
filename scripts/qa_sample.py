"""
qa_sample.py
Randomly samples N tracks from feature_vectors.json and prints their
file paths for manual listening review.

Usage:
    python scripts/qa_sample.py
    python scripts/qa_sample.py --n 20
    python scripts/qa_sample.py --seed 42  # reproducible sample
"""

import json
import random
import argparse
import os

VECTORS_PATH = "./scripts/feature_vectors.json"
DEFAULT_SAMPLE_SIZE = 10


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
    energy     = "high"    if rms_mid > 0.2268  else "low"   if rms_mid < 0.0945  else "medium"
    brightness = "bright"  if centroid_mid > 2456 else "dark" if centroid_mid < 1255 else "mid-range"
    texture    = "noisy"   if flatness_mid > 0.000301 else "tonal" if flatness_mid < 0.000015 else "mixed"
    activity   = "high"    if zcr_mid > 0.0527  else "low"   if zcr_mid < 0.0234  else "medium"

    print(f"  energy={energy}, brightness={brightness}, texture={texture}, activity={activity}")


def run(n: int, seed: int | None):
    library = load_library(VECTORS_PATH)
    print(f"Library size: {len(library)} tracks")
    print(f"Sampling {n} tracks for QA review...\n")

    sample = sample_tracks(library, n, seed)

    for i, track in enumerate(sample, 1):
        print(f"[{i}/{n}] {track['file']}")
        print_summary(track)
        print()

    print("─" * 60)
    print("Open each file and listen. Ask yourself:")
    print("  • Is the audio clean and complete?")
    print("  • Does the acoustic summary above match what you hear?")
    print("  • Would this belong in a cinematic royalty-free library?")
    print("\nIf the summary consistently matches what you hear, the")
    print("feature extraction pipeline is working correctly.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="QA sample tracks from feature library")
    parser.add_argument("--n", type=int, default=DEFAULT_SAMPLE_SIZE, help="Number of tracks to sample")
    parser.add_argument("--seed", type=int, default=None, help="Random seed for reproducibility")
    args = parser.parse_args()

    run(args.n, args.seed)