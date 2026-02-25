"""
merge_library.py

Merges scripts/curated_fma.json and scripts/musopen_feature_vectors.json
into public/data/feature_vectors.json — the runtime library loaded by the app.

Usage:
    python scripts/merge_library.py

Run from project root (SceneSync/).
"""

import json

FMA_PATH     = "scripts/curated_fma.json"
MUSOPEN_PATH = "scripts/musopen_feature_vectors.json"
OUTPUT_PATH  = "public/data/feature_vectors.json"

print("Loading FMA curated tracks...")
with open(FMA_PATH, "r") as f:
    fma = json.load(f)
print(f"  {len(fma)} FMA tracks")

print("Loading Musopen tracks...")
with open(MUSOPEN_PATH, "r") as f:
    musopen = json.load(f)
print(f"  {len(musopen)} Musopen tracks")

# Normalize to the minimal shape the app expects: { file, features }
# FMA entries already have this shape (plus track_id and genre — kept for traceability)
# Musopen entries have additional metadata fields — kept for Phase 3 explanation layer
merged = fma + musopen

with open(OUTPUT_PATH, "w") as f:
    json.dump(merged, f, indent=2)

print(f"\n✅  Merged {len(merged)} tracks → {OUTPUT_PATH}")

# Summary
sources = {"FMA": len(fma), "Musopen": len(musopen)}
for source, count in sources.items():
    print(f"  {source}: {count}")