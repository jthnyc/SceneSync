"""
test_mfcc_alignment.py

Regression test: verifies that Node.js extractor (Meyda) MFCC values
align with browser (Meyda) output for the same audio file.

Now that extraction runs Meyda directly in Node.js, Python is no longer
in the comparison. This script reads the Node.js-extracted feature vector
for a test track and prints its MFCC percentiles for side-by-side comparison
against browser output.

Test tracks: 019412 and 030521 (used throughout MFCC alignment diagnosis)

Usage:
    python scripts/test_mfcc_alignment.py

Run from project root (SceneSync/).

How to use:
    1. Run node scripts/extract_features.js fma first (or ensure
       scripts/feature_vectors.json is up to date)
    2. Run this script — prints MFCC p25/p50/p75 for both test tracks
    3. Drop the same files in the browser and log featureVector.mfcc_1
       through mfcc_3 from the RESULT message in the worker
    4. Compare — values should be very close (small differences are
       acceptable and expected from AudioContext vs ffmpeg decoding;
       sign flips or order-of-magnitude differences are not)
"""

import json

FEATURE_VECTORS_PATH = "scripts/feature_vectors.json"
TEST_TRACK_IDS       = [19412, 30521]  # 019412 and 030521
N_MFCC_TO_PRINT      = 3              # print first 3 coefficients — enough to catch sign flips

def track_id_from_path(filepath: str) -> int:
    filename = filepath.split("/")[-1]
    return int(filename.replace(".mp3", ""))

def run():
    print("Loading feature vectors...")
    with open(FEATURE_VECTORS_PATH, "r") as f:
        data = json.load(f)

    # Index by track ID
    track_map = {}
    for entry in data:
        try:
            tid = track_id_from_path(entry["file"])
            track_map[tid] = entry
        except Exception:
            continue

    print(f"  {len(track_map)} tracks loaded\n")

    for tid in TEST_TRACK_IDS:
        if tid not in track_map:
            print(f"⚠️  Track {tid:06d} not found in feature_vectors.json")
            print(f"   Re-run: node scripts/extract_features.js fma\n")
            continue

        entry    = track_map[tid]
        features = entry["features"]

        print(f"── Track {tid:06d}: {entry['file']} ──")
        for i in range(1, N_MFCC_TO_PRINT + 1):
            key = f"mfcc_{i}"
            p25, p50, p75 = features[key]
            print(f"  {key}: p25={p25:.2f}  p50={p50:.2f}  p75={p75:.2f}")
        print()

    print("── Next step ──")
    print("Drop each test track in the browser and open the console.")
    print("In featureExtraction.worker.ts, the RESULT message contains featureVector.")
    print("Log featureVector.mfcc_1 through mfcc_3 and compare p25/p50/p75 above.")
    print()
    print("PASS:  values are close (within ~5–10%) — AudioContext vs ffmpeg")
    print("       resampling differences are normal at this scale")
    print("FAIL:  sign flip on any coefficient, or ratio differs across coefficients")
    print("       (e.g. mfcc_1 ratio 0.98, mfcc_3 ratio -0.30) — extraction mismatch")

if __name__ == "__main__":
    run()