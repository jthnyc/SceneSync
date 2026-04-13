"""
merge_library.py
Merges curated FMA, Musopen, and YouTube feature vectors
into public/data/feature_vectors.json — the runtime library loaded by the app.
Usage:
    python scripts/merge_library.py
Run from project root (SceneSync/).
"""
import json

FMA_PATH     = "scripts/curated_fma.json"
MUSOPEN_PATH = "scripts/musopen_feature_vectors.json"
YOUTUBE_PATH = "scripts/youtube_feature_vectors.json"
OUTPUT_PATH  = "public/data/feature_vectors.json"

print("Loading FMA curated tracks...")
with open(FMA_PATH, "r") as f:
    fma = json.load(f)
print(f"  {len(fma)} FMA tracks")

print("Loading Musopen tracks...")
with open(MUSOPEN_PATH, "r") as f:
    musopen = json.load(f)
print(f"  {len(musopen)} Musopen tracks")

print("Loading YouTube tracks...")
with open(YOUTUBE_PATH, "r") as f:
    youtube = json.load(f)
print(f"  {len(youtube)} YouTube tracks")

merged = fma + musopen + youtube

with open(OUTPUT_PATH, "w") as f:
    json.dump(merged, f, indent=2)

print(f"\n✅  Merged {len(merged)} tracks → {OUTPUT_PATH}")

sources = {"FMA": len(fma), "Musopen": len(musopen), "YouTube": len(youtube)}
for source, count in sources.items():
    print(f"  {source}: {count}")